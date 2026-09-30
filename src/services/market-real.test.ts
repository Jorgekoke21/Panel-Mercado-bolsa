import { describe, expect, it } from "vitest";
import { MockMarketDataRepository } from "@/data/mock/mock-market-data";
import type { SecurityRef } from "@/data/repositories/market-data-repository";
import { RealFirstMarketDataRepository, rowToSnapshot, type SupabaseMarketDataRepository } from "@/data/supabase/supabase-market-data-repository";
import type { Tables } from "@/data/supabase/database.types";
import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { SecuritySummary } from "@/domain/reference";
import { computeBreadth } from "@/lib/calculations/breadth";
import type { GroupPerformance } from "@/lib/calculations/group-performance";
import { testSnapshot } from "@/lib/calculations/test-snapshot";
import { buildHeatmap } from "./heatmap";
import { MemoryGroupIndexRepository } from "@/data/memory/memory-group-index-repository";
import { applyGroupIndexReturns } from "./group-index-returns";
import { companyRows, groupByClassification, groupStats, type MarketRow, type Repositories } from "./market-rows";

const node = (id: string, code: string, name: string) => ({ id, taxonomyCode: "GICS", code, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
const TECH = { taxonomyCode: "GICS", sector: node("s-it", "45", "Information Technology"), industryGroup: node("g", "4510", "Software"), industry: node("i", "451030", "Software"), subIndustry: node("u", "45103010", "Application Software") };
const COMM = { taxonomyCode: "GICS", sector: node("s-cs", "50", "Communication Services"), industryGroup: node("g2", "5020", "Media"), industry: node("i2", "502030", "Interactive Media"), subIndustry: node("u2", "50203010", "Interactive Media & Services") };

function row(ticker: string, companyId: string, snapshot: Partial<SecurityMarketSnapshot> | null, extra: Partial<SecuritySummary> = {}): MarketRow {
  return {
    ticker,
    summary: {
      securityId: `s-${ticker}`,
      ticker,
      securityName: ticker,
      currency: "USD",
      shareClass: null,
      isPrimary: true,
      companyId,
      companyName: ticker,
      companySlug: ticker.toLowerCase(),
      exchange: { id: "x", mic: "XNAS", name: "Nasdaq", acronym: "Nasdaq", countryCode: "US" },
      headquarters: { city: null, region: null, countryCode: "US", countryName: "United States" },
      classification: ticker.startsWith("GOOG") || ticker === "META" ? COMM : TECH,
      ...extra,
    },
    snapshot: snapshot ? testSnapshot({ securityId: `s-${ticker}`, ...snapshot }) : null,
  };
}

// Alphabet cotiza dos clases (GOOGL principal, GOOG secundaria): breadth y equal-weight cuentan 1 compañía.
const ROWS: MarketRow[] = [
  row("MSFT", "c-msft", { price: 500, returns: { "1D": 0.01 }, marketCap: 3.7e12, marketCapStatus: "VERIFIED", rsi14: 60, ema20: 490, ema50: 480, ema200: 450 }),
  row("ORCL", "c-orcl", { price: 200, returns: { "1D": -0.02 }, marketCap: 5.6e11, marketCapStatus: "VERIFIED", rsi14: 40, ema20: 210, ema50: 190, ema200: 180 }),
  row("GOOGL", "c-goog", { price: 250, returns: { "1D": 0.03 }, marketCap: null, marketCapStatus: "MISSING", marketCapReason: "missing_shares_outstanding", rsi14: 70, ema20: 240, ema50: 230, ema200: 200, isNew52wHigh: true }, { shareClass: "A" }),
  row("GOOG", "c-goog", { price: 251, returns: { "1D": 0.031 }, marketCap: null, marketCapStatus: "MISSING", marketCapReason: "missing_shares_outstanding", rsi14: 71, ema20: 240, ema50: 230, ema200: 200, isNew52wHigh: true }, { shareClass: "C", isPrimary: false }),
  row("META", "c-meta", null),
];

describe("synthetic aggregation over real securities", () => {
  it("counts companies, not share classes, in breadth and equal-weighted returns", () => {
    expect(companyRows(ROWS).map((r) => r.ticker)).toEqual(["MSFT", "ORCL", "GOOGL", "META"]);
    const stats = groupStats(ROWS, "1D");
    expect(stats).toMatchObject({ securities: 5, companies: 4 });
    expect(stats.breadth).toMatchObject({ total: 4, advancers: 2, decliners: 1, returnCoverage: 3, new52wHighs: 1 });
    expect(stats.performance.equalWeighted["1D"]).toBeCloseTo((0.01 - 0.02 + 0.03) / 3);
    // Cap-weighted solo con capitalizaciones verificadas (Alphabet no tiene: no se inventa).
    expect(stats.performance.capWeighted["1D"]).toBeCloseTo((0.01 * 3.7e12 - 0.02 * 5.6e11) / (3.7e12 + 5.6e11));
  });

  it("breadth: % above EMA 20/50/200 with coverage, average and median RSI", () => {
    const b = computeBreadth(
      companyRows(ROWS).map((r) => ({
        return: r.snapshot?.returns["1D"] ?? null,
        price: r.snapshot?.price ?? null,
        ema20: r.snapshot?.ema20 ?? null,
        ema50: r.snapshot?.ema50 ?? null,
        ema200: r.snapshot?.ema200 ?? null,
        rsi14: r.snapshot?.rsi14 ?? null,
        isNew52wHigh: r.snapshot?.isNew52wHigh ?? false,
        isNew52wLow: false,
      })),
    );
    expect(b.pctAboveEma20).toBeCloseTo(2 / 3);
    expect(b.pctAboveEma200).toBe(1);
    expect(b.emaCoverage.ema20).toBe(3);
    expect(b.averageRsi14).toBeCloseTo((60 + 40 + 70) / 3);
    expect(b.medianRsi14).toBe(60);
  });

  it("sector groups aggregate their own members", () => {
    const groups = groupByClassification(ROWS, "sector", "1D");
    expect(groups.map((g) => [g.name, g.stats.companies, g.stats.securities])).toEqual([
      ["Information Technology", 2, 2],
      ["Communication Services", 2, 3],
    ]);
  });

  it("heatmap sizes only by verified market cap and lists every excluded security with its reason", () => {
    const heatmap = buildHeatmap(ROWS, "1D", "sector", () => null);
    expect(heatmap.sizeLabel).toBe("Verified market cap");
    expect(heatmap.groups.flatMap((g) => g.cells.map((c) => c.label))).toEqual(["MSFT", "ORCL"]);
    expect(heatmap.excluded).toEqual([
      { ticker: "GOOGL", reason: "missing_shares_outstanding" },
      { ticker: "GOOG", reason: "missing_shares_outstanding" },
      { ticker: "META", reason: "missing_price" },
    ]);
  });
});

describe("real market data repository", () => {
  const snapshotRow = (overrides: Partial<Tables<"security_market_snapshots">> = {}): Tables<"security_market_snapshots"> =>
    ({
      security_id: "s-MSFT",
      series_id: 1,
      source: "alpaca",
      as_of_date: "2026-09-28",
      bar_count: 1945,
      first_date: "2019-01-02",
      close: 500,
      previous_close: 495,
      volume: 1000,
      return_1d: 0.0101,
      return_1w: null,
      return_1m: null,
      return_3m: null,
      return_6m: null,
      return_ytd: 0.1,
      return_1y: null,
      return_3y: null,
      return_5y: null,
      sma20: 1, sma50: 1, sma200: 1, ema20: 1, ema50: 1, ema200: 1,
      rsi14: 55,
      macd: 1, macd_signal: 1, macd_histogram: 0,
      atr14: 5,
      average_volume20: 900,
      relative_volume: 1.11,
      average_dollar_volume20: 450000,
      high_52w: 520,
      low_52w: 380,
      is_new_52w_high: false,
      is_new_52w_low: false,
      market_cap: 3.7e12,
      market_cap_status: "UNVERIFIED",
      market_cap_reason: "shares_outstanding_stale",
      market_cap_shares: 7.4e9,
      market_cap_shares_as_of: "2025-01-01",
      computed_at: "2026-09-29T07:00:00Z",
      ...overrides,
    }) as Tables<"security_market_snapshots">;

  it("maps a stored snapshot and never exposes an unverified market cap", () => {
    const s = rowToSnapshot(snapshotRow(), "USD");
    expect(s).toMatchObject({ price: 500, asOfDate: "2026-09-28", marketCap: null, marketCapStatus: "UNVERIFIED", marketCapReason: "shares_outstanding_stale", rsi14: 55 });
    expect(s.returns).toMatchObject({ "1D": 0.0101, YTD: 0.1, "5Y": null });
    expect(rowToSnapshot(snapshotRow({ market_cap_status: "VERIFIED" }), "USD").marketCap).toBe(3.7e12);
  });

  it("uses real data when any exists (PARTIAL coverage, no simulated fill) and full DEMO only when none exists", async () => {
    const refs: SecurityRef[] = [
      { securityId: "s-MSFT", ticker: "MSFT", currency: "USD" },
      { securityId: "s-META", ticker: "META", currency: "USD" },
    ];
    const partial = {
      getRealSnapshots: async () => ({
        data: new Map([["s-MSFT", rowToSnapshot(snapshotRow(), "USD")]]),
        provenance: { source: "alpaca", sourceLabel: "Alpaca (SIP)", asOf: "2026-09-28", isDelayed: true, isDemo: false, frequency: "eod" as const, coverage: { covered: 1, total: 2 } },
      }),
      getStatus: async () => ({ realSecurities: 1, asOf: "2026-09-28", sourceLabel: "Alpaca (SIP)" }),
    } as unknown as SupabaseMarketDataRepository;
    const repo = new RealFirstMarketDataRepository(partial, new MockMarketDataRepository());
    const real = await repo.getSnapshots(refs);
    expect(real.provenance).toMatchObject({ isDemo: false, coverage: { covered: 1, total: 2 } });
    expect(real.data.has("s-META")).toBe(false);

    const empty = { getRealSnapshots: async () => null } as unknown as SupabaseMarketDataRepository;
    const demo = await new RealFirstMarketDataRepository(empty, new MockMarketDataRepository()).getSnapshots(refs);
    expect(demo.provenance.isDemo).toBe(true);
    expect(demo.data.size).toBe(2);
    // Benchmarks (índices, VIX, DXY, materias primas, tipos): sin fuente gratuita ⇒ DEMO explícito.
    expect((await repo.getBenchmarkQuotes([])).provenance.isDemo).toBe(true);
  });
});

describe("group returns from synthetic indices", () => {
  it("replaces snapshot-weighted aggregates (look-ahead) by index returns when a series exists", async () => {
    const points = [
      { time: "2025-09-26", value: 100 },
      { time: "2026-09-25", value: 120 },
      { time: "2026-09-28", value: 123 },
    ];
    const repos = {
      groupIndices: new MemoryGroupIndexRepository([
        { kind: "sector", key: "s-it", method: "cap_weight", points, membersTotal: 2, membersLast: 2, computedAt: "x" },
        { kind: "sector", key: "s-it", method: "equal_weight", points: points.map((p) => ({ ...p, value: p.value * 2 })), membersTotal: 2, membersLast: 2, computedAt: "x" },
      ]),
    } as unknown as Repositories;
    const performance: GroupPerformance = { count: 2, marketCap: { kind: "empty" }, capWeighted: { "1Y": 0.91 }, equalWeighted: { "1Y": 0.5 } };
    const untouched: GroupPerformance = { count: 1, marketCap: { kind: "empty" }, capWeighted: { "1Y": 0.2 }, equalWeighted: {} };
    await applyGroupIndexReturns(repos, [
      { kind: "sector", key: "s-it", performance },
      { kind: "industry", key: "none", performance: untouched },
    ]);
    expect(performance.capWeighted["1Y"]).toBeCloseTo(0.23);
    expect(performance.capWeighted["1D"]).toBeCloseTo(123 / 120 - 1);
    expect(performance.equalWeighted["1Y"]).toBeCloseTo(0.23);
    expect(untouched.capWeighted["1Y"]).toBe(0.2);
  });
});
