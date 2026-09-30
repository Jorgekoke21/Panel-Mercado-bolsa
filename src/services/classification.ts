import { groupRankings } from "@/config/rankings";
import type { EntityCrumb } from "@/domain/entity";
import type { Provenance } from "@/domain/provenance";
import type { Industry, IndustryGroup, Sector, SubIndustry } from "@/domain/reference";
import type { TimeRange } from "@/domain/time-range";
import { industryPath, sectorPath, subIndustryPath } from "@/lib/routes";
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

/**
 * Sectores, industrias y sub-industrias. El universo es el conjunto de valores activos en la
 * base de datos (hoy S&P 500): las páginas no dependen de un índice concreto.
 */

interface GroupPageBase {
  range: TimeRange;
  crumbs: EntityCrumb[];
  rows: MarketRow[];
  provenance: Provenance;
  stats: ReturnType<typeof groupStats>;
  rankings: RankingResult[];
  heatmap: HeatmapData;
}

export interface SectorsOverview {
  range: TimeRange;
  sectors: (ClassificationGroup & { sector: Sector; industries: number })[];
  provenance: Provenance;
  universeSecurities: number;
}

export async function getSectorsOverview(repos: Repositories, range: TimeRange): Promise<SectorsOverview> {
  const [sectors, industries, groups, securities] = await Promise.all([
    repos.reference.listSectors(),
    repos.reference.listIndustries(),
    repos.reference.listIndustryGroups(),
    repos.reference.listSecurities(),
  ]);
  const { rows, provenance } = await attachMarketData(repos, securities);
  const bySector = new Map(groupByClassification(rows, "sector", range).map((g) => [g.id, g]));
  await applyGroupIndexReturns(repos, [...bySector.values()].map((g) => ({ kind: LEVEL_KIND.sector, key: g.id, performance: g.stats.performance })));
  const sectorOfGroup = new Map(groups.map((g) => [g.id, g.sectorId]));
  return {
    range,
    provenance,
    universeSecurities: securities.length,
    sectors: sectors.map((sector) => {
      const group = bySector.get(sector.id);
      return {
        id: sector.id,
        name: sector.name,
        slug: sector.slug,
        code: sector.code,
        rows: group?.rows ?? [],
        stats: group?.stats ?? groupStats([], range),
        sector,
        industries: industries.filter((i) => sectorOfGroup.get(i.industryGroupId) === sector.id).length,
      };
    }),
  };
}

export interface SectorPageData extends GroupPageBase {
  sector: Sector;
  industryGroups: (IndustryGroup & { industries: (ClassificationGroup & { industry: Industry })[] })[];
}

export async function getSectorPageData(repos: Repositories, slug: string, range: TimeRange): Promise<SectorPageData | null> {
  const sector = await repos.reference.getSectorBySlug(slug);
  if (!sector) return null;
  const [groups, industries, securities] = await Promise.all([
    repos.reference.listIndustryGroups(sector.id),
    repos.reference.listIndustries(),
    repos.reference.listSecurities({ sectorId: sector.id }),
  ]);
  const { rows, provenance } = await attachMarketData(repos, securities);
  const byIndustry = new Map(groupByClassification(rows, "industry", range).map((g) => [g.id, g]));
  const stats = groupStats(rows, range);
  await applyGroupIndexReturns(repos, [
    { kind: LEVEL_KIND.sector, key: sector.id, performance: stats.performance },
    ...[...byIndustry.values()].map((g) => ({ kind: LEVEL_KIND.industry, key: g.id, performance: g.stats.performance })),
  ]);

  return {
    sector,
    range,
    crumbs: [{ kind: "sector", label: sector.name, href: sectorPath(sector.slug) }],
    rows: [...rows].sort(byMarketCapDesc),
    provenance,
    stats,
    rankings: computeRankings(rows, groupRankings(range)),
    heatmap: buildHeatmap(rows, range, "industry", industryPath),
    industryGroups: groups.map((group) => ({
      ...group,
      industries: industries
        .filter((i) => i.industryGroupId === group.id)
        .map((industry) => {
          const g = byIndustry.get(industry.id);
          return {
            id: industry.id,
            name: industry.name,
            slug: industry.slug,
            code: industry.code,
            rows: g?.rows ?? [],
            stats: g?.stats ?? groupStats([], range),
            industry,
          };
        }),
    })),
  };
}

async function industryContext(repos: Repositories, industry: Industry) {
  const [groups, sectors] = await Promise.all([repos.reference.listIndustryGroups(), repos.reference.listSectors()]);
  const group = groups.find((g) => g.id === industry.industryGroupId) ?? null;
  const sector = group ? (sectors.find((s) => s.id === group.sectorId) ?? null) : null;
  return { group, sector };
}

export interface IndustryPageData extends GroupPageBase {
  industry: Industry;
  industryGroup: IndustryGroup | null;
  sector: Sector | null;
  subIndustries: (ClassificationGroup & { subIndustry: SubIndustry })[];
}

export async function getIndustryPageData(repos: Repositories, slug: string, range: TimeRange): Promise<IndustryPageData | null> {
  const industry = await repos.reference.getIndustryBySlug(slug);
  if (!industry) return null;
  const [{ group, sector }, subIndustries, securities] = await Promise.all([
    industryContext(repos, industry),
    repos.reference.listSubIndustries(industry.id),
    repos.reference.listSecurities({ industryId: industry.id }),
  ]);
  const { rows, provenance } = await attachMarketData(repos, securities);
  const bySub = new Map(groupByClassification(rows, "subIndustry", range).map((g) => [g.id, g]));
  const stats = groupStats(rows, range);
  await applyGroupIndexReturns(repos, [
    { kind: LEVEL_KIND.industry, key: industry.id, performance: stats.performance },
    ...[...bySub.values()].map((g) => ({ kind: LEVEL_KIND.subIndustry, key: g.id, performance: g.stats.performance })),
  ]);

  return {
    industry,
    industryGroup: group,
    sector,
    range,
    crumbs: [
      ...(sector ? [{ kind: "sector" as const, label: sector.name, href: sectorPath(sector.slug) }] : []),
      { kind: "industry", label: industry.name, href: industryPath(industry.slug) },
    ],
    rows: [...rows].sort(byMarketCapDesc),
    provenance,
    stats,
    rankings: computeRankings(rows, groupRankings(range)),
    heatmap: buildHeatmap(rows, range, "subIndustry", (subSlug) => subIndustryPath(industry.slug, subSlug)),
    subIndustries: subIndustries.map((subIndustry) => {
      const g = bySub.get(subIndustry.id);
      return {
        id: subIndustry.id,
        name: subIndustry.name,
        slug: subIndustry.slug,
        code: subIndustry.code,
        rows: g?.rows ?? [],
        stats: g?.stats ?? groupStats([], range),
        subIndustry,
      };
    }),
  };
}

export interface SubIndustryPageData extends GroupPageBase {
  subIndustry: SubIndustry;
  industry: Industry;
  sector: Sector | null;
  siblings: SubIndustry[];
}

export async function getSubIndustryPageData(
  repos: Repositories,
  industrySlug: string,
  subSlug: string,
  range: TimeRange,
): Promise<SubIndustryPageData | null> {
  const industry = await repos.reference.getIndustryBySlug(industrySlug);
  if (!industry) return null;
  const siblings = await repos.reference.listSubIndustries(industry.id);
  const subIndustry = siblings.find((s) => s.slug === subSlug);
  if (!subIndustry) return null;
  const [{ sector }, securities] = await Promise.all([
    industryContext(repos, industry),
    repos.reference.listSecurities({ subIndustryId: subIndustry.id }),
  ]);
  const { rows, provenance } = await attachMarketData(repos, securities);
  const stats = groupStats(rows, range);
  await applyGroupIndexReturns(repos, [{ kind: LEVEL_KIND.subIndustry, key: subIndustry.id, performance: stats.performance }]);

  return {
    subIndustry,
    industry,
    sector,
    siblings,
    range,
    crumbs: [
      ...(sector ? [{ kind: "sector" as const, label: sector.name, href: sectorPath(sector.slug) }] : []),
      { kind: "industry", label: industry.name, href: industryPath(industry.slug) },
      { kind: "subIndustry", label: subIndustry.name, href: subIndustryPath(industry.slug, subIndustry.slug) },
    ],
    rows: [...rows].sort(byMarketCapDesc),
    provenance,
    stats,
    rankings: computeRankings(rows, groupRankings(range)),
    heatmap: buildHeatmap(rows, range, "subIndustry", () => null),
  };
}
