import type { BenchmarkDefinition } from "@/domain/market-data";

/**
 * Activos de contexto global del dashboard. Son contexto, no universo de empresas:
 * en Fase 2 se decidirá si viven en una tabla `market_instruments`.
 */
export const MARKET_OVERVIEW: readonly BenchmarkDefinition[] = [
  { id: "spx", label: "S&P 500", symbol: "SPX", kind: "equity_index", unit: "points", currency: "USD", indexSlug: "sp500" },
  { id: "ndx", label: "Nasdaq-100", symbol: "NDX", kind: "equity_index", unit: "points", currency: "USD", indexSlug: "nasdaq-100" },
  { id: "dji", label: "Dow Jones", symbol: "DJI", kind: "equity_index", unit: "points", currency: "USD", indexSlug: "dow-jones-industrial-average" },
  { id: "rut", label: "Russell 2000", symbol: "RUT", kind: "equity_index", unit: "points", currency: "USD", indexSlug: "russell-2000" },
  { id: "vix", label: "VIX", symbol: "VIX", kind: "volatility", unit: "points", currency: null, indexSlug: null },
  { id: "dxy", label: "US Dollar Index", symbol: "DXY", kind: "fx", unit: "points", currency: null, indexSlug: null },
  { id: "gold", label: "Gold", symbol: "XAU", kind: "commodity", unit: "currency", currency: "USD", indexSlug: null },
  { id: "wti", label: "WTI Crude", symbol: "WTI", kind: "commodity", unit: "currency", currency: "USD", indexSlug: null },
  { id: "us10y", label: "US 10Y Yield", symbol: "US10Y", kind: "rate", unit: "percent", currency: null, indexSlug: null },
];

export function benchmarkForIndex(indexSlug: string): BenchmarkDefinition | null {
  return MARKET_OVERVIEW.find((b) => b.indexSlug === indexSlug) ?? null;
}
