import type { BenchmarkDefinition, BenchmarkQuote, SecurityMarketSnapshot } from "@/domain/market-data";
import type { WithProvenance } from "@/domain/provenance";

export interface SecurityRef {
  securityId: string;
  ticker: string;
  currency: string;
}

/**
 * Datos de mercado para la UI.
 *
 * 2B.3: `RealFirstMarketDataRepository` lee las instantáneas reales materializadas por el sync
 * (Alpaca + indicadores de MarketRadar). El mock (DEMO, determinista, nunca persistido) solo se usa
 * si no hay ningún dato real, y para los benchmarks (sin fuente gratuita).
 */
export interface MarketDataRepository {
  getSnapshots(securities: readonly SecurityRef[]): Promise<WithProvenance<Map<string, SecurityMarketSnapshot>>>;
  getBenchmarkQuotes(benchmarks: readonly BenchmarkDefinition[]): Promise<WithProvenance<BenchmarkQuote[]>>;
  /** Estado global de los datos de mercado (insignia de la barra superior). */
  getStatus?(): Promise<MarketDataStatusSummary>;
}

export interface MarketDataStatusSummary {
  /** Securities con instantánea real de la última sesión. 0 ⇒ todo DEMO. */
  realSecurities: number;
  asOf: string | null;
  sourceLabel: string | null;
}
