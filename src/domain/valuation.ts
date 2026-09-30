/**
 * Métricas de valoración.
 *
 * Se distingue siempre el ORIGEN del valor:
 *   * provider: ratio publicado por el proveedor (metodología del proveedor).
 *   * calculated: ratio calculado por MarketRadar con sus propios datos y metodología.
 * Nunca se mezclan ni se presentan uno como el otro.
 */
export const VALUATION_METRICS = [
  "market_cap",
  "enterprise_value",
  "pe_ttm",
  "pe_forward",
  "peg",
  "ps_ttm",
  "pb_mrq",
  "ev_revenue",
  "ev_ebitda",
  "dividend_yield",
] as const;

export type ValuationMetric = (typeof VALUATION_METRICS)[number];

export type ValueOrigin = "provider" | "calculated";

export interface ValuationValue {
  metric: ValuationMetric;
  value: number;
  origin: ValueOrigin;
  /** Campo del proveedor o nombre del método de cálculo. */
  method: string;
}
