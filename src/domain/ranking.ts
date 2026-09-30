import type { TimeRange } from "./time-range";

/**
 * Definición declarativa de un ranking. El registro vive en `config/rankings.ts`;
 * añadir un ranking (Fase 3: EPS growth, FCF yield, ROIC…) = añadir una entrada.
 */
export type RankingMetric =
  | { kind: "return"; range: TimeRange }
  | { kind: "volume" }
  | { kind: "dollarVolume" }
  | { kind: "relativeVolume" }
  | { kind: "rsi14" }
  | { kind: "distanceFrom52wHigh" }
  | { kind: "distanceFrom52wLow" };

export type RankingDirection = "desc" | "asc";

export type RankingColumn = "price" | "return" | "volume" | "relativeVolume" | "rsi14" | "marketCap";

export interface RankingDefinition {
  id: string;
  title: string;
  description: string;
  metric: RankingMetric;
  direction: RankingDirection;
  /** Columnas adicionales a mostrar (además de símbolo y sector). */
  columns: RankingColumn[];
  limit: number;
  /** Filtro opcional previo (p. ej. solo nuevos máximos de 52 semanas). */
  filter?: "new52wHigh" | "new52wLow";
}
