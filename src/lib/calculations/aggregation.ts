/**
 * Agregaciones de grupo (sector, industria, índice).
 *
 * Nota metodológica: `capWeightedReturn` pondera por la capitalización ACTUAL de cada
 * miembro. Es una aproximación válida para mostrar el rendimiento agregado de un periodo,
 * pero no sustituye al cálculo de un índice sintético con pesos al inicio del periodo y
 * rebalanceos, que llegará en Fase 2 con históricos reales.
 */

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function sum(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  let count = 0;
  for (const v of values) {
    if (isNumber(v)) {
      total += v;
      count++;
    }
  }
  return count > 0 ? total : null;
}

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const valid = values.filter(isNumber);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

export interface WeightedReturnInput {
  marketCap: number | null | undefined;
  return: number | null | undefined;
}

export function capWeightedReturn(items: readonly WeightedReturnInput[]): number | null {
  let weighted = 0;
  let weights = 0;
  for (const item of items) {
    if (isNumber(item.marketCap) && item.marketCap > 0 && isNumber(item.return)) {
      weighted += item.marketCap * item.return;
      weights += item.marketCap;
    }
  }
  return weights > 0 ? weighted / weights : null;
}

export function equalWeightedReturn(returns: readonly (number | null | undefined)[]): number | null {
  return mean(returns);
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/** Peso de cada elemento sobre el total (fracción); null si no hay total. */
export function weights(values: readonly (number | null | undefined)[]): (number | null)[] {
  const total = sum(values.map((v) => (isNumber(v) && v > 0 ? v : null)));
  return values.map((v) => (total && isNumber(v) && v > 0 ? v / total : null));
}
