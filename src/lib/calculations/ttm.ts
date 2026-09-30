import { type FundamentalOrigin, lineItemDefinition, type FinancialStatementValue, type LineItemCode } from "@/domain/fundamentals";

/**
 * TTM (trailing twelve months) como dato DERIVADO de los trimestres almacenados.
 *
 *   * Partidas de flujo (duration): suma de los 4 últimos trimestres, que deben ser consecutivos
 *     (separación de 77–120 días entre cierres: trimestres de 12 a 16 semanas). Si falta alguno → null.
 *   * Partidas de balance (instant): valor del último trimestre.
 */
export interface TtmValue {
  lineItem: LineItemCode;
  value: number;
  /** Cierre del trimestre más reciente incluido. */
  asOfPeriodEnd: string;
  quarters: string[];
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/**
 * `origins`: orígenes admitidos en la suma. Nunca se mezclan fuentes distintas (el llamador filtra por
 * fuente) ni valores del proveedor con cálculos. Para SEC: reported + derived (Q4 derivado).
 */
export function computeTtm(
  values: readonly FinancialStatementValue[],
  lineItem: LineItemCode,
  origins: FundamentalOrigin | readonly FundamentalOrigin[] = "provider",
): TtmValue | null {
  const allowed = new Set(Array.isArray(origins) ? origins : [origins]);
  const quarters = (values.filter((v) => v.lineItem === lineItem && v.periodType === "quarterly" && allowed.has(v.origin) && v.value !== null) as (FinancialStatementValue & { value: number })[])
    .sort((a, b) => b.fiscalPeriodEnd.localeCompare(a.fiscalPeriodEnd));
  const latest = quarters[0];
  if (!latest) return null;
  if (lineItemDefinition(lineItem).nature === "instant") {
    return { lineItem, value: latest.value, asOfPeriodEnd: latest.fiscalPeriodEnd, quarters: [latest.fiscalPeriodEnd] };
  }
  const window = quarters.slice(0, 4);
  if (window.length < 4) return null;
  for (let i = 1; i < window.length; i++) {
    const gap = daysBetween(window[i]!.fiscalPeriodEnd, window[i - 1]!.fiscalPeriodEnd);
    // Trimestres de 12 a 16 semanas (calendarios 4-4-5 / 16-12-12-12).
    if (gap < 77 || gap > 120) return null;
  }
  return {
    lineItem,
    value: window.reduce((sum, v) => sum + v.value, 0),
    asOfPeriodEnd: latest.fiscalPeriodEnd,
    quarters: window.map((v) => v.fiscalPeriodEnd),
  };
}
