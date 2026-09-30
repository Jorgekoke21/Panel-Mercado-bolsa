import { describe, expect, it } from "vitest";
import aaplFacts from "@/providers/sec/__fixtures__/companyfacts-aapl.json";
import jpmFacts from "@/providers/sec/__fixtures__/companyfacts-jpm.json";
import orlyFacts from "@/providers/sec/__fixtures__/companyfacts-orly.json";
import { industryTemplate, requiredConcepts } from "@/providers/sec/concepts";
import { normalizeCompanyFacts } from "@/providers/sec/normalize";
import { companyFactsSchema, flattenCompanyFacts } from "@/providers/sec/parse";
import { buildFundamentalSnapshot, type FundamentalSnapshot, SNAPSHOT_METRICS, summarizeGroupFundamentals } from "./fundamental-snapshot";
import { atr, macd } from "./indicators";

type FundamentalSnapshotMetrics = FundamentalSnapshot["metrics"];
import type { MarketCapCheck } from "./market-cap";
import { computeRatios, type RatioId } from "./ratios";

function statements(raw: unknown, sic: number) {
  const { facts } = flattenCompanyFacts(companyFactsSchema.parse(raw), requiredConcepts());
  return normalizeCompanyFacts(facts, { template: industryTemplate(sic), minPeriodEnd: "2023-01-01" }).values;
}

const verified = (value: number): MarketCapCheck => ({ status: "VERIFIED", reason: "consistent_with_weighted_average_shares", calculated: value, providerReference: null, deviation: 0.01 });
const byId = (r: ReturnType<typeof computeRatios>, id: RatioId) => r.find((x) => x.id === id);

describe("ratios from SEC filings (AAPL)", () => {
  const values = statements(aaplFacts, 3571);
  const ratios = computeRatios({
    template: "general",
    statements: values,
    origins: ["reported", "derived"],
    price: { value: 250, date: "2026-09-28" },
    marketCap: verified(3.7e12),
    dividendsTtmPerShare: 1.04,
  });

  it("computes P/E, P/S and FCF yield from TTM sums of four consecutive quarters", () => {
    const pe = byId(ratios, "pe");
    expect(pe?.status).toBe("ok");
    expect(pe?.inputs.join(" ")).toMatch(/TTM to 2026-06-27/);
    expect(byId(ratios, "ps")?.status).toBe("ok");
    expect(byId(ratios, "fcf_yield")?.value).toBeGreaterThan(0);
    expect(byId(ratios, "dividend_yield")?.value).toBeCloseTo(1.04 / 250);
  });

  it("computes margins, ROE, ROIC and growth without any price", () => {
    const noPrice = computeRatios({ template: "general", statements: values, origins: ["reported", "derived"], price: null, marketCap: null, dividendsTtmPerShare: null });
    for (const id of ["gross_margin", "operating_margin", "net_margin", "roic", "revenue_growth"] as RatioId[]) expect(byId(noPrice, id)?.status).toBe("ok");
    expect(byId(noPrice, "gross_margin")?.value).toBeGreaterThan(0.4);
    // Sin precio: los múltiplos quedan "missing" con motivo, nunca un número.
    expect(byId(noPrice, "pe")).toMatchObject({ status: "missing", value: null });
    expect(byId(noPrice, "dividend_yield")?.reason).toMatch(/price/);
  });

  it("never computes multiples on an unverified market cap", () => {
    const r = computeRatios({
      template: "general",
      statements: values,
      origins: ["reported", "derived"],
      price: { value: 250, date: "2026-09-28" },
      marketCap: { status: "UNVERIFIED", reason: "multi_class_share_scope_unverified", calculated: 1e12, providerReference: null, deviation: null },
      dividendsTtmPerShare: 0,
    });
    for (const id of ["market_cap", "pe", "ps", "pb", "enterprise_value", "ev_ebitda", "fcf_yield"] as RatioId[]) {
      expect(byId(r, id)).toMatchObject({ status: "unverified", value: null });
    }
  });
});

describe("ratios: industry templates and edge cases", () => {
  it("JPM: EV, EV/EBITDA, FCF yield and ROIC are not applicable to a bank", () => {
    const r = computeRatios({ template: "financial", statements: statements(jpmFacts, 6021), origins: ["reported", "derived"], price: null, marketCap: verified(8e11), dividendsTtmPerShare: null });
    for (const id of ["enterprise_value", "ev_ebitda", "fcf_yield", "roic", "gross_margin"] as RatioId[]) expect(byId(r, id)?.status).toBe("not_applicable");
    expect(byId(r, "pb")?.status).toBe("ok");
    expect(byId(r, "roe")?.status).toBe("ok");
  });

  it("ORLY: negative equity makes P/B and ROE not meaningful, never negative multiples", () => {
    const r = computeRatios({ template: "general", statements: statements(orlyFacts, 5531), origins: ["reported", "derived"], price: null, marketCap: verified(8e10), dividendsTtmPerShare: 0 });
    expect(byId(r, "pb")).toMatchObject({ status: "not_meaningful", value: null });
    expect(byId(r, "roe")).toMatchObject({ status: "not_meaningful", value: null });
    expect(byId(r, "pe")?.status).toBe("ok");
  });
});

describe("MACD and ATR", () => {
  it("MACD line is EMA12 − EMA26, signal is its EMA9, histogram the difference", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const m = macd(closes);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).not.toBeNull();
    expect(m.signal[25 + 7]).toBeNull();
    expect(m.signal[25 + 8]).not.toBeNull();
    const last = closes.length - 1;
    expect(m.histogram[last]).toBeCloseTo((m.macd[last] as number) - (m.signal[last] as number));
    // Tendencia lineal: MACD positivo y estable.
    expect(m.macd[last]).toBeGreaterThan(0);
  });

  it("ATR (Wilder) equals the constant true range for constant bars and uses the previous close for gaps", () => {
    const flat = Array.from({ length: 20 }, () => ({ high: 11, low: 9, close: 10 }));
    expect(atr(flat, 14)[14]).toBeCloseTo(2);
    expect(atr(flat, 14)[13]).toBeNull();
    const gap = [...flat.slice(0, 15), { high: 16, low: 15, close: 15.5 }];
    // TR del gap = max(1, |16 − 10|, |15 − 10|) = 6 ⇒ ATR = (2 × 13 + 6) / 14.
    expect(atr(gap, 14)[15]).toBeCloseTo((2 * 13 + 6) / 14);
  });
});

describe("fundamental snapshots and group medians", () => {
  it("materializes only 'ok' metrics; not applicable / not meaningful stay null", () => {
    const aapl = buildFundamentalSnapshot(statements(aaplFacts, 3571), "general");
    expect(aapl.revenueTtm).toBeGreaterThan(0);
    expect(aapl.metrics.gross_margin).toBeGreaterThan(0.4);
    const jpm = buildFundamentalSnapshot(statements(jpmFacts, 6021), "financial");
    expect(jpm.metrics.gross_margin).toBeNull();
    expect(jpm.metrics.roic).toBeNull();
    const orly = buildFundamentalSnapshot(statements(orlyFacts, 5531), "general");
    expect(orly.metrics.roe).toBeNull();
  });

  it("uses medians over issuers with data and reports coverage n/N", () => {
    const snap = (net: number | null) => ({ template: "general" as const, asOfPeriodEnd: "2026-06-30", revenueTtm: 1, netIncomeTtm: 1, metrics: { ...Object.fromEntries(SNAPSHOT_METRICS.map((m) => [m, null])), net_margin: net } as FundamentalSnapshotMetrics });
    const stats = summarizeGroupFundamentals([snap(0.1), snap(0.3), snap(0.2), snap(null), null]);
    expect(stats.find((s) => s.metric === "net_margin")).toEqual({ metric: "net_margin", median: 0.2, count: 3, total: 5 });
    expect(stats.find((s) => s.metric === "roe")).toMatchObject({ median: null, count: 0, total: 5 });
  });

  it("dividend yield: foreign-issuer dividends (possibly net of withholding) make it UNVERIFIED; specials are excluded and stated", () => {
    const price = { value: 200, date: "2026-09-28" };
    const base = { template: "general" as const, statements: [], origins: ["reported", "derived"] as const, price, marketCap: null };
    const foreign = computeRatios({ ...base, origins: [...base.origins], dividendsTtmPerShare: { perShare: 0, foreignExcluded: 4, specialExcluded: 0 } }).find((r) => r.id === "dividend_yield");
    expect(foreign).toMatchObject({ status: "unverified", reason: expect.stringMatching(/net of withholding/) });
    const special = computeRatios({ ...base, origins: [...base.origins], dividendsTtmPerShare: { perShare: 4, foreignExcluded: 0, specialExcluded: 1 } }).find((r) => r.id === "dividend_yield");
    expect(special).toMatchObject({ status: "ok", value: 0.02 });
    expect(special?.inputs).toContain("1 special dividend(s) excluded");
  });
});
