import type { CalculationMissingReason, FinancialStatementValue, LineItemCode, StoredPeriodType } from "@/domain/fundamentals";

/**
 * Fundamentales DERIVADOS por MarketRadar (value_origin = 'calculated').
 *
 * Nunca sobrescriben el valor del proveedor: conviven con él (misma partida, distinto origen).
 *
 *   * EPS básico/diluido = net income to common / acciones medias ponderadas (básicas/diluidas).
 *     Solo si existen ambos componentes. Las acciones a CIERRE de periodo NO son un sustituto:
 *     si faltan las medias ponderadas, el EPS calculado es NULL con motivo explícito.
 *   * FCF calculado = operating cash flow − capex (capex es positivo por convención del adaptador).
 *     Si diverge materialmente del FCF del proveedor se emite un aviso (no se corrige ninguno).
 */

export const EPS_FORMULAS = {
  eps_basic: { numerator: "net_income_to_common", denominator: "weighted_average_shares_basic" },
  eps_diluted: { numerator: "net_income_to_common", denominator: "weighted_average_shares_diluted" },
} as const satisfies Record<string, { numerator: LineItemCode; denominator: LineItemCode }>;

export const FCF_FORMULA = "marketradar:operating_cash_flow-capital_expenditure";

/** Divergencia material: > 1 % del mayor valor absoluto (y distinto de cero). */
export const FCF_DIVERGENCE_THRESHOLD = 0.01;

export interface FcfDivergence {
  periodType: StoredPeriodType;
  fiscalPeriodEnd: string;
  providerFcf: number;
  calculatedFcf: number;
  /** |provider − calculated| / max(|provider|, |calculated|). */
  relativeDifference: number;
}

export interface DerivedFinancials {
  values: FinancialStatementValue[];
  fcfDivergences: FcfDivergence[];
}

const periodKey = (v: { periodType: string; fiscalPeriodEnd: string }) => `${v.periodType}|${v.fiscalPeriodEnd}`;

export function relativeDifference(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

export function deriveFinancials(input: readonly FinancialStatementValue[]): DerivedFinancials {
  // Base: valores del proveedor o de filings (reportados / derivados). Nunca otros cálculos.
  const provider = input.filter((v) => v.origin !== "calculated" && v.value !== null);
  const byPeriod = new Map<string, Map<LineItemCode, FinancialStatementValue>>();
  for (const v of provider) {
    const key = periodKey(v);
    let items = byPeriod.get(key);
    if (!items) byPeriod.set(key, (items = new Map()));
    items.set(v.lineItem, v);
  }

  const values: FinancialStatementValue[] = [];
  const fcfDivergences: FcfDivergence[] = [];

  for (const items of byPeriod.values()) {
    const anchor = items.values().next().value as FinancialStatementValue;
    const base = {
      periodType: anchor.periodType,
      fiscalPeriodEnd: anchor.fiscalPeriodEnd,
      filingDate: anchor.filingDate,
      periodStart: anchor.periodStart ?? null,
      fiscalYear: anchor.fiscalYear ?? null,
      fiscalQuarter: anchor.fiscalQuarter ?? null,
      origin: "calculated" as const,
    };

    // EPS: solo para periodos con cuenta de resultados.
    if (items.has("net_income") || items.has("revenue") || items.has("net_income_to_common")) {
      for (const [code, formula] of Object.entries(EPS_FORMULAS) as [keyof typeof EPS_FORMULAS, (typeof EPS_FORMULAS)[keyof typeof EPS_FORMULAS]][]) {
        // Si el filing ya reporta el EPS de ese periodo, no se sustituye ni se duplica.
        if (items.has(code)) continue;
        const numerator = items.get(formula.numerator);
        const denominator = items.get(formula.denominator);
        let value: number | null = null;
        let missingReason: CalculationMissingReason | null = null;
        // Los filings no publican un Q4 separado y las magnitudes por acción no se pueden restar.
        if (!denominator && base.fiscalQuarter === 4) missingReason = "fourth_quarter_not_reported";
        else if (!denominator) missingReason = "provider_missing_weighted_average_shares";
        else if (!numerator) missingReason = "provider_missing_net_income_to_common";
        // Mismo periodo y tipo por construcción; las acciones deben ser positivas.
        else if (!((denominator.value as number) > 0)) missingReason = "incompatible_components";
        else value = (numerator.value as number) / (denominator.value as number);
        values.push({
          ...base,
          lineItem: code,
          currency: numerator?.currency ?? null,
          value,
          missingReason,
          sourceField: `marketradar:${formula.numerator}/${formula.denominator}`,
        });
      }
    }

    // FCF calculado.
    const ocf = items.get("operating_cash_flow");
    const capex = items.get("capital_expenditure");
    if (ocf && capex) {
      const calculated = (ocf.value as number) - (capex.value as number);
      values.push({ ...base, lineItem: "free_cash_flow", currency: ocf.currency, value: calculated, missingReason: null, sourceField: FCF_FORMULA });
      const providerFcf = items.get("free_cash_flow");
      if (providerFcf) {
        const diff = relativeDifference(providerFcf.value as number, calculated);
        if (diff > FCF_DIVERGENCE_THRESHOLD) {
          fcfDivergences.push({
            periodType: base.periodType,
            fiscalPeriodEnd: base.fiscalPeriodEnd,
            providerFcf: providerFcf.value as number,
            calculatedFcf: calculated,
            relativeDifference: diff,
          });
        }
      }
    }
  }

  const order = (v: FinancialStatementValue) => `${v.periodType}|${v.fiscalPeriodEnd}|${v.lineItem}`;
  values.sort((a, b) => order(a).localeCompare(order(b)));
  fcfDivergences.sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
  return { values, fcfDivergences };
}

export function describeFcfDivergence(d: FcfDivergence): string {
  return `free_cash_flow ${d.periodType} ${d.fiscalPeriodEnd}: provider ${d.providerFcf} vs calculated ${d.calculatedFcf} (${(d.relativeDifference * 100).toFixed(1)}% apart)`;
}
