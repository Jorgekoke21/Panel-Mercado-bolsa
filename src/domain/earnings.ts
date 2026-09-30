/**
 * Resultados trimestrales (earnings) y estimaciones de consenso.
 * NULL es mejor que un dato inferido: si el proveedor no da un campo, queda null.
 */

export type ReportTiming = "before_market" | "after_market" | "during_market";

/**
 * Base contable del EPS del proveedor. EODHD no la documenta ⇒ "unspecified".
 * Este EPS NUNCA se presenta como GAAP EPS salvo que la base sea "gaap".
 */
export type EpsBasis = "unspecified" | "gaap" | "non_gaap";

export interface EarningsEvent {
  /** Cierre del periodo fiscal al que corresponde el resultado. */
  fiscalPeriodEnd: string;
  /** Fecha de publicación (anunciada o efectiva). */
  reportDate: string | null;
  timing: ReportTiming | null;
  /** "Provider earnings EPS": EPS publicado por el proveedor en su historial de earnings. */
  providerEpsActual: number | null;
  providerEpsEstimate: number | null;
  /** Solo si existen actual y estimate. */
  providerEpsSurprise: number | null;
  /** Porcentaje (7.44 = +7.44 %), solo si el proveedor lo da y existen actual y estimate. */
  providerEpsSurprisePercent: number | null;
  epsBasis: EpsBasis;
  currency: string | null;
}

export interface EarningsEstimate {
  /** Código de periodo del proveedor normalizado: 0q (trimestre actual), +1q, 0y, +1y. */
  periodCode: string;
  periodEnd: string;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  epsYearAgo: number | null;
  epsAnalysts: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  revenueAnalysts: number | null;
}
