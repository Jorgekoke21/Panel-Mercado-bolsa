import { describe, expect, it, vi } from "vitest";
import { lastFinalSession, newYorkTimeToUtc } from "@/domain/market-calendar";
import { ProviderError } from "../errors";
import REAL from "./__fixtures__/alpaca-real.json";
import { AlpacaAdapter, alpacaSymbology } from "./adapter";
import { AlpacaClient } from "./client";
import { mapBars, mapCorporateActions, mergeSameDayDividends, namesMatch, sessionDate, verifyAsset } from "./mappers";
import { type AlpacaAsset, corporateActionsResponseSchema } from "./schemas";

/**
 * Tests OFFLINE. `__fixtures__/alpaca-real.json` contiene respuestas REALES de Alpaca (cuenta Basic,
 * 2026-09-29) reducidas: barras SIP sin ajustar y ajustadas de AAPL alrededor del split 4:1 de 2020,
 * BRK.B, acciones corporativas (duplicados, pagos combinados, HON), catálogo de activos, calendario
 * (medias sesiones) y el 403 de "recent SIP data".
 */
const KEY = "PKTESTKEY000000";
const SECRET = "secret-test-value-000000";

function clientWith(handler: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect((init?.headers as Record<string, string>)["APCA-API-KEY-ID"]).toBe(KEY);
    return handler(url);
  });
  return { client: new AlpacaClient({ keyId: KEY, secretKey: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, minIntervalMs: 0 }), calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const realActions = corporateActionsResponseSchema.parse(REAL.corporateActions).corporate_actions;
const only = (symbol: string) =>
  corporateActionsResponseSchema.parse({
    corporate_actions: Object.fromEntries(
      Object.entries(REAL.corporateActions.corporate_actions).map(([k, list]) => [k, (list as { symbol?: string; source_symbol?: string }[]).filter((x) => (x.symbol ?? x.source_symbol) === symbol)]),
    ),
  }).corporate_actions;
const asset = (symbol: string) => REAL.assets.find((a) => a.symbol === symbol) as AlpacaAsset;

describe("Alpaca bars (real SIP responses)", () => {
  it("maps raw daily bars to New York session dates: AAPL before and after the 2020 4:1 split", () => {
    expect(sessionDate("2024-01-02T05:00:00Z")).toBe("2024-01-02"); // medianoche EST
    expect(sessionDate("2024-07-01T04:00:00Z")).toBe("2024-07-01"); // medianoche EDT
    const { bars, issues } = mapBars(REAL.bars.bars.AAPL);
    expect(issues).toEqual([]);
    expect(bars.map((b) => b.tradeDate)).toEqual(["2020-08-26", "2020-08-27", "2020-08-28", "2020-08-31", "2020-09-01"]);
    // SIN ajustar: el cierre oficial del 28-ago-2020 fue 499.23 y el volumen es el de ese día.
    expect(bars[2]).toMatchObject({ close: 499.23, volume: 53137957, providerAdjustedClose: null });
    expect(bars[3]?.close).toBe(129.04);
  });

  it("Alpaca's own split-adjusted series is rounded: MarketRadar keeps raw + factors (exact)", () => {
    const raw = mapBars(REAL.bars.bars.AAPL).bars;
    const theirs = REAL.splitAdjusted.bars.AAPL;
    // Mismas sesiones; el cierre ajustado de Alpaca es raw / 4 redondeado (506.09 / 4 = 126.5225 → 126.52).
    expect(theirs[0]?.c).toBe(126.52);
    expect(Math.abs((theirs[0]?.c as number) / ((raw[0]?.close as number) / 4) - 1)).toBeLessThan(1e-4);
    expect(theirs[3]?.c).toBe(raw[3]?.close);
  });

  it("rejects bars with non-positive prices, inverted ranges or duplicated sessions", () => {
    const { bars, issues } = mapBars([
      { t: "2024-01-03T05:00:00Z", o: 1, h: 2, l: 1, c: 1.5, v: 10 },
      { t: "2024-01-03T05:00:00Z", o: 1, h: 2, l: 1, c: 1.5, v: 10 },
      { t: "2024-01-04T05:00:00Z", o: 0, h: 1, l: 1, c: 1, v: 1 },
      { t: "2024-01-05T05:00:00Z", o: 1, h: 1, l: 2, c: 1, v: 1 },
    ]);
    expect(bars).toHaveLength(1);
    expect(issues).toEqual(["2024-01-03: rejected, duplicated session", "2024-01-04: rejected, non-positive price", "2024-01-05: rejected, low 2 > high 1"]);
  });
});

describe("Alpaca corporate actions (real responses)", () => {
  it("maps splits (forward and reverse) and unadjusted cash dividends", () => {
    const aapl = mapCorporateActions(only("AAPL"), "USD");
    expect(aapl.splits).toEqual([{ kind: "split", exDate: "2020-08-31", toShares: 4, fromShares: 1 }]);
    // Dividendo ANTERIOR al split: importe tal como se pagó (0.82, no 0.205).
    expect(aapl.dividends.filter((d) => d.kind === "cash_dividend").map((d) => [d.exDate, d.kind === "cash_dividend" && d.amount])).toEqual([
      ["2020-05-08", 0.82],
      ["2020-08-07", 0.82],
      ["2020-11-06", 0.205],
    ]);
    const nvda = mapCorporateActions(only("NVDA"), "USD");
    expect(nvda.splits.map((s) => s.kind === "split" && [s.exDate, s.toShares, s.fromShares])).toEqual([
      ["2021-07-20", 4, 1],
      ["2024-06-10", 10, 1],
    ]);
    const ge = mapCorporateActions(only("GE"), "USD");
    expect(ge.splits).toContainEqual({ kind: "split", exDate: "2021-08-02", toShares: 1, fromShares: 8 });
  });

  it("sums different same-day payments (COP base + variable) and drops identical duplicates (GE, XEL)", () => {
    const cop = mapCorporateActions(only("COP"), "USD").dividends;
    expect(cop).toEqual([expect.objectContaining({ kind: "cash_dividend", exDate: "2024-02-15", amount: 0.78, providerLabel: "combined 0.58 + 0.2" })]);
    const ge = mergeSameDayDividends(only("GE").cash_dividends ?? []);
    expect(ge.duplicates).toBe(1);
    expect(ge.merged).toHaveLength(1);
    // XEL: mismo importe y fecha de registro, fecha de pago corregida ⇒ duplicado.
    expect(mapCorporateActions(only("XEL"), "USD").dividends).toEqual([expect.objectContaining({ amount: 0.5475 })]);
    // F 2025-02-18: regular + suplementario "special" ⇒ tipos distintos, sin conflicto de clave.
    const f = mapCorporateActions(only("F"), "USD").dividends.filter((d) => d.exDate === "2025-02-18");
    expect(f.map((d) => (d.kind === "unsupported" ? d.type : d.kind)).sort()).toEqual(["cash_dividend", "special_dividend"]);
  });

  it("keeps spin-offs as unsupported events of the source symbol (HON)", () => {
    const hon = mapCorporateActions(only("HON"), "USD");
    expect(hon.dividends.filter((d) => d.kind === "unsupported").map((d) => d.exDate)).toEqual(["2025-10-30", "2026-06-29"]);
    // El "reverse split 1:2" del día del spin-off se mapea como split; el motor de ajustes lo descarta si los precios lo contradicen.
    expect(hon.splits).toContainEqual({ kind: "split", exDate: "2026-06-29", toShares: 1, fromShares: 2 });
    expect(realActions.spin_offs).toHaveLength(2);
  });
});

describe("Alpaca identity (asset catalogue, no CIK)", () => {
  it("uses the canonical class ticker (BRK.B) for US listings only", () => {
    expect(alpacaSymbology.toProviderSymbol({ ticker: "BRK.B", exchangeMic: "XNYS" })).toEqual({ symbol: "BRK.B", exchangeCode: "US" });
    expect(alpacaSymbology.toProviderSymbol({ ticker: "GOOG", exchangeMic: "XNAS" })).toEqual({ symbol: "GOOG", exchangeCode: "US" });
    expect(alpacaSymbology.toProviderSymbol({ ticker: "7203", exchangeMic: "XTKS" })).toBeNull();
  });

  it("verifies BRK.B and both Alphabet classes as separate securities", () => {
    expect(verifyAsset(asset("BRK.B"), { exchangeMic: "XNYS", companyNames: ["Berkshire Hathaway"] })).toEqual({ rejection: null, warnings: [] });
    expect(verifyAsset(asset("GOOGL"), { exchangeMic: "XNAS", companyNames: ["Alphabet Inc."] }).rejection).toBeNull();
    expect(verifyAsset(asset("GOOG"), { exchangeMic: "XNAS", companyNames: ["Alphabet Inc."] }).rejection).toBeNull();
  });

  it("matches names by initials, squashed words or the SEC registrant name", () => {
    expect(namesMatch("IBM", "International Business Machines Corporation")).toBe(true);
    expect(namesMatch("Supermicro", "Super Micro Computer, Inc. Common Stock")).toBe(true);
    expect(namesMatch("Schlumberger", "SLB Limited")).toBe(false);
    expect(verifyAsset(asset("SLB"), { exchangeMic: "XNYS", companyNames: ["Schlumberger", "SLB LIMITED/NV"] }).rejection).toBeNull();
    expect(verifyAsset(asset("IBM"), { exchangeMic: "XNYS", companyNames: ["IBM"] }).rejection).toBeNull();
    expect(namesMatch("Apple", "Berkshire Hathaway Class B")).toBe(false);
  });

  it("accepts a change of US venue with a warning (DPZ moved to Nasdaq) but rejects inactive or unrelated assets", () => {
    const dpz = verifyAsset(asset("DPZ"), { exchangeMic: "XNYS", companyNames: ["Domino's", "DOMINOS PIZZA INC"] });
    expect(dpz.rejection).toBeNull();
    expect(dpz.warnings[0]).toMatch(/NASDAQ.*seed says XNYS/);
    expect(verifyAsset({ ...asset("AAPL"), status: "inactive" }, { exchangeMic: "XNAS", companyNames: ["Apple Inc."] }).rejection).toMatch(/status/);
    expect(verifyAsset(asset("AAPL"), { exchangeMic: "XNAS", companyNames: ["Microsoft"] }).rejection).toMatch(/Name/);
    expect(verifyAsset({ ...asset("AAPL"), exchange: "OTC" }, { exchangeMic: "XNAS", companyNames: ["Apple Inc."] }).rejection).toMatch(/not a US listing venue/);
  });
});

describe("Alpaca calendar (real, with early closes)", () => {
  it("converts New York session times to UTC across daylight saving", () => {
    expect(newYorkTimeToUtc("2024-07-03", "13:00")).toBe("2024-07-03T17:00:00.000Z"); // EDT, media sesión
    expect(newYorkTimeToUtc("2024-11-29", "13:00")).toBe("2024-11-29T18:00:00.000Z"); // EST, media sesión
    expect(newYorkTimeToUtc("2024-03-08", "16:00")).toBe("2024-03-08T21:00:00.000Z");
    expect(newYorkTimeToUtc("2024-03-11", "16:00")).toBe("2024-03-11T20:00:00.000Z");
  });

  it("maps the calendar (holidays excluded) and knows when a daily bar is final", async () => {
    const { client, calls } = clientWith(() => json(REAL.calendar));
    const sessions = await new AlpacaAdapter(client).calendar.getSessions("XNYS", { from: "2024-07-01", to: "2024-12-02" });
    expect(calls[0]?.pathname).toBe("/v2/calendar");
    expect(sessions.map((s) => s.date)).not.toContain("2024-07-04");
    const halfDay = sessions.find((s) => s.date === "2024-07-03");
    expect(halfDay?.closesAt).toBe("2024-07-03T17:00:00.000Z");
    // Barra definitiva 4 h 20 min después del cierre (sesión extendida + retraso del feed).
    expect(lastFinalSession(sessions, new Date("2024-07-03T21:00:00Z"))?.date).toBe("2024-07-02");
    expect(lastFinalSession(sessions, new Date("2024-07-03T21:25:00Z"))?.date).toBe("2024-07-03");
    expect(lastFinalSession(sessions, new Date("2024-07-05T12:00:00Z"))?.date).toBe("2024-07-03");
  });
});

describe("Alpaca adapter requests", () => {
  const now = () => new Date("2026-09-29T16:05:00Z"); // 12:05 en Nueva York: sesión en curso

  it("requests raw SIP bars, never newer than 16 minutes ago, and follows pagination", async () => {
    const { client, calls } = clientWith((url) =>
      url.searchParams.get("page_token")
        ? json({ bars: { AAPL: [{ t: "2026-09-28T04:00:00Z", o: 1, h: 2, l: 1, c: 2, v: 10 }] }, next_page_token: null })
        : json({ bars: { AAPL: [{ t: "2026-09-25T04:00:00Z", o: 1, h: 2, l: 1, c: 1.5, v: 10 }] }, next_page_token: "abc" }),
    );
    const adapter = new AlpacaAdapter(client, { now });
    const past = await adapter.priceHistory.getDailyBars({ provider: "alpaca", symbol: "AAPL" }, { from: "2026-09-20", to: "2026-09-28" });
    expect(past).toMatchObject({ volumeBasis: "raw", priceCurrency: "USD" });
    expect(past.bars.map((b) => b.tradeDate)).toEqual(["2026-09-25", "2026-09-28"]);
    expect(calls[0]?.searchParams.get("adjustment")).toBe("raw");
    expect(calls[0]?.searchParams.get("feed")).toBe("sip");
    expect(calls[0]?.searchParams.get("end")).toBe("2026-09-28");
    expect(calls[1]?.searchParams.get("page_token")).toBe("abc");
    // Pedir "hasta hoy" durante la sesión: end = ahora − 16 min (evita el 403 de SIP reciente).
    await adapter.priceHistory.getDailyBars({ provider: "alpaca", symbol: "AAPL" }, { from: "2026-09-28", to: "2026-09-29" });
    expect(calls.at(-1)?.searchParams.get("end")).toBe("2026-09-29T15:49:00.000Z");
  });

  it("drops bars outside the requested range (e.g. the in-progress session)", async () => {
    const { client } = clientWith(() =>
      json({ bars: { AAPL: [{ t: "2026-09-28T04:00:00Z", o: 1, h: 2, l: 1, c: 2, v: 10 }, { t: "2026-09-29T04:00:00Z", o: 1, h: 2, l: 1, c: 2, v: 5 }] }, next_page_token: null }),
    );
    const result = await new AlpacaAdapter(client, { now }).priceHistory.getDailyBars({ provider: "alpaca", symbol: "AAPL" }, { from: "2026-09-20", to: "2026-09-28" });
    expect(result.bars.map((b) => b.tradeDate)).toEqual(["2026-09-28"]);
  });

  it("fetches several symbols (incl. BRK.B) in one request and splits the response per symbol", async () => {
    const { client, calls } = clientWith(() => json(REAL.bars));
    const result = await new AlpacaAdapter(client, { now }).priceHistory.getDailyBarsBatch(
      [
        { provider: "alpaca", symbol: "AAPL" },
        { provider: "alpaca", symbol: "BRK.B" },
        { provider: "alpaca", symbol: "PLTR" },
      ],
      { from: "2020-08-26", to: "2020-09-01" },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.searchParams.get("symbols")).toBe("AAPL,BRK.B,PLTR");
    expect(result.get("AAPL")?.bars).toHaveLength(5);
    expect(result.get("BRK.B")?.bars.length).toBeGreaterThan(0);
    // Sin datos (PLTR no cotizaba en 2020): serie vacía, no error.
    expect(result.get("PLTR")?.bars).toEqual([]);
  });

  it("prefetches corporate actions for many symbols and serves splits and dividends from that single call", async () => {
    const { client, calls } = clientWith(() => json(REAL.corporateActions));
    const adapter = new AlpacaAdapter(client, { now });
    const symbols = ["AAPL", "COP", "HON"].map((symbol) => ({ provider: "alpaca", symbol }));
    await adapter.corporateActions.prefetch(symbols);
    const aaplSplits = await adapter.corporateActions.getSplits(symbols[0] as (typeof symbols)[number]);
    const copDividends = await adapter.corporateActions.getDividends(symbols[1] as (typeof symbols)[number], "USD");
    const honDividends = await adapter.corporateActions.getDividends(symbols[2] as (typeof symbols)[number], "USD");
    expect(calls).toHaveLength(1);
    expect(aaplSplits.actions).toHaveLength(1);
    expect(copDividends.actions).toHaveLength(1);
    expect(honDividends.actions.some((a) => a.kind === "unsupported" && a.type === "spinoff")).toBe(true);
  });

  it("maps the real 'recent SIP' 403 and auth failures to typed errors without leaking credentials", async () => {
    const { client } = clientWith(() => new Response(JSON.stringify(REAL.recentSipForbidden.body), { status: 403 }));
    const error = await new AlpacaAdapter(client, { now })
      .priceHistory.getDailyBars({ provider: "alpaca", symbol: "AAPL" }, { from: "2026-09-28", to: "2026-09-29" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("auth");
    expect((error as ProviderError).message).toMatch(/recent SIP data/);

    const leaky = clientWith(() => new Response(`forbidden for ${KEY} ${SECRET}`, { status: 401 }));
    const e2 = (await new AlpacaAdapter(leaky.client).verifyIdentifier({ provider: "alpaca", symbol: "AAPL" }, { exchangeMic: "XNAS", companyNames: ["Apple"] }).catch((e: unknown) => e)) as ProviderError;
    expect(e2.message).not.toContain(SECRET);
    expect(e2.message).not.toContain(KEY);
  });

  it("verifies identifiers from the prefetched asset catalogue (one request for the whole universe)", async () => {
    const { client, calls } = clientWith(() => json(REAL.assets));
    const adapter = new AlpacaAdapter(client, { now });
    expect(await adapter.prefetchAssets()).toBe(REAL.assets.length);
    const result = await adapter.verifyIdentifier({ provider: "alpaca", symbol: "BRK.B" }, { exchangeMic: "XNYS", companyNames: ["Berkshire Hathaway"] });
    expect(result.rejection).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("refuses to start without credentials", () => {
    expect(() => new AlpacaClient({ keyId: "", secretKey: "" })).toThrow(ProviderError);
  });
});
