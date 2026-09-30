import { describe, expect, it } from "vitest";
import type { CorporateAction } from "@/domain/corporate-actions";
import type { DailyBar } from "@/domain/prices";
import { ProviderError } from "@/providers/errors";
import { eodhdSymbology } from "@/providers/eodhd/symbology";
import type { DateRange, ProviderAdapter, ProviderSymbol } from "@/providers/ports";
import { selectAdapter } from "@/providers/registry";
import { alpacaSymbology } from "@/providers/alpaca/adapter";
import {
  analyzePriceSeries,
  dropLeadingPlaceholders,
  computeFactors,
  resolveTargets,
  type SeriesOutcome,
  type SyncContext,
  syncCorporateActions,
  syncDailyPrices,
  syncFundamentals,
  syncMarketCalendar,
} from "./jobs";
import { MemorySyncStore } from "./memory-store";
import type { SyncSecurity } from "./store";

const SECURITIES: SyncSecurity[] = [
  { securityId: "sec-aapl", companyId: "co-aapl", ticker: "AAPL", exchangeMic: "XNAS", currency: "USD", companyName: "Apple Inc.", cik: "0000320193", isin: null, shareClass: null, isPrimary: true, listingsOfIssuer: 1 },
  { securityId: "sec-brkb", companyId: "co-brk", ticker: "BRK.B", exchangeMic: "XNYS", currency: "USD", companyName: "Berkshire Hathaway", cik: "0001067983", isin: null, shareClass: null, isPrimary: true, listingsOfIssuer: 1 },
];

const bar = (tradeDate: string, close: number): DailyBar => ({ tradeDate, open: close, high: close, low: close, close, volume: 100, providerAdjustedClose: close });

interface FakeOptions {
  cik?: Record<string, string>;
  failPricesFor?: string;
  bars?: DailyBar[];
  splits?: CorporateAction[];
}

/** Adaptador falso con la misma superficie que EodhdAdapter. Registra las llamadas. */
function fakeAdapter(options: FakeOptions = {}) {
  const calls: string[] = [];
  let bars = options.bars ?? [bar("2026-09-24", 10), bar("2026-09-25", 11), bar("2026-09-28", 12)];
  const adapter: ProviderAdapter & { requestCount: number; calls: string[]; setBars(b: DailyBar[]): void } = {
    id: "eodhd",
    label: "Fake",
    capabilities: ["profile", "price_history", "corporate_actions", "fundamentals", "earnings", "valuation"],
    coverage: { exchanges: ["XNAS", "XNYS"] },
    costModel: { creditsPerCall: { price_history: 1, corporate_actions: 1, fundamentals: 10 }, dailyLimit: null, perMinuteLimit: null },
    datasets: { price_history: "p", corporate_actions: "c", fundamentals: "f" },
    requestCount: 0,
    calls,
    setBars(b) {
      bars = b;
    },
    profile: {
      async getProfile(s: ProviderSymbol) {
        calls.push(`profile ${s.symbol}`);
        const cik = options.cik?.[s.symbol] ?? { "AAPL.US": "0000320193", "BRK-B.US": "0001067983" }[s.symbol] ?? null;
        return { providerCode: s.symbol, name: s.symbol, cik } as never;
      },
    },
    fundamentals: {
      async getFundamentals() {
        return {
          asOf: "2026-09-27",
          statements: [
            { lineItem: "revenue", periodType: "quarterly", fiscalPeriodEnd: "2026-06-30", filingDate: null, currency: "USD", origin: "provider", value: 5, missingReason: null, sourceField: "x" },
          ],
          shares: [{ asOfDate: "2026-06-30", shares: 100, basis: "period_end", sourceField: "x" }],
          warnings: [],
        };
      },
    },
    earnings: {
      async getEarnings() {
        return {
          asOf: "2026-09-27",
          events: [{ fiscalPeriodEnd: "2026-06-30", reportDate: "2026-07-30", timing: "after_market", providerEpsActual: 1, providerEpsEstimate: 0.9, providerEpsSurprise: 0.1, providerEpsSurprisePercent: 11.1, epsBasis: "unspecified", currency: "USD" }],
          estimates: [],
        };
      },
    },
    valuation: {
      async getValuation() {
        return { asOf: "2026-09-27", values: [{ metric: "pe_forward", value: 30, origin: "provider", method: "Valuation.ForwardPE" }] };
      },
    },
    priceHistory: {
      async getDailyBars(s: ProviderSymbol, range: DateRange) {
        calls.push(`eod ${s.symbol} ${range.from}`);
        adapter.requestCount++;
        if (options.failPricesFor === s.symbol) throw new ProviderError("rate_limited", "eodhd", `/eod/${s.symbol}`, "Too Many Requests");
        return { bars: bars.filter((b) => b.tradeDate >= range.from), volumeBasis: "split_adjusted", priceCurrency: null, issues: [] };
      },
    },
    corporateActions: {
      async getSplits() {
        return { actions: options.splits ?? [], issues: [] };
      },
      async getDividends() {
        return {
          actions: [
            { kind: "cash_dividend", exDate: "2026-09-25", amount: 0.5, currency: "USD", providerAdjustedAmount: 0.5, declarationDate: null, recordDate: null, paymentDate: null, frequency: "Quarterly" },
            { kind: "unsupported", type: "special_dividend", exDate: "2026-09-25", reason: "Special dividend", amount: 3, currency: "USD", providerLabel: "Special" },
          ],
          issues: [],
        };
      },
    },
  };
  return adapter;
}

let clock = Date.parse("2026-09-29T06:00:00Z");
const ctxFor = (adapter: ReturnType<typeof fakeAdapter>, store: MemorySyncStore): SyncContext => ({
  adapter,
  store,
  now: () => new Date(clock),
  log: () => {},
  scope: "test",
});

async function runAll(ctx: SyncContext, tickers = ["AAPL", "BRK.B"]) {
  const { targets } = await resolveTargets(ctx, eodhdSymbology, tickers);
  const reports = [await syncFundamentals(ctx, targets), await syncDailyPrices(ctx, targets), await syncCorporateActions(ctx, targets), await computeFactors(ctx, targets)];
  return { targets, reports };
}

const sizes = (s: MemorySyncStore) => ({
  identifiers: s.identifiers.size,
  prices: s.dailyPrices.size,
  actions: s.corporateActions.size,
  factors: s.factors.size,
  shares: s.shares.size,
  statements: s.statements.size,
  earnings: s.earningsEvents.size,
  valuations: s.valuations.size,
});

describe("symbol resolution", () => {
  it("proposes EODHD symbols from the central rule without touching the canonical ticker", () => {
    expect(eodhdSymbology.toProviderSymbol({ ticker: "AAPL", exchangeMic: "XNAS" })).toEqual({ symbol: "AAPL.US", exchangeCode: "US" });
    expect(eodhdSymbology.toProviderSymbol({ ticker: "BRK.B", exchangeMic: "XNYS" })).toEqual({ symbol: "BRK-B.US", exchangeCode: "US" });
    expect(eodhdSymbology.toProviderSymbol({ ticker: "7203", exchangeMic: "XTKS" })).toBeNull();
  });

  it("stores the identifier once and afterwards always reads it from security_identifiers", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const ctx = ctxFor(fakeAdapter(), store);
    const first = await resolveTargets(ctx, eodhdSymbology, ["BRK.B", "AAPL", "ZZZZ"]);
    expect(first.targets.map((t) => `${t.security.ticker}→${t.symbol.symbol}`)).toEqual(["BRK.B→BRK-B.US", "AAPL→AAPL.US"]);
    expect(first.unresolved).toEqual([expect.objectContaining({ security: "ZZZZ", kind: "not_found" })]);
    // Corrección manual en la tabla: gana sobre la regla.
    const brk = store.identifiers.get("eodhd:sec-brkb");
    if (brk) Object.assign(brk, { symbol: "BRK-B.NYSE", source: "manual" });
    const second = await resolveTargets(ctx, eodhdSymbology, ["BRK.B"]);
    expect(second.targets[0]?.symbol.symbol).toBe("BRK-B.NYSE");
    expect(store.identifiers.size).toBe(2);
  });

  it("selects a provider by capability and exchange (room for a second provider)", () => {
    const eodhd = fakeAdapter();
    const japan = { ...fakeAdapter(), id: "jp", coverage: { exchanges: ["XTKS"] } };
    expect(selectAdapter([eodhd, japan], "price_history", "XNAS")?.id).toBe("eodhd");
    expect(selectAdapter([eodhd, japan], "price_history", "XTKS")?.id).toBe("jp");
    expect(selectAdapter([eodhd], "quotes", "XNAS")).toBeNull();
  });
});

describe("sync idempotency", () => {
  it("running every job twice does not duplicate prices, actions, fundamentals or earnings", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAdapter();
    const ctx = ctxFor(adapter, store);
    await runAll(ctx);
    const afterFirst = sizes(store);
    // statements: 1 revenue del proveedor + eps_basic/eps_diluted calculados (NULL con motivo) por empresa.
    expect(afterFirst).toMatchObject({ identifiers: 2, prices: 6, actions: 4, statements: 6, earnings: 2, valuations: 2 });
    const calculated = [...store.statements.values()].filter((v) => v.origin === "calculated");
    expect(calculated.every((v) => v.value === null && v.missingReason === "provider_missing_weighted_average_shares")).toBe(true);
    clock += 3_600_000;
    const { reports } = await runAll(ctx);
    expect(sizes(store)).toEqual(afterFirst);
    expect(reports.every((r) => r.status === "succeeded")).toBe(true);
    expect(store.runs.size).toBe(8);
  });

  it("second price sync is incremental from the cursor (with overlap), not a full reload", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAdapter();
    const ctx = ctxFor(adapter, store);
    await runAll(ctx, ["AAPL"]);
    await runAll(ctx, ["AAPL"]);
    const eodCalls = adapter.calls.filter((c) => c.startsWith("eod"));
    expect(eodCalls[0]).toBe("eod AAPL.US 2019-01-01");
    expect(eodCalls[1]).toBe("eod AAPL.US 2026-09-18");
  });

  it("keeps unsupported corporate actions visible (stored and warned), never dropped", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const ctx = ctxFor(fakeAdapter(), store);
    const { reports } = await runAll(ctx, ["AAPL"]);
    expect([...store.corporateActions.values()].some((a) => a.kind === "unsupported" && a.type === "special_dividend")).toBe(true);
    const actionsRun = reports.find((r) => r.jobType === "corporate_actions");
    expect(actionsRun?.warnings).toEqual([expect.objectContaining({ kind: "unsupported_action" })]);
  });

  it("a split that postdates stored bars schedules a full price reload (provider volume is split-adjusted)", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAdapter();
    const ctx = ctxFor(adapter, store);
    await runAll(ctx, ["AAPL"]);
    const splitCtx = ctxFor(fakeAdapter({ splits: [{ kind: "split", exDate: "2026-10-05", toShares: 2, fromShares: 1 }] }), store);
    clock = Date.parse("2026-10-06T06:00:00Z");
    const { targets } = await resolveTargets(splitCtx, eodhdSymbology, ["AAPL"]);
    const report = await syncCorporateActions(splitCtx, targets);
    expect(report.warnings.some((w) => w.kind === "full_refresh_scheduled")).toBe(true);
    expect((await store.getCursor("eodhd", "daily_prices", "sec-aapl"))?.fullRefreshRequired).toBe(true);
    clock = Date.parse("2026-09-29T06:00:00Z");
  });
});

describe("provider errors in sync", () => {
  it("records a provider failure as an error (partial run) and writes nothing for that security", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const ctx = ctxFor(fakeAdapter({ failPricesFor: "BRK-B.US" }), store);
    const { reports } = await runAll(ctx);
    const prices = reports.find((r) => r.jobType === "daily_prices");
    expect(prices?.status).toBe("partial");
    expect(prices?.errors).toEqual([expect.objectContaining({ security: "BRK.B", kind: "rate_limited" })]);
    const brkSeries = store.series.get("sec-brkb");
    expect([...store.dailyPrices.values()].some((r) => r.seriesId === brkSeries?.id)).toBe(false);
    expect(await store.getCursor("eodhd", "daily_prices", "sec-brkb")).toBeNull();
  });

  it("blocks every write when the provider profile belongs to another company (identity mismatch)", async () => {
    const store = new MemorySyncStore(SECURITIES);
    const ctx = ctxFor(fakeAdapter({ cik: { "AAPL.US": "0000999999" } }), store);
    const { reports } = await runAll(ctx, ["AAPL"]);
    expect(reports[0]?.errors).toEqual([expect.objectContaining({ kind: "identity_mismatch", message: expect.stringMatching(/CIK/) })]);
    expect(reports[1]?.errors[0]).toMatchObject({ kind: "identifier_unverified", message: expect.stringMatching(/not verified/) });
    expect(sizes(store)).toMatchObject({ prices: 0, statements: 0, earnings: 0, valuations: 0 });
  });
});

// --- Precios gratuitos (Alpaca): lotes, calendario, reanudación, cambio de fuente y análisis -------------

const session = (date: string) => ({ date, opensAt: `${date}T13:30:00.000Z`, closesAt: `${date}T20:00:00.000Z` });
const SESSIONS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29"].map(session);

const ohlc = (tradeDate: string, close: number, volume = 1000): DailyBar => ({ tradeDate, open: close, high: close * 1.01, low: close * 0.99, close, volume, providerAdjustedClose: null });

/** Adaptador con la superficie de AlpacaAdapter: lotes, calendario y feed. */
function fakeAlpaca(options: { bars?: Record<string, DailyBar[]>; failBatch?: boolean; failSymbol?: string } = {}) {
  const calls: string[] = [];
  const data: Record<string, DailyBar[]> = options.bars ?? {
    AAPL: SESSIONS.map((s, i) => ohlc(s.date, 100 + i)),
    "BRK.B": SESSIONS.map((s, i) => ohlc(s.date, 500 - i)),
  };
  const series = (symbol: string, range: DateRange) => ({
    bars: (data[symbol] ?? []).filter((b) => b.tradeDate >= range.from && b.tradeDate <= range.to),
    volumeBasis: "raw" as const,
    priceCurrency: "USD",
    issues: [],
  });
  const adapter: ProviderAdapter & { requestCount: number; calls: string[] } = {
    id: "alpaca",
    label: "Fake Alpaca",
    capabilities: ["price_history", "corporate_actions", "calendar"],
    coverage: { exchanges: ["XNAS", "XNYS"] },
    costModel: { creditsPerCall: {}, dailyLimit: null, perMinuteLimit: 200 },
    datasets: { price_history: "ap", corporate_actions: "ac", calendar: "acal" },
    requestCount: 0,
    calls,
    calendar: {
      async getSessions() {
        calls.push("calendar");
        return SESSIONS;
      },
    },
    priceHistory: {
      feed: "sip",
      volumeBasis: "raw",
      async getDailyBars(s: ProviderSymbol, range: DateRange) {
        calls.push(`bars ${s.symbol} ${range.from}…${range.to}`);
        if (options.failSymbol === s.symbol) throw new ProviderError("transient", "alpaca", "/v2/stocks/bars", "Service unavailable");
        return series(s.symbol, range);
      },
      async getDailyBarsBatch(symbols: readonly ProviderSymbol[], range: DateRange) {
        calls.push(`batch ${symbols.map((s) => s.symbol).join(",")} ${range.from}…${range.to}`);
        if (options.failBatch) throw new ProviderError("transient", "alpaca", "/v2/stocks/bars", "Batch failed");
        return new Map(symbols.map((s) => [s.symbol, series(s.symbol, range)]));
      },
    },
    corporateActions: {
      async getSplits() {
        return { actions: [], issues: [] };
      },
      async getDividends() {
        return { actions: [], issues: [] };
      },
    },
  };
  return adapter;
}

async function alpacaRun(ctx: SyncContext, tickers = ["AAPL", "BRK.B"]) {
  const { targets } = await resolveTargets(ctx, alpacaSymbology, tickers);
  for (const t of targets) {
    await ctx.store.markIdentifierVerified(t.identifier.id, "test", "2026-09-29T00:00:00Z");
    t.identifier.verifiedAt = "2026-09-29T00:00:00Z";
  }
  await syncMarketCalendar(ctx);
  const prices = await syncDailyPrices(ctx, targets);
  await syncCorporateActions(ctx, targets);
  const outcomes: SeriesOutcome[] = [];
  const analysis = await analyzePriceSeries(ctx, targets, outcomes);
  return { targets, prices, analysis, outcomes };
}

describe("free price sync (Alpaca-like provider)", () => {
  // 29-sep-2026 12:05 en Nueva York: la sesión del día está EN CURSO.
  const midSession = Date.parse("2026-09-29T16:05:00Z");
  const restore = () => (clock = Date.parse("2026-09-29T06:00:00Z"));

  it("downloads only FINAL sessions (never the in-progress one), in one batch request", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAlpaca();
    const { prices } = await alpacaRun(ctxFor(adapter as never, store));
    expect(prices.status).toBe("succeeded");
    expect(adapter.calls.filter((c) => c.startsWith("batch"))).toEqual(["batch AAPL,BRK.B 2019-01-01…2026-09-28"]);
    expect(store.series.get("sec-aapl")).toMatchObject({ source: "alpaca", feed: "sip", volumeBasis: "raw", lastDate: "2026-09-28", barCount: 6 });
    restore();
  });

  it("is incremental and idempotent: a second run re-reads the overlap and writes nothing", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAlpaca();
    const ctx = ctxFor(adapter as never, store);
    await alpacaRun(ctx);
    const bars = store.dailyPrices.size;
    const second = await alpacaRun(ctx);
    expect(adapter.calls.filter((c) => c.startsWith("batch")).at(-1)).toBe("batch AAPL,BRK.B 2026-09-18…2026-09-28");
    expect(second.prices.recordsRead).toBe(12);
    expect(second.prices.recordsWritten).toBe(0);
    expect(store.dailyPrices.size).toBe(bars);
    // El calendario no se vuelve a descargar mientras cubra el histórico y 30 días por delante.
    expect(adapter.calls.filter((c) => c === "calendar").length).toBeGreaterThanOrEqual(1);
    restore();
  });

  it("falls back to one request per symbol when a batch fails, and one failing security does not stop the rest", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    const { prices, outcomes } = await alpacaRun(ctxFor(fakeAlpaca({ failBatch: true, failSymbol: "BRK.B" }) as never, store));
    expect(prices.status).toBe("partial");
    expect(prices.warnings).toContainEqual(expect.objectContaining({ kind: "batch_fallback" }));
    expect(prices.errors).toEqual([expect.objectContaining({ security: "BRK.B", kind: "transient" })]);
    expect(store.series.get("sec-aapl")?.barCount).toBe(6);
    expect(outcomes.find((o) => o.ticker === "BRK.B")?.status).toBe("MISSING");
    expect(outcomes.find((o) => o.ticker === "AAPL")?.status).toBe("PASS");
    restore();
  });

  it("is resumable: the next run loads the failed security in full and the others incrementally", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    await alpacaRun(ctxFor(fakeAlpaca({ failBatch: true, failSymbol: "BRK.B" }) as never, store));
    const retry = fakeAlpaca();
    await alpacaRun(ctxFor(retry as never, store));
    const requests = retry.calls.filter((c) => c.startsWith("batch") || c.startsWith("bars"));
    expect(requests).toContain("bars AAPL 2026-09-18…2026-09-28");
    expect(requests).toContain("bars BRK.B 2019-01-01…2026-09-28");
    expect(store.series.get("sec-brkb")?.barCount).toBe(6);
    restore();
  });

  it("switching price provider reloads the whole series from the new source (never mixes sources)", async () => {
    const store = new MemorySyncStore(SECURITIES);
    await runAll(ctxFor(fakeAdapter(), store), ["AAPL"]);
    expect(store.series.get("sec-aapl")?.source).toBe("eodhd");
    clock = midSession;
    const { prices } = await alpacaRun(ctxFor(fakeAlpaca() as never, store), ["AAPL"]);
    expect(prices.warnings).toContainEqual(expect.objectContaining({ kind: "price_source_switched", message: expect.stringMatching(/Replaced 3 bars from eodhd/) }));
    expect(store.series.get("sec-aapl")).toMatchObject({ source: "alpaca", volumeBasis: "raw", barCount: 6 });
    restore();
  });

  it("analyses each series: quality status, snapshot with indicators and a verified market cap (single class only)", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    const prov = { source: "sec", datasetId: "d", ingestedAt: "x" };
    await store.upsertShares("sec-aapl", [{ asOfDate: "2026-07-17", shares: 14_594_180_000, basis: "cover_page", sourceField: "dei" }], prov);
    store.latestQuarterly.set("co-aapl:sec:weighted_average_shares_diluted", { value: 14_750_302_000, periodEnd: "2026-06-30" });
    await store.upsertShares("sec-brkb", [{ asOfDate: "2026-07-17", shares: 1_300_000_000, basis: "cover_page", sourceField: "dei" }], prov);
    const { outcomes } = await alpacaRun(ctxFor(fakeAlpaca() as never, store));
    expect(outcomes.map((o) => [o.ticker, o.status])).toEqual([
      ["AAPL", "PASS"],
      ["BRK.B", "PASS"],
    ]);
    const aapl = store.marketSnapshots.get("sec-aapl");
    expect(aapl).toMatchObject({ source: "alpaca", asOfDate: "2026-09-28", close: 105, marketCapStatus: "VERIFIED" });
    expect(aapl?.marketCap).toBeCloseTo(105 * 14_594_180_000);
    expect(aapl?.returns["1D"]).toBeCloseTo(105 / 104 - 1);
    // BRK.B: clase de un emisor multiclase ⇒ nunca VERIFIED (precio de clase × acciones sin clase).
    expect(store.marketSnapshots.get("sec-brkb")).toMatchObject({ marketCapStatus: "UNVERIFIED", marketCapReason: "multi_class_share_scope_unverified", marketCap: null });
    restore();
  });

  it("flags missing sessions against the official calendar as WARNING", async () => {
    clock = midSession;
    const store = new MemorySyncStore(SECURITIES);
    const gappy = SESSIONS.filter((s) => s.date !== "2026-09-23").map((s, i) => ohlc(s.date, 100 + i));
    const { outcomes } = await alpacaRun(ctxFor(fakeAlpaca({ bars: { AAPL: gappy } }) as never, store), ["AAPL"]);
    expect(outcomes[0]).toMatchObject({ ticker: "AAPL", status: "WARNING" });
    expect(outcomes[0]?.notes).toContainEqual(expect.objectContaining({ kind: "missing_sessions", message: expect.stringMatching(/2026-09-23/) }));
    expect(store.series.get("sec-aapl")?.qualityStatus).toBe("WARNING");
    restore();
  });
});

describe("placeholder bars", () => {
  it("drops leading zero-volume bars before the first trade (DOW before its 2019-04-02 listing)", () => {
    const flat = (tradeDate: string, volume: number, close = 66.65): DailyBar => ({ tradeDate, open: close, high: close, low: close, close, volume, providerAdjustedClose: null });
    const result = dropLeadingPlaceholders([flat("2019-03-28", 0), flat("2019-03-29", 0), flat("2019-04-01", 0), flat("2019-04-02", 18_608_225, 56.25), flat("2019-04-03", 0, 56.88)]);
    expect(result.dropped).toBe(3);
    expect(result.bars.map((b) => b.tradeDate)).toEqual(["2019-04-02", "2019-04-03"]);
    expect(dropLeadingPlaceholders([flat("2019-04-02", 10)]).dropped).toBe(0);
  });
});

describe("rolling price retention", () => {
  it("prunes bars older than the retention window on the next incremental run (prices stay bounded)", async () => {
    clock = Date.parse("2026-09-29T16:05:00Z");
    const store = new MemorySyncStore(SECURITIES);
    const adapter = fakeAlpaca();
    await alpacaRun(ctxFor(adapter as never, store), ["AAPL"]);
    const series = store.series.get("sec-aapl");
    // Barra antigua (dentro de la ventana de 2026: desde 2019-01-01).
    await store.upsertDailyBars(series?.id as number, [ohlc("2019-06-03", 50)]);
    await store.finalizeSeriesLoad(series?.id as number, { ingestedAt: "x", fullLoad: false });
    expect(store.series.get("sec-aapl")?.firstDate).toBe("2019-06-03");
    // En 2027 la ventana empieza el 2020-01-01: la barra de 2019 se poda.
    clock = Date.parse("2027-01-05T12:00:00Z");
    await alpacaRun(ctxFor(fakeAlpaca() as never, store), ["AAPL"]);
    expect(store.series.get("sec-aapl")?.firstDate).toBe("2026-09-21");
    clock = Date.parse("2026-09-29T06:00:00Z");
  });
});
