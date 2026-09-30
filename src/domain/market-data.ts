import type { TimeRange } from "./time-range";

/**
 * Instantánea de mercado de un valor (última sesión). Fase 2B.3: calculada por MarketRadar a partir de
 * barras diarias reales (sin ajustar + acciones corporativas) y materializada por el job de sync.
 * El repositorio mock (DEMO) solo se usa si no hay datos sincronizados. null = sin dato.
 */
export interface SecurityMarketSnapshot {
  securityId: string;
  currency: string;
  /** Fecha de la sesión de la instantánea (null en DEMO). */
  asOfDate: string | null;
  price: number | null;
  previousClose: number | null;
  /** Rendimientos simples por periodo (price return, ajustados por splits), en fracción (0.0123 = +1.23 %). */
  returns: Partial<Record<TimeRange, number | null>>;
  /** Capitalización de la security: SOLO si está verificada (precio de la clase × acciones de la clase). */
  marketCap: number | null;
  marketCapStatus: "VERIFIED" | "UNVERIFIED" | "MISSING";
  /** Motivo del estado (MarketCapReason) o null en DEMO. */
  marketCapReason: string | null;
  volume: number | null;
  /** Media de las 20 sesiones ANTERIORES a la última. */
  averageVolume20: number | null;
  /** Volumen de la última sesión / averageVolume20. */
  relativeVolume: number | null;
  /** Media de cierre × volumen de las 20 sesiones anteriores. */
  averageDollarVolume20: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  high52w: number | null;
  low52w: number | null;
  isNew52wHigh: boolean;
  isNew52wLow: boolean;
}

export type BenchmarkKind = "equity_index" | "volatility" | "fx" | "commodity" | "rate";

/** Activos de contexto global (índices, VIX, DXY, oro, petróleo, bono 10Y…). */
export interface BenchmarkDefinition {
  id: string;
  label: string;
  symbol: string;
  kind: BenchmarkKind;
  unit: "points" | "currency" | "percent";
  currency: string | null;
  /** Índice relacionado del catálogo, si existe (p. ej. "sp500"). */
  indexSlug: string | null;
}

export interface BenchmarkQuote {
  benchmarkId: string;
  value: number | null;
  change1D: number | null;
  /** Serie corta para sparkline (valores, orden cronológico). */
  sparkline: number[];
}
