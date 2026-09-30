import { groupRankings } from "@/config/rankings";
import { benchmarkForIndex } from "@/config/market-overview";
import type { MarketIndex } from "@/domain/market-index";
import type { Provenance } from "@/domain/provenance";
import type { TimeRange } from "@/domain/time-range";
import { sectorPath } from "@/lib/routes";
import { getBenchmarks, type BenchmarkItem } from "./dashboard";
import { buildHeatmap, type HeatmapData } from "./heatmap";
import { applyGroupIndexReturns, LEVEL_KIND } from "./group-index-returns";
import {
  attachMarketData,
  byMarketCapDesc,
  type ClassificationGroup,
  computeRankings,
  groupByClassification,
  groupStats,
  type MarketRow,
  type RankingResult,
  type Repositories,
} from "./market-rows";

export interface MarketsOverview {
  indices: { index: MarketIndex; constituents: number }[];
}

export async function getMarketsOverview(repos: Repositories): Promise<MarketsOverview> {
  const [indices, counts] = await Promise.all([repos.reference.listIndices(), repos.reference.countIndexConstituents()]);
  const kindOrder = (i: MarketIndex) => (i.kind === "official" ? 0 : 1);
  return {
    indices: indices
      .map((index) => ({ index, constituents: counts.get(index.id) ?? 0 }))
      .sort((a, b) => kindOrder(a.index) - kindOrder(b.index) || b.constituents - a.constituents || a.index.name.localeCompare(b.index.name)),
  };
}

export interface IndexPageData {
  index: MarketIndex;
  range: TimeRange;
  /** Cotización del índice oficial (si existe un benchmark configurado). */
  benchmark: { item: BenchmarkItem; provenance: Provenance } | null;
  constituents: {
    rows: MarketRow[];
    provenance: Provenance;
    stats: ReturnType<typeof groupStats>;
    sectors: ClassificationGroup[];
    heatmap: HeatmapData;
    rankings: RankingResult[];
  } | null;
}

export async function getIndexPageData(repos: Repositories, slug: string, range: TimeRange): Promise<IndexPageData | null> {
  const index = await repos.reference.getIndexBySlug(slug);
  if (!index) return null;

  const benchmarkDefinition = benchmarkForIndex(index.slug);
  const benchmark = benchmarkDefinition
    ? await getBenchmarks(repos, [benchmarkDefinition]).then(({ items, provenance }) =>
        items[0] ? { item: items[0], provenance } : null,
      )
    : null;

  if (!index.constituentsTracked) return { index, range, benchmark, constituents: null };

  const securities = await repos.reference.listSecurities({ indexSlug: index.slug });
  const { rows, provenance } = await attachMarketData(repos, securities);
  const stats = groupStats(rows, range);
  const sectors = groupByClassification(rows, "sector", range);
  await applyGroupIndexReturns(repos, [
    { kind: "index", key: index.slug, performance: stats.performance },
    ...sectors.map((g) => ({ kind: LEVEL_KIND.sector, key: g.id, performance: g.stats.performance })),
  ]);
  return {
    index,
    range,
    benchmark,
    constituents: {
      rows: [...rows].sort(byMarketCapDesc),
      provenance,
      stats,
      sectors,
      heatmap: buildHeatmap(rows, range, "sector", sectorPath),
      rankings: computeRankings(rows, groupRankings(range)),
    },
  };
}
