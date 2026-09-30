import { PRIMARY_UNIVERSE } from "@/config/universe";
import type { SecuritySortField } from "@/data/repositories/reference-repository";
import type { EntityCrumb } from "@/domain/entity";
import type { IndexMembership, MarketIndex } from "@/domain/market-index";
import type { Provenance } from "@/domain/provenance";
import type { CompanyProfile, Dataset, Sector, SecuritySummary, Theme } from "@/domain/reference";
import type { TimeRange } from "@/domain/time-range";
import type { GroupPerformance } from "@/lib/calculations/group-performance";
import { industryPath, sectorPath, subIndustryPath } from "@/lib/routes";
import { parseTickerParam } from "@/lib/ticker";
import { getCompanyMarketData, type RealMarketData } from "./company-market-data";
import { applyGroupIndexReturns, LEVEL_KIND } from "./group-index-returns";
import { attachMarketData, byMarketCapDesc, groupStats, type MarketRow, type Repositories } from "./market-rows";

// --- Listado /companies --------------------------------------------------------------------

export const COMPANIES_PAGE_SIZE = 50;
const SORT_FIELDS: readonly SecuritySortField[] = ["ticker", "company", "sector"];

export interface CompaniesListParams {
  q?: string;
  sector?: string;
  index?: string;
  sort?: string;
  dir?: string;
  page?: string;
}

export interface CompaniesListData {
  query: { q: string; sector: string; index: string; sort: SecuritySortField; dir: "asc" | "desc"; page: number };
  rows: MarketRow[];
  total: number;
  pageSize: number;
  provenance: Provenance;
  sectors: Sector[];
  indices: MarketIndex[];
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseCompaniesParams(raw: Record<string, string | string[] | undefined>): CompaniesListData["query"] {
  const sort = first(raw.sort) as SecuritySortField | undefined;
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    q: (first(raw.q) ?? "").trim().slice(0, 64),
    sector: first(raw.sector) ?? "",
    index: first(raw.index) ?? "",
    sort: sort && SORT_FIELDS.includes(sort) ? sort : "ticker",
    dir: first(raw.dir) === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export async function getCompaniesList(
  repos: Repositories,
  query: CompaniesListData["query"],
): Promise<CompaniesListData> {
  const [sectors, indices] = await Promise.all([repos.reference.listSectors(), repos.reference.listIndices()]);
  const sector = sectors.find((s) => s.slug === query.sector);
  const page = await repos.reference.pageSecurities({
    filter: {
      search: query.q || undefined,
      sectorId: sector?.id,
      indexSlug: indices.some((i) => i.slug === query.index) ? query.index : undefined,
    },
    sort: { field: query.sort, direction: query.dir },
    page: query.page,
    pageSize: COMPANIES_PAGE_SIZE,
  });
  const { rows, provenance } = await attachMarketData(repos, page.items);
  return { query, rows, total: page.total, pageSize: page.pageSize, provenance, sectors, indices };
}

// --- Ficha /company/[ticker] ----------------------------------------------------------------

export interface CompanyHeaderData {
  security: SecuritySummary;
  /** Otras clases de acción / cotizaciones del mismo emisor. */
  otherListings: SecuritySummary[];
  memberships: IndexMembership[];
  themes: Theme[];
  crumbs: EntityCrumb[];
  row: MarketRow;
  provenance: Provenance;
  /** Datos reales sincronizados (piloto 2B.1) o null si la ficha sigue en DEMO. */
  realMarketData: RealMarketData | null;
}

export type CompanyLookup =
  | { kind: "found"; data: CompanyHeaderData }
  | { kind: "redirect"; ticker: string }
  | { kind: "not_found" };

export async function getCompanyHeader(repos: Repositories, tickerParam: string): Promise<CompanyLookup> {
  const ticker = parseTickerParam(tickerParam);
  if (!ticker) return { kind: "not_found" };
  if (ticker !== decodeURIComponent(tickerParam)) return { kind: "redirect", ticker };

  const security = await repos.reference.getSecurityByTicker(ticker);
  if (!security) return { kind: "not_found" };

  const [listings, memberships, themes] = await Promise.all([
    repos.reference.listCompanySecurities(security.companyId),
    repos.reference.listIndexMemberships(security.securityId),
    repos.reference.listCompanyThemes(security.companyId),
  ]);
  const real = await getCompanyMarketData(repos, security, { listingsOfIssuer: listings.length });
  // O todo real (valor sincronizado) o todo DEMO: nunca una mezcla silenciosa.
  const market =
    real.kind === "real"
      ? { rows: [{ ticker: security.ticker, summary: security, snapshot: real.snapshot }], provenance: real.provenance }
      : await attachMarketData(repos, [security]);
  const c = security.classification;
  const crumbs: EntityCrumb[] = c
    ? [
        { kind: "sector", label: c.sector.name, href: sectorPath(c.sector.slug) },
        { kind: "industry", label: c.industry.name, href: industryPath(c.industry.slug) },
        { kind: "subIndustry", label: c.subIndustry.name, href: subIndustryPath(c.industry.slug, c.subIndustry.slug) },
      ]
    : [];

  return {
    kind: "found",
    data: {
      security,
      otherListings: listings.filter((l) => l.securityId !== security.securityId),
      memberships,
      themes,
      crumbs,
      row: market.rows[0] ?? { ticker: security.ticker, summary: security, snapshot: null },
      provenance: market.provenance,
      realMarketData: real.kind === "real" ? real : null,
    },
  };
}

export interface RelativePerformanceLine {
  label: string;
  kind: "company" | "synthetic";
  detail: string;
  returns: Partial<Record<TimeRange, number | null>>;
}

export interface CompanyOverviewData {
  profile: CompanyProfile | null;
  /** Rendimiento de la empresa (misma procedencia que la cabecera). */
  company: RelativePerformanceLine;
  /** Agregados sintéticos de industria/sector/universo (DEMO en 2B.1). */
  aggregates: RelativePerformanceLine[];
  aggregatesProvenance: Provenance;
  peers: MarketRow[];
  peersProvenance: Provenance;
  datasets: Dataset[];
  provenance: Provenance;
}

function syntheticLine(label: string, detail: string, perf: GroupPerformance): RelativePerformanceLine {
  return { label, kind: "synthetic", detail, returns: perf.capWeighted };
}

/** Peers: misma sub-industria; si hay menos de 3, se amplía a la industria. */
export async function getCompanyPeers(repos: Repositories, security: SecuritySummary): Promise<{ rows: MarketRow[]; scope: string; provenance: Provenance }> {
  const c = security.classification;
  if (!c) return { rows: [], scope: "", provenance: (await attachMarketData(repos, [])).provenance };
  let scope = c.subIndustry.name;
  let candidates = await repos.reference.listSecurities({ subIndustryId: c.subIndustry.id });
  if (candidates.filter((s) => s.companyId !== security.companyId).length < 3) {
    scope = c.industry.name;
    candidates = await repos.reference.listSecurities({ industryId: c.industry.id });
  }
  const peers = candidates.filter((s) => s.companyId !== security.companyId && s.isPrimary);
  const { rows, provenance } = await attachMarketData(repos, peers);
  return { rows: rows.sort(byMarketCapDesc), scope, provenance };
}

export async function getCompanyOverview(repos: Repositories, header: CompanyHeaderData): Promise<CompanyOverviewData> {
  const c = header.security.classification;
  const [profile, datasets, industrySecurities, sectorSecurities, universeSecurities, peers] = await Promise.all([
    repos.reference.getCompanyProfile(header.security.companyId),
    repos.reference.listDatasets(),
    c ? repos.reference.listSecurities({ industryId: c.industry.id }) : Promise.resolve([]),
    c ? repos.reference.listSecurities({ sectorId: c.sector.id }) : Promise.resolve([]),
    repos.reference.listSecurities({ indexSlug: PRIMARY_UNIVERSE.indexSlug }),
    getCompanyPeers(repos, header.security),
  ]);
  const [industryRows, sectorRows, universeRows] = await Promise.all([
    attachMarketData(repos, industrySecurities),
    attachMarketData(repos, sectorSecurities),
    attachMarketData(repos, universeSecurities),
  ]);

  const industryPerf = groupStats(industryRows.rows, "1D").performance;
  const sectorPerf = groupStats(sectorRows.rows, "1D").performance;
  const universePerf = groupStats(universeRows.rows, "1D").performance;
  await applyGroupIndexReturns(repos, [
    ...(c
      ? [
          { kind: LEVEL_KIND.industry, key: c.industry.id, performance: industryPerf },
          { kind: LEVEL_KIND.sector, key: c.sector.id, performance: sectorPerf },
        ]
      : []),
    { kind: "index" as const, key: PRIMARY_UNIVERSE.indexSlug, performance: universePerf },
  ]);
  const aggregates: RelativePerformanceLine[] = [];
  if (c) {
    aggregates.push(syntheticLine(c.industry.name, "Industry · cap-weighted synthetic index", industryPerf));
    aggregates.push(syntheticLine(c.sector.name, "Sector · cap-weighted synthetic index", sectorPerf));
  }
  aggregates.push(syntheticLine(`${PRIMARY_UNIVERSE.label} constituents`, "Constituents · cap-weighted synthetic index (not the official index level)", universePerf));

  return {
    profile,
    company: { label: header.security.ticker, kind: "company", detail: header.security.companyName, returns: header.row.snapshot?.returns ?? {} },
    aggregates,
    aggregatesProvenance: universeRows.provenance,
    peers: peers.rows.slice(0, 8),
    peersProvenance: peers.provenance,
    datasets,
    provenance: header.provenance,
  };
}
