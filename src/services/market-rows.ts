import type { FundamentalsRepository } from "@/data/repositories/fundamentals-repository";
import type { GroupIndexRepository } from "@/data/repositories/group-index-repository";
import type { NewsRepository } from "@/data/repositories/news-repository";
import type { MarketDataRepository } from "@/data/repositories/market-data-repository";
import type { PriceHistoryRepository } from "@/data/repositories/price-history-repository";
import type { ReferenceRepository } from "@/data/repositories/reference-repository";
import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { Provenance } from "@/domain/provenance";
import type { SecuritySummary } from "@/domain/reference";
import type { TimeRange } from "@/domain/time-range";
import { computeGroupBreadth, computeGroupPerformance } from "@/lib/calculations/group-performance";
import { groupBy } from "@/lib/calculations/aggregation";
import { rankRows } from "@/lib/calculations/ranking";
import type { RankingDefinition } from "@/domain/ranking";

export interface Repositories {
  reference: ReferenceRepository;
  marketData: MarketDataRepository;
  /** Precios sincronizados (Fase 2B). Solo los valores piloto tienen datos; el resto sigue en DEMO. */
  priceHistory: PriceHistoryRepository;
  /** Fundamentales sincronizados (SEC XBRL). */
  fundamentals: FundamentalsRepository;
  /** Índices sintéticos de MarketRadar por grupo (sector, industria…). */
  groupIndices: GroupIndexRepository;
  /** Eventos y noticias procesados por el News Engine (Fase 4). */
  news: NewsRepository;
}

/** Valor + su instantánea de mercado. Es la fila base de tablas, rankings y heatmaps. */
export interface MarketRow {
  ticker: string;
  summary: SecuritySummary;
  snapshot: SecurityMarketSnapshot | null;
}

export interface MarketRows {
  rows: MarketRow[];
  provenance: Provenance;
}

export async function attachMarketData(repos: Repositories, securities: readonly SecuritySummary[]): Promise<MarketRows> {
  const { data, provenance } = await repos.marketData.getSnapshots(
    securities.map((s) => ({ securityId: s.securityId, ticker: s.ticker, currency: s.currency })),
  );
  return {
    rows: securities.map((summary) => ({ ticker: summary.ticker, summary, snapshot: data.get(summary.securityId) ?? null })),
    provenance,
  };
}

export const byMarketCapDesc = (a: MarketRow, b: MarketRow) =>
  (b.snapshot?.marketCap ?? -1) - (a.snapshot?.marketCap ?? -1) || a.ticker.localeCompare(b.ticker);

/**
 * Una fila por emisor: la cotización principal (is_primary) o, si no está en el conjunto, la primera.
 * Breadth y medias equiponderadas cuentan COMPAÑÍAS (Alphabet = 1 aunque GOOGL y GOOG estén en el índice).
 */
export function companyRows<T extends { summary: { companyId: string; isPrimary: boolean } }>(rows: readonly T[]): T[] {
  const byCompany = new Map<string, T>();
  for (const r of rows) {
    const current = byCompany.get(r.summary.companyId);
    if (!current || (!current.summary.isPrimary && r.summary.isPrimary)) byCompany.set(r.summary.companyId, r);
  }
  return rows.filter((r) => byCompany.get(r.summary.companyId) === r);
}

export function groupStats(rows: readonly MarketRow[], range: TimeRange) {
  const snapshots = rows.map((r) => r.snapshot);
  const companies = companyRows(rows).map((r) => r.snapshot);
  return {
    performance: computeGroupPerformance(snapshots, companies),
    breadth: computeGroupBreadth(companies, range),
    securities: rows.length,
    companies: companies.length,
  };
}

export interface RankingResult {
  definition: RankingDefinition;
  rows: { row: MarketRow; metricValue: number }[];
}

export function computeRankings(rows: readonly MarketRow[], definitions: readonly RankingDefinition[]): RankingResult[] {
  return definitions.map((definition) => ({ definition, rows: rankRows(rows, definition) }));
}

/** Filas agrupadas por un nodo de clasificación, con sus métricas agregadas. */
export interface ClassificationGroup {
  id: string;
  name: string;
  slug: string;
  code: string;
  rows: MarketRow[];
  stats: ReturnType<typeof groupStats>;
}

export function groupByClassification(
  rows: readonly MarketRow[],
  level: "sector" | "industryGroup" | "industry" | "subIndustry",
  range: TimeRange,
): ClassificationGroup[] {
  const classified = rows.filter((r) => r.summary.classification);
  const groups = groupBy(classified, (r) => r.summary.classification?.[level].id ?? "");
  return [...groups.values()]
    .map((groupRows) => {
      const node = groupRows[0]?.summary.classification?.[level];
      return {
        id: node?.id ?? "",
        name: node?.name ?? "",
        slug: node?.slug ?? "",
        code: node?.code ?? "",
        rows: [...groupRows].sort(byMarketCapDesc),
        stats: groupStats(groupRows, range),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
