import type { z } from "zod";
import { ProviderError } from "../errors";
import type {
  CorporateActionsResult,
  DateRange,
  EarningsResult,
  FundamentalsResult,
  ProviderAdapter,
  ProviderDailyBars,
  ProviderProfile,
  ProviderSymbol,
  ProviderAccount,
  ValuationResult,
} from "../ports";
import { EODHD_PROVIDER_ID, type EodhdClient } from "./client";
import {
  fundamentalsAsOf,
  mapDividend,
  mapEarningsEstimates,
  mapEarningsEvents,
  mapEodBars,
  mapProfile,
  mapShares,
  mapSplits,
  mapStatements,
  mapValuation,
} from "./mappers";
import {
  dividendsResponseSchema,
  eodResponseSchema,
  type FundamentalsRaw,
  fundamentalsSchema,
  splitsResponseSchema,
  userSchema,
} from "./schemas";
import { EODHD_EXCHANGE_CODES } from "./symbology";

/** Claves de `datasets` con las que se registra la procedencia de cada capacidad EODHD. */
export const EODHD_DATASETS = {
  price_history: "eodhd-eod-prices",
  corporate_actions: "eodhd-corporate-actions",
  fundamentals: "eodhd-fundamentals",
  earnings: "eodhd-fundamentals",
  valuation: "eodhd-fundamentals",
  profile: "eodhd-fundamentals",
} as const;

/**
 * Adaptador EODHD: implementa los puertos con los endpoints EOD, splits, div y fundamentals.
 *
 * Fundamentales, earnings, valoración y perfil salen de la MISMA respuesta /fundamentals
 * (10 créditos): se memoriza por símbolo durante la vida del adaptador (una ejecución de job).
 */
export class EodhdAdapter implements ProviderAdapter {
  readonly id = EODHD_PROVIDER_ID;
  readonly label = "EODHD";
  readonly capabilities = ["profile", "price_history", "corporate_actions", "fundamentals", "earnings", "valuation"] as const;
  readonly coverage = { exchanges: Object.keys(EODHD_EXCHANGE_CODES) };
  readonly costModel = {
    creditsPerCall: { price_history: 1, corporate_actions: 1, fundamentals: 10, earnings: 10, valuation: 10, profile: 10 },
    dailyLimit: 100_000,
    perMinuteLimit: 1_000,
  };
  readonly datasets = EODHD_DATASETS;

  private readonly fundamentalsCache = new Map<string, Promise<FundamentalsRaw>>();

  constructor(private readonly client: EodhdClient) {}

  /** Peticiones HTTP enviadas por este adaptador. */
  get requestCount(): number {
    return this.client.requestCount;
  }

  readonly priceHistory = {
    volumeBasis: "split_adjusted" as const,
    getDailyBars: async (symbol: ProviderSymbol, range: DateRange): Promise<ProviderDailyBars> => {
      const operation = `/eod/${this.symbol(symbol)}`;
      const raw = this.parse(operation, eodResponseSchema, await this.client.getJson(operation, { from: range.from, to: range.to, period: "d" }));
      const { bars, issues } = mapEodBars(raw);
      // Verificado 2026-09-29: OHLC sin ajustar, volumen ajustado por splits.
      return { bars, issues, volumeBasis: "split_adjusted", priceCurrency: null };
    },
  };

  readonly corporateActions = {
    getSplits: async (symbol: ProviderSymbol): Promise<CorporateActionsResult> => {
      const operation = `/splits/${this.symbol(symbol)}`;
      const raw = this.parse(operation, splitsResponseSchema, await this.client.getJson(operation));
      return mapSplits(raw);
    },
    getDividends: async (symbol: ProviderSymbol, expectedCurrency: string): Promise<CorporateActionsResult> => {
      const operation = `/div/${this.symbol(symbol)}`;
      const raw = this.parse(operation, dividendsResponseSchema, await this.client.getJson(operation));
      return { actions: raw.map((r) => mapDividend(r, expectedCurrency)), issues: [] };
    },
  };

  readonly profile = {
    getProfile: async (symbol: ProviderSymbol): Promise<ProviderProfile> => mapProfile(await this.loadFundamentals(symbol)),
  };

  readonly fundamentals = {
    getFundamentals: async (symbol: ProviderSymbol): Promise<FundamentalsResult> => {
      const raw = await this.loadFundamentals(symbol);
      const { values, warnings } = mapStatements(raw);
      return { asOf: fundamentalsAsOf(raw), statements: values, shares: mapShares(raw), warnings };
    },
  };

  readonly earnings = {
    getEarnings: async (symbol: ProviderSymbol): Promise<EarningsResult> => {
      const raw = await this.loadFundamentals(symbol);
      return { asOf: fundamentalsAsOf(raw), events: mapEarningsEvents(raw), estimates: mapEarningsEstimates(raw) };
    },
  };

  readonly valuation = {
    getValuation: async (symbol: ProviderSymbol): Promise<ValuationResult> => {
      const raw = await this.loadFundamentals(symbol);
      return { asOf: fundamentalsAsOf(raw), values: mapValuation(raw) };
    },
  };

  /** `/user`: sin coste de créditos. Solo se leen campos del plan, nunca nombre ni email. */
  async getUsage(): Promise<ProviderAccount | null> {
    const raw = this.parse("/user", userSchema, await this.client.getJson("/user"));
    const date = raw.apiRequestsDate ?? null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      subscriptionType: raw.subscriptionType ?? null,
      requestsToday: date === today ? raw.apiRequests : 0,
      dailyLimit: raw.dailyRateLimit ?? null,
      extraLimit: raw.extraLimit ?? null,
      date,
    };
  }

  private loadFundamentals(symbol: ProviderSymbol): Promise<FundamentalsRaw> {
    const key = this.symbol(symbol);
    let pending = this.fundamentalsCache.get(key);
    if (!pending) {
      const operation = `/fundamentals/${key}`;
      pending = this.client.getJson(operation).then((json) => this.parse(operation, fundamentalsSchema, json));
      this.fundamentalsCache.set(key, pending);
      pending.catch(() => this.fundamentalsCache.delete(key));
    }
    return pending;
  }

  private symbol(symbol: ProviderSymbol): string {
    if (symbol.provider !== this.id) {
      throw new ProviderError("invalid_response", this.id, "symbol", `Identifier for provider "${symbol.provider}" passed to EODHD`);
    }
    return encodeURIComponent(symbol.symbol);
  }

  private parse<T>(operation: string, schema: z.ZodType<T>, json: unknown): T {
    const result = schema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "unknown";
      throw new ProviderError("invalid_response", this.id, operation, `Unexpected response shape (${where})`);
    }
    return result.data;
  }
}
