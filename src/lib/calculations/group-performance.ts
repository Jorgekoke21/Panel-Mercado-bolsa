import type { SecurityMarketSnapshot } from "@/domain/market-data";
import { TIME_RANGES, type TimeRange } from "@/domain/time-range";
import { capWeightedReturn, equalWeightedReturn } from "./aggregation";
import { type BreadthInput, computeBreadth } from "./breadth";

/**
 * Métricas agregadas de un grupo de valores (sector, industria, índice, universo).
 * Son agregados calculados por MarketRadar: la UI debe etiquetarlos como SYNTHETIC.
 */

export type MoneyAggregate =
  | { kind: "single"; value: number; currency: string }
  | { kind: "mixed"; currencies: string[] }
  | { kind: "empty" };

/**
 * Suma importes solo si comparten divisa. Con varias divisas devuelve "mixed" en lugar de
 * sumar peras con manzanas (la conversión FX llegará con el universo global).
 */
export function aggregateMoney(items: readonly { value: number | null; currency: string }[]): MoneyAggregate {
  const valid = items.filter((i): i is { value: number; currency: string } => typeof i.value === "number" && Number.isFinite(i.value));
  if (valid.length === 0) return { kind: "empty" };
  const currencies = [...new Set(valid.map((i) => i.currency))].sort();
  if (currencies.length > 1) return { kind: "mixed", currencies };
  return { kind: "single", value: valid.reduce((sum, i) => sum + i.value, 0), currency: currencies[0] ?? "" };
}

export interface GroupPerformance {
  count: number;
  marketCap: MoneyAggregate;
  capWeighted: Partial<Record<TimeRange, number | null>>;
  equalWeighted: Partial<Record<TimeRange, number | null>>;
}

type Snapshots = readonly (SecurityMarketSnapshot | null)[];

/**
 * `snapshots`: todas las securities (cap-weighted con la capitalización de cada security).
 * `companySnapshots`: una por emisor (equal-weighted: una compañía con dos clases cotizadas no pesa doble).
 */
export function computeGroupPerformance(snapshots: Snapshots, companySnapshots: Snapshots = snapshots): GroupPerformance {
  const capWeighted: GroupPerformance["capWeighted"] = {};
  const equalWeighted: GroupPerformance["equalWeighted"] = {};
  for (const range of TIME_RANGES) {
    capWeighted[range] = capWeightedReturn(
      snapshots.map((s) => ({ marketCap: s?.marketCap ?? null, return: s?.returns[range] ?? null })),
    );
    equalWeighted[range] = equalWeightedReturn(companySnapshots.map((s) => s?.returns[range] ?? null));
  }
  return {
    count: snapshots.length,
    marketCap: aggregateMoney(
      snapshots.flatMap((s) => (s ? [{ value: s.marketCap, currency: s.currency }] : [])),
    ),
    capWeighted,
    equalWeighted,
  };
}

export function toBreadthInput(snapshot: SecurityMarketSnapshot | null, range: TimeRange): BreadthInput {
  return {
    return: snapshot?.returns[range] ?? null,
    price: snapshot?.price ?? null,
    ema20: snapshot?.ema20 ?? null,
    ema50: snapshot?.ema50 ?? null,
    ema200: snapshot?.ema200 ?? null,
    rsi14: snapshot?.rsi14 ?? null,
    isNew52wHigh: snapshot?.isNew52wHigh ?? false,
    isNew52wLow: snapshot?.isNew52wLow ?? false,
  };
}

export function computeGroupBreadth(snapshots: Snapshots, range: TimeRange) {
  return computeBreadth(snapshots.map((s) => toBreadthInput(s, range)));
}
