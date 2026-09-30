import { describe, expect, it, vi } from "vitest";
import { MemorySyncStore } from "@/sync/memory-store";
import { syncSecFundamentals, type SecSource } from "@/sync/sec-job";
import type { SyncSecurity } from "@/sync/store";
import { ProviderError } from "../errors";
import aaplFacts from "./__fixtures__/companyfacts-aapl.json";
import brkFacts from "./__fixtures__/companyfacts-brk.json";
import aaplSubmissions from "./__fixtures__/submissions-aapl.json";
import { SecClient } from "./client";
import { filingIndexUrl, parseSubmissions, submissionPagesSince, submissionsSchema, timingFromAcceptance } from "./parse";

describe("SEC submissions", () => {
  it("keeps periodic reports and earnings releases (8-K item 2.02) only", () => {
    const { profile, filings } = parseSubmissions(submissionsSchema.parse(aaplSubmissions));
    expect(profile).toMatchObject({ cik: "0000320193", sic: "3571", fiscalYearEnd: "0926" });
    const releases = filings.filter((f) => f.form === "8-K");
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.every((f) => f.items.includes("2.02"))).toBe(true);
    expect(filings.some((f) => f.form === "10-Q")).toBe(true);
  });

  it("derives release timing from the EDGAR acceptance time in New York", () => {
    expect(timingFromAcceptance("2026-07-30T20:30:28.000Z")).toBe("after_market"); // 16:30 EDT
    expect(timingFromAcceptance("2026-01-29T12:05:00.000Z")).toBe("before_market"); // 07:05 EST
    expect(timingFromAcceptance("2026-03-10T15:00:00.000Z")).toBe("during_market"); // 11:00 EDT
    expect(timingFromAcceptance(null)).toBeNull();
  });

  it("selects only the index pages that reach the requested date, capped", () => {
    const raw = submissionsSchema.parse({
      ...aaplSubmissions,
      filings: {
        ...aaplSubmissions.filings,
        files: [
          { name: "CIK0000000001-submissions-001.json", filingFrom: "2025-06-01", filingTo: "2025-09-01" },
          { name: "CIK0000000001-submissions-002.json", filingFrom: "2025-01-01", filingTo: "2025-05-31" },
          { name: "CIK0000000001-submissions-003.json", filingFrom: "2020-01-01", filingTo: "2020-12-31" },
        ],
      },
    });
    expect(submissionPagesSince(raw, "2025-03-01", 5)).toEqual({ pages: ["CIK0000000001-submissions-001.json", "CIK0000000001-submissions-002.json"], truncated: false });
    expect(submissionPagesSince(raw, "2019-01-01", 2).truncated).toBe(true);
  });

  it("links every value to a public filing index", () => {
    expect(filingIndexUrl("0000320193", "0000320193-25-000079")).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm");
  });
});

describe("SEC client", () => {
  it("declares a User-Agent and spaces requests (fair-access policy)", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = new SecClient({
      userAgent: "MarketRadar test contact@example.invalid",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      minIntervalMs: 200,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await Promise.all([client.companyFacts("320193"), client.submissions("320193")]);
    const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("MarketRadar test contact@example.invalid");
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
    expect(sleeps).toEqual([200]);
  });

  it("maps 403 (fair-access block) to a typed auth error and 404 to not_found", async () => {
    const blocked = new SecClient({ fetchImpl: (async () => new Response("", { status: 403 })) as unknown as typeof fetch, sleep: async () => {} });
    await expect(blocked.submissions("1")).rejects.toMatchObject({ kind: "auth" });
    const missing = new SecClient({ fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch, sleep: async () => {} });
    await expect(missing.companyFacts("1")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("SEC sync job (offline fixtures)", () => {
  const security = (ticker: string, companyId: string, cik: string | null, listingsOfIssuer = 1): SyncSecurity => ({
    securityId: `sec-${ticker}`,
    companyId,
    ticker,
    exchangeMic: "XNAS",
    currency: "USD",
    companyName: ticker,
    cik,
    isin: null,
    shareClass: null,
    isPrimary: true,
    listingsOfIssuer,
  });

  const source = (facts: unknown): SecSource => ({
    requestCount: 0,
    companyFacts: async () => facts,
    submissions: async () => aaplSubmissions,
    submissionsPage: async () => {
      throw new Error("no pages in fixture");
    },
  });

  const ctx = (store: MemorySyncStore) => ({ store, now: () => new Date("2026-09-29T08:00:00Z"), log: () => {}, scope: "test" });
  const options = { minPeriodEnd: "2023-01-01", releasesSince: "2025-01-01", maxSubmissionPages: 0 };

  it("is idempotent: running twice keeps the same rows", async () => {
    const store = new MemorySyncStore([security("AAPL", "co-aapl", "0000320193")]);
    const first = await syncSecFundamentals(ctx(store), source(aaplFacts), await store.findSecuritiesByTicker(["AAPL"]), options);
    const sizes = () => [store.statements.size, store.secFilings.size, store.coverage.size, store.shares.size];
    const afterFirst = sizes();
    await syncSecFundamentals(ctx(store), source(aaplFacts), await store.findSecuritiesByTicker(["AAPL"]), options);
    expect(sizes()).toEqual(afterFirst);
    expect(first.status).toBe("succeeded");
    expect([...store.statements.values()].some((v) => v.origin === "derived")).toBe(true);
    // FCF calculado junto a los valores reportados.
    expect([...store.statements.values()].some((v) => v.lineItem === "free_cash_flow" && v.origin === "calculated")).toBe(true);
  });

  it("does not assign issuer-level cover shares to a multi-class security", async () => {
    const store = new MemorySyncStore([security("BRK.B", "co-brk", "0001067983", 2)]);
    const report = await syncSecFundamentals(ctx(store), source(brkFacts), await store.findSecuritiesByTicker(["BRK.B"]), options);
    expect(store.shares.size).toBe(0);
    expect(report.status).toBe("succeeded");
  });

  it("reports a missing CIK as an error without writing anything", async () => {
    const store = new MemorySyncStore([security("XYZ", "co-xyz", null)]);
    const report = await syncSecFundamentals(ctx(store), source(aaplFacts), await store.findSecuritiesByTicker(["XYZ"]), options);
    expect(report.status).toBe("failed");
    expect(report.errors[0]).toMatchObject({ security: "XYZ", kind: "no_data" });
    expect(store.statements.size).toBe(0);
  });
});
