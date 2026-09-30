import { describe, expect, it, vi } from "vitest";
import { EodhdAdapter } from "@/providers/eodhd/adapter";
import { EodhdClient } from "@/providers/eodhd/client";
import { EODHD_USER_FREE, EODHD_USER_PAID_SYNTHETIC } from "@/providers/eodhd/__fixtures__/user";
import { classifyPilot } from "./pilot-matrix";
import { evaluatePreflight, renderPreflight, runPreflight } from "./preflight";

const NOW = new Date("2026-09-29T08:00:00Z");

/** Cliente EODHD con respuestas simuladas por ruta. Registra las rutas pedidas (sin red). */
function adapterWith(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api", "");
    calls.push(path);
    const route = Object.entries(routes).find(([prefix]) => path.startsWith(prefix));
    if (!route) return new Response("not mocked", { status: 500 });
    return route[1]();
  });
  const client = new EodhdClient({ token: "test-token-000000", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, maxRetries: 0 });
  return { adapter: new EodhdAdapter(client), calls };
}

const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

describe("provider preflight", () => {
  it("FREE → BLOCKED_BY_PROVIDER_PLAN using only /user (no data calls)", async () => {
    const { adapter, calls } = adapterWith({ "/user": json(EODHD_USER_FREE) });
    const report = await runPreflight(adapter, { now: NOW, requiredCredits: 65, probe: true });
    expect(calls).toEqual(["/user"]);
    expect(report).toMatchObject({
      authentication: "PASS",
      subscription: "free",
      dailyLimit: 20,
      extraLimit: 500,
      callsUsed: 0,
      eodFullHistory: "NOT_AVAILABLE",
      fundamentals: "NOT_AVAILABLE",
      pilotReady: false,
      status: "BLOCKED_BY_PROVIDER_PLAN",
    });
    const text = renderPreflight(report);
    expect(text).toContain("Subscription: FREE");
    expect(text).toContain("Fundamentals: NOT AVAILABLE");
    expect(text).toContain("Required for pilot 5/5: NOT READY");
    expect(text).toContain("PILOT STATUS: BLOCKED_BY_PROVIDER_PLAN");
  });

  it("compatible paid plan → READY after a minimal capability probe", async () => {
    const { adapter, calls } = adapterWith({
      "/user": json(EODHD_USER_PAID_SYNTHETIC),
      "/eod/": json([{ date: "2020-09-29", open: 1, high: 1, low: 1, close: 1, adjusted_close: 1, volume: 1 }]),
      "/fundamentals/": json({ General: { Code: "AAPL", CIK: "0000320193" } }),
    });
    const report = await runPreflight(adapter, { now: NOW, requiredCredits: 65, probe: true });
    expect(report).toMatchObject({ status: "READY", pilotReady: true, eodFullHistory: "AVAILABLE", fundamentals: "AVAILABLE" });
    expect(calls).toEqual(["/user", "/eod/AAPL.US", "/fundamentals/AAPL.US"]);
    expect(renderPreflight(report)).toContain("PILOT STATUS: READY");
  });

  it("paid plan without fundamentals (403) → BLOCKED_BY_PROVIDER_PLAN", async () => {
    const { adapter } = adapterWith({
      "/user": json(EODHD_USER_PAID_SYNTHETIC),
      "/eod/": json([{ date: "2020-09-29", open: 1, high: 1, low: 1, close: 1, volume: 1 }]),
      "/fundamentals/": () => new Response("Forbidden", { status: 403 }),
    });
    const report = await runPreflight(adapter, { now: NOW, requiredCredits: 65, probe: true });
    expect(report).toMatchObject({ status: "BLOCKED_BY_PROVIDER_PLAN", fundamentals: "NOT_AVAILABLE", eodFullHistory: "AVAILABLE" });
  });

  it("history truncated by plan (no old bars) → BLOCKED", async () => {
    const { adapter } = adapterWith({
      "/user": json(EODHD_USER_PAID_SYNTHETIC),
      "/eod/": json([]),
      "/fundamentals/": json({ General: { Code: "AAPL" } }),
    });
    expect((await runPreflight(adapter, { now: NOW, requiredCredits: 65, probe: true })).eodFullHistory).toBe("NOT_AVAILABLE");
  });

  it("invalid token → authentication FAIL", async () => {
    const { adapter } = adapterWith({ "/user": () => new Response("Unauthenticated", { status: 401 }) });
    const report = await runPreflight(adapter, { now: NOW, requiredCredits: 65, probe: true });
    expect(report).toMatchObject({ authentication: "FAIL", status: "BLOCKED_BY_AUTH" });
    expect(report.notes.join(" ")).not.toContain("test-token-000000");
  });

  it("unknown plan without probe → NEEDS_PROBE; insufficient quota → BLOCKED_BY_QUOTA", () => {
    const account = { subscriptionType: "monthly", requestsToday: 0, dailyLimit: 100000, extraLimit: 0, date: "2026-09-29" };
    expect(evaluatePreflight({ provider: "EODHD", account, authError: null, probe: null, requiredCredits: 65 }).status).toBe("NEEDS_PROBE");
    const probe = { eodFullHistory: "AVAILABLE" as const, fundamentals: "AVAILABLE" as const, creditsSpent: 11, notes: [] };
    const tight = { ...account, dailyLimit: 100, requestsToday: 60 };
    expect(evaluatePreflight({ provider: "EODHD", account: tight, authError: null, probe, requiredCredits: 65 }).status).toBe("BLOCKED_BY_QUOTA");
  });
});

describe("pilot matrix", () => {
  const facts = {
    identifier: { symbol: "AAPL.US", verified: true },
    prices: { count: 1945, first: "2019-01-02", last: "2026-09-28" },
    today: "2026-09-29",
    required5yStart: "2021-09-28",
    splits: 1,
    dividends: 31,
    unsupportedActions: 0,
    shares: { lastPeriodEnd: "2026-06-30", current: "2026-09-27" },
    marketCap: { status: "VERIFIED" as const, reason: "consistent_with_provider_market_cap" },
    fundamentals: { expected: 13, present: 13, fcfDivergences: 0 },
    earnings: { events: 132 },
    valuation: { providerMetrics: 10 },
    reconciliation: { compared: 1945, maxDeviation: 0.00001 },
    factors: 36,
  };

  it("classifies a healthy security as PASS everywhere", () => {
    expect(Object.values(classifyPilot(facts)).every((c) => c.status === "PASS")).toBe(true);
  });

  it("uses WARNING for unverified market cap / divergences, MISSING for provider gaps, FAIL for pipeline gaps", () => {
    const m = classifyPilot({
      ...facts,
      identifier: { symbol: "BRK-B.US", verified: false },
      marketCap: { status: "UNVERIFIED", reason: "multi_class_share_scope_unverified" },
      fundamentals: { expected: 13, present: 13, fcfDivergences: 2 },
      valuation: { providerMetrics: 0 },
      reconciliation: { compared: 100, maxDeviation: 0.05 },
    });
    expect(m["Market cap"].status).toBe("WARNING");
    expect(m.Fundamentals.status).toBe("WARNING");
    expect(m.Valuation.status).toBe("MISSING");
    expect(m["CIK verification"].status).toBe("FAIL");
    expect(m["Adjusted series"].status).toBe("FAIL");
  });
});
