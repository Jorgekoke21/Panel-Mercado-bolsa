import type { CorporateAction } from "@/domain/corporate-actions";
import type { EarningsEstimate, EarningsEvent } from "@/domain/earnings";
import type { FinancialStatementValue, SharesOutstandingPoint } from "@/domain/fundamentals";
import type { MarketSession } from "@/domain/market-calendar";
import type { DailyBar, VolumeBasis } from "@/domain/prices";
import type { ValuationValue } from "@/domain/valuation";

/**
 * Puertos de proveedores externos, segmentados por capacidad.
 *
 * Un adaptador (EODHD, un futuro proveedor para Japón, uno de noticias…) implementa solo las
 * capacidades que ofrece. Los jobs de sincronización eligen proveedor POR CAPACIDAD Y BOLSA
 * (`src/providers/registry.ts`), así que se pueden combinar varios proveedores.
 *
 * Reglas:
 *   * Solo los jobs de sincronización del servidor usan estos puertos. La UI nunca.
 *   * Los puertos devuelven dominio canónico de MarketRadar, nunca el JSON del proveedor.
 *   * Los fallos se lanzan como `ProviderError` tipado; nunca se devuelven como [] o null.
 *   * El símbolo del proveedor llega ya resuelto desde `security_identifiers`: los adaptadores
 *     no construyen símbolos a partir de tickers.
 */

export type ProviderCapability =
  | "profile"
  | "price_history"
  | "corporate_actions"
  | "fundamentals"
  | "earnings"
  | "valuation"
  | "quotes"
  | "calendar";

/** Símbolo tal como lo entiende un proveedor concreto (p. ej. EODHD "BRK-B.US"). */
export interface ProviderSymbol {
  provider: string;
  symbol: string;
}

export interface DateRange {
  /** YYYY-MM-DD inclusive. */
  from: string;
  to: string;
}

export interface ProviderDailyBars {
  bars: DailyBar[];
  volumeBasis: VolumeBasis;
  /** Divisa de cotización si el proveedor la declara (EODHD no la incluye en /eod). */
  priceCurrency: string | null;
  /** Barras rechazadas o sospechosas, con motivo. */
  issues: string[];
}

export interface PriceHistorySource {
  getDailyBars(symbol: ProviderSymbol, range: DateRange): Promise<ProviderDailyBars>;
  /**
   * Opcional: varios símbolos en una sola petición (clave = símbolo del proveedor). Un símbolo sin
   * datos aparece con `bars: []`. Si la petición falla, el job reintenta símbolo a símbolo.
   */
  getDailyBarsBatch?(symbols: readonly ProviderSymbol[], range: DateRange): Promise<Map<string, ProviderDailyBars>>;
  /** Feed del proveedor (p. ej. Alpaca "sip"); se guarda en la procedencia de la serie. */
  readonly feed?: string | null;
  /** Base del volumen que entrega (fija la de la serie antes de descargar). */
  readonly volumeBasis?: VolumeBasis;
}

export interface CorporateActionsResult {
  actions: CorporateAction[];
  issues: string[];
}

export interface CorporateActionSource {
  getSplits(symbol: ProviderSymbol): Promise<CorporateActionsResult>;
  getDividends(symbol: ProviderSymbol, expectedCurrency: string): Promise<CorporateActionsResult>;
  /** Opcional: precarga las acciones de muchos símbolos con pocas peticiones. */
  prefetch?(symbols: readonly ProviderSymbol[]): Promise<void>;
}

/** Calendario oficial de sesiones de una bolsa (festivos y medias sesiones). */
export interface MarketCalendarSource {
  getSessions(exchangeMic: string, range: DateRange): Promise<MarketSession[]>;
}

export interface ProviderProfile {
  providerCode: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  countryIso: string | null;
  isin: string | null;
  cik: string | null;
  lei: string | null;
  cusip: string | null;
  figi: string | null;
  website: string | null;
  description: string | null;
  employees: number | null;
  logoUrl: string | null;
  ipoDate: string | null;
  fiscalYearEnd: string | null;
  isDelisted: boolean | null;
  /** Fecha de última actualización de los fundamentales en el proveedor. */
  updatedAt: string | null;
}

export interface ProfileSource {
  getProfile(symbol: ProviderSymbol): Promise<ProviderProfile>;
}

export interface FundamentalsResult {
  /** Fecha a la que el proveedor dice que corresponden los datos. */
  asOf: string | null;
  statements: FinancialStatementValue[];
  shares: SharesOutstandingPoint[];
  /** Avisos de normalización (campos incoherentes, signos inesperados…). Nunca silenciosos. */
  warnings: string[];
}

export interface FundamentalsSource {
  getFundamentals(symbol: ProviderSymbol): Promise<FundamentalsResult>;
}

export interface EarningsResult {
  asOf: string | null;
  events: EarningsEvent[];
  estimates: EarningsEstimate[];
}

export interface EarningsSource {
  getEarnings(symbol: ProviderSymbol): Promise<EarningsResult>;
}

export interface ValuationResult {
  asOf: string | null;
  values: ValuationValue[];
}

export interface ValuationSource {
  getValuation(symbol: ProviderSymbol): Promise<ValuationResult>;
}

/** Cotizaciones (retrasadas / tiempo real). Fase 2B es solo EOD: ningún adaptador la implementa aún. */
export interface QuoteSource {
  getDelayedQuotes(symbols: readonly ProviderSymbol[]): Promise<{ symbol: ProviderSymbol; price: number; asOf: string }[]>;
}

/** Cuenta y consumo según el propio proveedor (si lo expone). Sin datos personales. */
export interface ProviderAccount {
  /** Tipo de suscripción tal como lo nombra el proveedor (p. ej. EODHD "free"). */
  subscriptionType: string | null;
  /** Peticiones consumidas hoy (0 si el contador del proveedor es de otro día). */
  requestsToday: number;
  dailyLimit: number | null;
  /** Llamadas adicionales que declara el proveedor (EODHD extraLimit). */
  extraLimit: number | null;
  /** Fecha del contador según el proveedor. */
  date: string | null;
}

export interface ProviderCostModel {
  /** Créditos por llamada de cada operación, según la documentación del proveedor. */
  creditsPerCall: Partial<Record<ProviderCapability, number>>;
  dailyLimit: number | null;
  perMinuteLimit: number | null;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly ProviderCapability[];
  /** Bolsas (MIC) que cubre; el registro elige proveedor por bolsa. */
  readonly coverage: { exchanges: readonly string[] };
  readonly costModel: ProviderCostModel;
  /** Dataset (`datasets.key`) con el que se registra la procedencia de cada capacidad. */
  readonly datasets: Partial<Record<ProviderCapability, string>>;

  readonly profile?: ProfileSource;
  readonly priceHistory?: PriceHistorySource;
  readonly corporateActions?: CorporateActionSource;
  readonly fundamentals?: FundamentalsSource;
  readonly earnings?: EarningsSource;
  readonly valuation?: ValuationSource;
  readonly quotes?: QuoteSource;
  readonly calendar?: MarketCalendarSource;

  getUsage?(): Promise<ProviderAccount | null>;
}
