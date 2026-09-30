import { MARKET_OVERVIEW } from "@/config/market-overview";
import { marketRankings } from "@/config/rankings";
import { PRIMARY_UNIVERSE } from "@/config/universe";
import type { BenchmarkDefinition, BenchmarkQuote } from "@/domain/market-data";
import type { Provenance } from "@/domain/provenance";
import type { TimeRange } from "@/domain/time-range";
import { sectorPath } from "@/lib/routes";
import { buildHeatmap, type HeatmapData } from "./heatmap";
import { applyGroupIndexReturns, LEVEL_KIND } from "./group-index-returns";
import {
  attachMarketData,
  type ClassificationGroup,
  computeRankings,
  groupByClassification,
  groupStats,
  type RankingResult,
  type Repositories,
} from "./market-rows";

export interface BenchmarkItem {
  definition: BenchmarkDefinition;
  quote: BenchmarkQuote | null;
}

export interface DashboardData {
  range: TimeRange;
  universe: { label: string; indexSlug: string; securities: number };
  benchmarks: { items: BenchmarkItem[]; provenance: Provenance };
  heatmap: HeatmapData;
  sectors: ClassificationGroup[];
  universeStats: ReturnType<typeof groupStats>;
  rankings: RankingResult[];
  marketProvenance: Provenance;
}

export async function getBenchmarks(repos: Repositories, definitions: readonly BenchmarkDefinition[] = MARKET_OVERVIEW) {
  const { data, provenance } = await repos.marketData.getBenchmarkQuotes(definitions);
  const byId = new Map(data.map((q) => [q.benchmarkId, q]));
  return { items: definitions.map((definition) => ({ definition, quote: byId.get(definition.id) ?? null })), provenance };
}

export async function getDashboardData(repos: Repositories, range: TimeRange): Promise<DashboardData> {
  const [securities, benchmarks] = await Promise.all([
    repos.reference.listSecurities({ indexSlug: PRIMARY_UNIVERSE.indexSlug }),
    getBenchmarks(repos),
  ]);
  const { rows, provenance } = await attachMarketData(repos, securities);
  const sectors = groupByClassification(rows, "sector", range);
  const universeStats = groupStats(rows, range);
  await applyGroupIndexReturns(repos, [
    { kind: "index", key: PRIMARY_UNIVERSE.indexSlug, performance: universeStats.performance },
    ...sectors.map((g) => ({ kind: LEVEL_KIND.sector, key: g.id, performance: g.stats.performance })),
  ]);
  return {
    range,
    universe: { label: PRIMARY_UNIVERSE.label, indexSlug: PRIMARY_UNIVERSE.indexSlug, securities: securities.length },
    benchmarks,
    heatmap: buildHeatmap(rows, range, "sector", sectorPath),
    sectors,
    universeStats,
    rankings: computeRankings(rows, marketRankings(range)),
    marketProvenance: provenance,
  };
}
