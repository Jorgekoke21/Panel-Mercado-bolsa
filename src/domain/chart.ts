import type { EntityRef } from "./entity";
import type { Provenance } from "./provenance";
import type { TimeRange } from "./time-range";

/**
 * Contrato de dominio del gráfico principal (CAMBIO 4).
 *
 * Describe QUÉ se dibuja, no CÓMO: la librería de gráficos (Fase 3) será un adaptador que
 * consume este contrato. En Fase 1 no hay series reales; ChartCard es un placeholder.
 */

export interface OhlcvBar {
  /** Fecha de sesión (YYYY-MM-DD) o timestamp ISO para intradía. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface LinePoint {
  time: string;
  value: number;
}

/** Serie principal: velas solo cuando existe OHLC real (los índices sintéticos son línea). */
export type PriceSeries =
  | { type: "candlestick"; bars: OhlcvBar[] }
  | { type: "line"; points: LinePoint[] };

export type OverlaySpec =
  | { kind: "sma"; period: number }
  | { kind: "ema"; period: number }
  | { kind: "levels52w" };

export type LowerPanelSpec =
  | { kind: "volume" }
  | { kind: "rsi"; period: number }
  | { kind: "macd"; fast: number; slow: number; signal: number }
  | { kind: "atr"; period: number };

export type ComparisonRelation =
  | "company_vs_industry"
  | "industry_vs_sector"
  | "sector_vs_index"
  | "custom";

export interface ComparisonSeries {
  entity: EntityRef;
  label: string;
  relation: ComparisonRelation;
  /** Serie rebasada a `baseValue` en el primer punto común. */
  points: LinePoint[];
}

export interface PriceChartSpec {
  entity: EntityRef;
  range: TimeRange;
  currency: string | null;
  series: PriceSeries;
  overlays: OverlaySpec[];
  lowerPanels: LowerPanelSpec[];
  comparisons: ComparisonSeries[];
  /** Si se define, todas las series se muestran rebasadas (p. ej. base 100). */
  rebaseTo: number | null;
  provenance: Provenance;
}

/** Configuración por defecto prevista para Fase 3 (sin implementar todavía). */
export const DEFAULT_CHART_OVERLAYS: OverlaySpec[] = [
  { kind: "ema", period: 20 },
  { kind: "sma", period: 50 },
  { kind: "sma", period: 200 },
  { kind: "levels52w" },
];

export const DEFAULT_LOWER_PANELS: LowerPanelSpec[] = [{ kind: "volume" }, { kind: "rsi", period: 14 }];
