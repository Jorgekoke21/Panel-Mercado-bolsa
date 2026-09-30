import type { RankingDefinition } from "@/domain/ranking";
import type { TimeRange } from "@/domain/time-range";

/**
 * Registro de rankings. Los de rendimiento dependen del periodo seleccionado.
 * Fase 3 añadirá Revenue Growth, EPS Growth, FCF Yield, ROIC… como nuevas entradas.
 */
export function marketRankings(range: TimeRange, limit = 10): RankingDefinition[] {
  return [
    {
      id: "top-gainers",
      title: "Top Gainers",
      description: `Highest return over ${range}`,
      metric: { kind: "return", range },
      direction: "desc",
      columns: ["price", "return"],
      limit,
    },
    {
      id: "top-losers",
      title: "Top Losers",
      description: `Lowest return over ${range}`,
      metric: { kind: "return", range },
      direction: "asc",
      columns: ["price", "return"],
      limit,
    },
    {
      id: "most-active",
      title: "Most Active",
      description: "Highest dollar volume in the last session",
      metric: { kind: "dollarVolume" },
      direction: "desc",
      columns: ["price", "volume"],
      limit,
    },
    {
      id: "relative-volume",
      title: "Relative Volume",
      description: "Volume vs 20-session average",
      metric: { kind: "relativeVolume" },
      direction: "desc",
      columns: ["price", "relativeVolume"],
      limit,
    },
    {
      id: "highest-rsi",
      title: "Highest RSI",
      description: "RSI (14) — highest readings",
      metric: { kind: "rsi14" },
      direction: "desc",
      columns: ["price", "rsi14"],
      limit,
    },
    {
      id: "lowest-rsi",
      title: "Lowest RSI",
      description: "RSI (14) — lowest readings",
      metric: { kind: "rsi14" },
      direction: "asc",
      columns: ["price", "rsi14"],
      limit,
    },
    {
      id: "new-52w-highs",
      title: "52W Highs",
      description: "Trading at a new 52-week high",
      metric: { kind: "return", range: "1D" },
      direction: "desc",
      columns: ["price", "return"],
      limit,
      filter: "new52wHigh",
    },
    {
      id: "new-52w-lows",
      title: "52W Lows",
      description: "Trading at a new 52-week low",
      metric: { kind: "return", range: "1D" },
      direction: "asc",
      columns: ["price", "return"],
      limit,
      filter: "new52wLow",
    },
  ];
}

/** Subconjunto compacto para páginas de sector/industria. */
export function groupRankings(range: TimeRange, limit = 5): RankingDefinition[] {
  const byId = new Map(marketRankings(range, limit).map((r) => [r.id, r]));
  return ["top-gainers", "top-losers", "relative-volume", "highest-rsi", "lowest-rsi", "most-active"].flatMap((id) => {
    const def = byId.get(id);
    return def ? [def] : [];
  });
}
