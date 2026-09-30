import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { RankingDefinition, RankingMetric } from "@/domain/ranking";

export interface RankableRow {
  ticker: string;
  snapshot: SecurityMarketSnapshot | null;
}

export interface RankedRow<T extends RankableRow> {
  row: T;
  metricValue: number;
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function metricValue(snapshot: SecurityMarketSnapshot | null, metric: RankingMetric): number | null {
  if (!snapshot) return null;
  switch (metric.kind) {
    case "return":
      return snapshot.returns[metric.range] ?? null;
    case "volume":
      return snapshot.volume;
    case "dollarVolume":
      return isNumber(snapshot.volume) && isNumber(snapshot.price) ? snapshot.volume * snapshot.price : null;
    case "relativeVolume":
      return snapshot.relativeVolume;
    case "rsi14":
      return snapshot.rsi14;
    case "distanceFrom52wHigh":
      return isNumber(snapshot.price) && isNumber(snapshot.high52w) && snapshot.high52w > 0
        ? snapshot.price / snapshot.high52w - 1
        : null;
    case "distanceFrom52wLow":
      return isNumber(snapshot.price) && isNumber(snapshot.low52w) && snapshot.low52w > 0
        ? snapshot.price / snapshot.low52w - 1
        : null;
  }
}

/**
 * Ordena según la definición. Excluye filas sin dato (nunca se "rellenan" con 0) y
 * desempata por ticker para que el resultado sea estable.
 */
export function rankRows<T extends RankableRow>(rows: readonly T[], definition: RankingDefinition): RankedRow<T>[] {
  const direction = definition.direction === "desc" ? -1 : 1;
  return rows
    .filter((row) => {
      if (definition.filter === "new52wHigh") return row.snapshot?.isNew52wHigh === true;
      if (definition.filter === "new52wLow") return row.snapshot?.isNew52wLow === true;
      return true;
    })
    .flatMap((row) => {
      const value = metricValue(row.snapshot, definition.metric);
      return isNumber(value) ? [{ row, metricValue: value }] : [];
    })
    .sort((a, b) => direction * (a.metricValue - b.metricValue) || a.row.ticker.localeCompare(b.row.ticker))
    .slice(0, definition.limit);
}
