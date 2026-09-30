import type { z } from "zod";
import { type MarketSession, newYorkTimeToUtc } from "@/domain/market-calendar";
import { ProviderError } from "../errors";
import type { CorporateActionsResult, DateRange, ProviderAdapter, ProviderDailyBars, ProviderSymbol } from "../ports";
import type { SymbologyRule } from "../symbology";
import { ALPACA_PROVIDER_ID, type AlpacaClient } from "./client";
import { type AssetVerification, mapBars, mapCorporateActions, sessionDate, verifyAsset } from "./mappers";
import {
  type AlpacaAsset,
  type AlpacaBar,
  type AlpacaCorporateActions,
  assetListSchema,
  assetSchema,
  barsResponseSchema,
  calendarResponseSchema,
  corporateActionsResponseSchema,
} from "./schemas";

/** Claves de `datasets` (migraciones 0010 y 0012). */
export const ALPACA_DATASETS = {
  price_history: "alpaca-eod-prices",
  corporate_actions: "alpaca-corporate-actions",
  calendar: "alpaca-calendar",
} as const;

/** Alpaca usa el ticker de clase con punto (BRK.B), igual que MarketRadar. Solo bolsas de EE. UU. */
export const US_MICS = ["XNYS", "XNAS", "BATS", "XASE", "ARCX"];

/** Las bolsas de EE. UU. comparten calendario; se guarda una vez bajo XNYS. */
export const US_CALENDAR_MIC = "XNYS";

export const alpacaSymbology: SymbologyRule = {
  provider: ALPACA_PROVIDER_ID,
  toProviderSymbol({ ticker, exchangeMic }) {
    return US_MICS.includes(exchangeMic) ? { symbol: ticker, exchangeCode: "US" } : null;
  },
};

/**
 * Feed verificado con la cuenta real (2026-09-29): el plan Basic permite SIP (consolidado de todas
 * las bolsas) SOLO con más de 15 minutos de antigüedad; lo reciente devuelve 403 "subscription does
 * not permit querying recent SIP data". Por eso las barras se piden con feed=sip y `end` nunca
 * posterior a ahora − 16 min.
 */
export const ALPACA_FEED = "sip";
const SIP_DELAY_MS = 16 * 60 * 1000;

const CORPORATE_ACTION_TYPES = "forward_split,reverse_split,cash_dividend,stock_dividend,spin_off";
const CORPORATE_ACTIONS_START = "2016-01-01";

export interface AlpacaAdapterOptions {
  now?: () => Date;
}

/**
 * Adaptador Alpaca (gratuito, EE. UU.): barras diarias SIN ajustar + acciones corporativas +
 * calendario. Implementa los mismos puertos que EODHD, más las variantes por lotes.
 */
export class AlpacaAdapter implements ProviderAdapter {
  readonly id = ALPACA_PROVIDER_ID;
  readonly label = "Alpaca (SIP)";
  readonly capabilities = ["price_history", "corporate_actions", "calendar"] as const;
  readonly coverage = { exchanges: US_MICS };
  // Gratuito: el coste es de cuota (200/min), no de créditos.
  readonly costModel = { creditsPerCall: { price_history: 0, corporate_actions: 0, calendar: 0 }, dailyLimit: null, perMinuteLimit: 200 };
  readonly datasets = ALPACA_DATASETS;
  private readonly now: () => Date;

  constructor(
    private readonly client: AlpacaClient,
    options: AlpacaAdapterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  get requestCount(): number {
    return this.client.requestCount;
  }

  readonly priceHistory = {
    feed: ALPACA_FEED,
    volumeBasis: "raw" as const,
    getDailyBars: async (symbol: ProviderSymbol, range: DateRange): Promise<ProviderDailyBars> => {
      const s = this.symbol(symbol);
      return (await this.fetchBars([s], range)).get(s) as ProviderDailyBars;
    },
    getDailyBarsBatch: async (symbols: readonly ProviderSymbol[], range: DateRange): Promise<Map<string, ProviderDailyBars>> => {
      return this.fetchBars(symbols.map((s) => this.symbol(s)), range);
    },
  };

  readonly corporateActions = {
    getSplits: async (symbol: ProviderSymbol): Promise<CorporateActionsResult> => {
      return { actions: mapCorporateActions(await this.loadActions(symbol), "USD").splits, issues: [] };
    },
    getDividends: async (symbol: ProviderSymbol, expectedCurrency: string): Promise<CorporateActionsResult> => {
      return { actions: mapCorporateActions(await this.loadActions(symbol), expectedCurrency).dividends, issues: [] };
    },
    prefetch: async (symbols: readonly ProviderSymbol[]): Promise<void> => {
      const wanted = symbols.map((s) => this.symbol(s)).filter((s) => !this.actionsCache.has(s));
      if (wanted.length === 0) return;
      const pending = this.fetchActions(wanted);
      for (const s of wanted) {
        const one = pending.then((all) => all.get(s) as AlpacaCorporateActions);
        this.actionsCache.set(s, one);
        one.catch(() => this.actionsCache.delete(s));
      }
      await pending;
    },
  };

  readonly calendar = {
    getSessions: async (exchangeMic: string, range: DateRange): Promise<MarketSession[]> => {
      if (!US_MICS.includes(exchangeMic)) throw new ProviderError("not_found", this.id, "calendar", `No calendar for ${exchangeMic}`);
      const days = this.parse("/v2/calendar", calendarResponseSchema, await this.client.trading("/v2/calendar", { start: range.from, end: range.to }));
      return days.map((d) => ({ date: d.date, opensAt: newYorkTimeToUtc(d.date, d.open), closesAt: newYorkTimeToUtc(d.date, d.close) }));
    },
  };

  // --- Identidad (Alpaca no publica CIK) -------------------------------------------------------------

  private assets: Map<string, AlpacaAsset> | null = null;

  /** Carga el catálogo de acciones activas de EE. UU. con UNA petición (en lugar de una por valor). */
  async prefetchAssets(): Promise<number> {
    const list = this.parse("/v2/assets", assetListSchema, await this.client.trading("/v2/assets", { status: "active", asset_class: "us_equity" }));
    this.assets = new Map(list.map((a) => [a.symbol, a]));
    return this.assets.size;
  }

  /** Verificación de identidad contra el catálogo de activos de Alpaca (activo, bolsa de EE. UU., nombre). */
  async verifyIdentifier(symbol: ProviderSymbol, expected: { exchangeMic: string; companyNames: readonly string[] }): Promise<AssetVerification> {
    const s = this.symbol(symbol);
    const asset =
      this.assets?.get(s) ?? this.parse("/v2/assets", assetSchema, await this.client.trading(`/v2/assets/${encodeURIComponent(s)}`, {}));
    return verifyAsset(asset, expected);
  }

  // --- Barras -------------------------------------------------------------------------------------------

  /** `end` de la petición: fin del día `to` o, si aún no han pasado 16 min desde entonces, ahora − 16 min. */
  private barsEnd(to: string): string {
    const cutoff = this.now().getTime() - SIP_DELAY_MS;
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const endOfDay = Date.parse(newYorkTimeToUtc(next.toISOString().slice(0, 10), "00:00"));
    return endOfDay <= cutoff ? to : new Date(cutoff).toISOString();
  }

  private async fetchBars(symbols: readonly string[], range: DateRange): Promise<Map<string, ProviderDailyBars>> {
    const raw = new Map<string, AlpacaBar[]>(symbols.map((s) => [s, []]));
    let pageToken: string | null = null;
    do {
      const params: Record<string, string> = {
        symbols: symbols.join(","),
        timeframe: "1Day",
        start: range.from,
        end: this.barsEnd(range.to),
        adjustment: "raw",
        feed: ALPACA_FEED,
        limit: "10000",
        sort: "asc",
      };
      if (pageToken) params.page_token = pageToken;
      const page = this.parse("/v2/stocks/bars", barsResponseSchema, await this.client.data("/v2/stocks/bars", params));
      for (const [sym, list] of Object.entries(page.bars ?? {})) raw.get(sym)?.push(...list);
      pageToken = page.next_page_token ?? null;
    } while (pageToken);

    const out = new Map<string, ProviderDailyBars>();
    for (const [sym, list] of raw) {
      // Solo sesiones dentro del rango pedido (el job fija `to` en la última sesión DEFINITIVA).
      const inRange = list.filter((b) => {
        const d = sessionDate(b.t);
        return d >= range.from && d <= range.to;
      });
      const { bars, issues } = mapBars(inRange);
      out.set(sym, { bars, issues, volumeBasis: "raw", priceCurrency: "USD" });
    }
    return out;
  }

  /**
   * SOLO validación: cierres ajustados POR ALPACA (split | all = split + dividendos) para conciliar con
   * los ajustes que calcula MarketRadar. Nunca se almacenan ni se muestran.
   */
  async getProviderAdjustedCloses(symbol: ProviderSymbol, range: DateRange, adjustment: "split" | "all"): Promise<Map<string, number>> {
    const s = this.symbol(symbol);
    const out = new Map<string, number>();
    let pageToken: string | null = null;
    do {
      const params: Record<string, string> = { symbols: s, timeframe: "1Day", start: range.from, end: this.barsEnd(range.to), adjustment, feed: ALPACA_FEED, limit: "10000", sort: "asc" };
      if (pageToken) params.page_token = pageToken;
      const page = this.parse("/v2/stocks/bars", barsResponseSchema, await this.client.data("/v2/stocks/bars", params));
      for (const b of page.bars?.[s] ?? []) out.set(sessionDate(b.t), b.c);
      pageToken = page.next_page_token ?? null;
    } while (pageToken);
    return out;
  }

  // --- Acciones corporativas -----------------------------------------------------------------------------

  private readonly actionsCache = new Map<string, Promise<AlpacaCorporateActions>>();

  private loadActions(symbol: ProviderSymbol): Promise<AlpacaCorporateActions> {
    const s = this.symbol(symbol);
    let pending = this.actionsCache.get(s);
    if (!pending) {
      pending = this.fetchActions([s]).then((all) => all.get(s) as AlpacaCorporateActions);
      this.actionsCache.set(s, pending);
      pending.catch(() => this.actionsCache.delete(s));
    }
    return pending;
  }

  /** Splits, dividendos, dividendos en acciones y spin-offs de varios símbolos, repartidos por símbolo. */
  private async fetchActions(symbols: readonly string[]): Promise<Map<string, AlpacaCorporateActions>> {
    const bySymbol = new Map<string, Record<string, unknown[]>>(symbols.map((s) => [s, {}]));
    const end = new Date(this.now().getTime()).toISOString().slice(0, 10);
    let pageToken: string | null = null;
    do {
      const params: Record<string, string> = { symbols: symbols.join(","), types: CORPORATE_ACTION_TYPES, start: CORPORATE_ACTIONS_START, end, limit: "1000" };
      if (pageToken) params.page_token = pageToken;
      const page = this.parse("/v1/corporate-actions", corporateActionsResponseSchema, await this.client.data("/v1/corporate-actions", params));
      for (const [type, list] of Object.entries(page.corporate_actions)) {
        if (!Array.isArray(list)) continue;
        for (const item of list as Record<string, unknown>[]) {
          // Spin-offs: la acción pertenece a la sociedad de origen.
          const owner = (type === "spin_offs" ? item.source_symbol : item.symbol) as string | undefined;
          const target = owner ? bySymbol.get(owner) : undefined;
          if (target) (target[type] ??= []).push(item);
        }
      }
      pageToken = page.next_page_token ?? null;
    } while (pageToken);
    const out = new Map<string, AlpacaCorporateActions>();
    for (const [s, merged] of bySymbol) out.set(s, corporateActionsResponseSchema.parse({ corporate_actions: merged }).corporate_actions);
    return out;
  }

  private symbol(symbol: ProviderSymbol): string {
    if (symbol.provider !== this.id) throw new ProviderError("invalid_response", this.id, "symbol", `Identifier for provider "${symbol.provider}" passed to Alpaca`);
    return symbol.symbol;
  }

  private parse<T>(operation: string, schema: z.ZodType<T>, json: unknown): T {
    const result = schema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new ProviderError("invalid_response", this.id, operation, `Unexpected response shape (${issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown"})`);
    }
    return result.data;
  }
}
