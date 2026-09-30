import type {
  Page,
  ReferenceRepository,
  SecurityFilter,
  SecurityPageRequest,
} from "@/data/repositories/reference-repository";
import type { IndexMembership, MarketIndex } from "@/domain/market-index";
import type {
  CompanyProfile,
  Dataset,
  Industry,
  IndustryGroup,
  Sector,
  SecuritySummary,
  SubIndustry,
  Theme,
} from "@/domain/reference";

/**
 * Implementación en memoria del repositorio de referencia. Se usa en tests de servicios y
 * reproduce la semántica de filtros/orden de la implementación Supabase.
 */
export interface MemoryReferenceData {
  indices: MarketIndex[];
  memberships: { indexId: string; securityId: string; addedOn: string | null; datasetId: string | null }[];
  sectors: Sector[];
  industryGroups: IndustryGroup[];
  industries: Industry[];
  subIndustries: SubIndustry[];
  securities: SecuritySummary[];
  profiles: CompanyProfile[];
  themes: { companyId: string; theme: Theme }[];
  datasets: Dataset[];
}

export class MemoryReferenceRepository implements ReferenceRepository {
  constructor(private readonly data: MemoryReferenceData) {}

  async listIndices() {
    return [...this.data.indices].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getIndexBySlug(slug: string) {
    return this.data.indices.find((i) => i.slug === slug) ?? null;
  }

  async countIndexConstituents() {
    const counts = new Map<string, number>();
    for (const m of this.data.memberships) counts.set(m.indexId, (counts.get(m.indexId) ?? 0) + 1);
    return counts;
  }

  async listSectors() {
    return [...this.data.sectors].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getSectorBySlug(slug: string) {
    return this.data.sectors.find((s) => s.slug === slug) ?? null;
  }

  async listIndustryGroups(sectorId?: string) {
    return this.data.industryGroups.filter((g) => !sectorId || g.sectorId === sectorId).sort((a, b) => a.code.localeCompare(b.code));
  }

  async listIndustries() {
    return [...this.data.industries].sort((a, b) => a.code.localeCompare(b.code));
  }

  async getIndustryBySlug(slug: string) {
    return this.data.industries.find((i) => i.slug === slug) ?? null;
  }

  async listSubIndustries(industryId?: string) {
    return this.data.subIndustries.filter((s) => !industryId || s.industryId === industryId).sort((a, b) => a.code.localeCompare(b.code));
  }

  private filter(filter: SecurityFilter = {}): SecuritySummary[] {
    const index = filter.indexSlug ? this.data.indices.find((i) => i.slug === filter.indexSlug) : undefined;
    if (filter.indexSlug && !index) return [];
    const members = index
      ? new Set(this.data.memberships.filter((m) => m.indexId === index.id).map((m) => m.securityId))
      : null;
    const search = filter.search?.trim().toLowerCase();
    return this.data.securities.filter(
      (s) =>
        (!members || members.has(s.securityId)) &&
        (!filter.sectorId || s.classification?.sector.id === filter.sectorId) &&
        (!filter.industryId || s.classification?.industry.id === filter.industryId) &&
        (!filter.subIndustryId || s.classification?.subIndustry.id === filter.subIndustryId) &&
        (!search || s.ticker.toLowerCase().includes(search) || s.companyName.toLowerCase().includes(search)),
    );
  }

  async listSecurities(filter?: SecurityFilter) {
    return this.filter(filter).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async pageSecurities(request: SecurityPageRequest): Promise<Page<SecuritySummary>> {
    const key = (s: SecuritySummary) =>
      request.sort.field === "ticker" ? s.ticker : request.sort.field === "company" ? s.companyName : (s.classification?.sector.name ?? "");
    const direction = request.sort.direction === "asc" ? 1 : -1;
    const all = this.filter(request.filter).sort(
      (a, b) => direction * key(a).localeCompare(key(b)) || a.ticker.localeCompare(b.ticker),
    );
    const start = (request.page - 1) * request.pageSize;
    return { items: all.slice(start, start + request.pageSize), total: all.length, page: request.page, pageSize: request.pageSize };
  }

  async getSecurityByTicker(ticker: string) {
    const matches = this.data.securities.filter((s) => s.ticker === ticker);
    return matches.find((s) => s.isPrimary) ?? matches[0] ?? null;
  }

  async listCompanySecurities(companyId: string) {
    return this.data.securities.filter((s) => s.companyId === companyId).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async getCompanyProfile(companyId: string) {
    return this.data.profiles.find((p) => p.companyId === companyId) ?? null;
  }

  async listCompanyThemes(companyId: string) {
    return this.data.themes.filter((t) => t.companyId === companyId).map((t) => t.theme);
  }

  async listIndexMemberships(securityId: string): Promise<IndexMembership[]> {
    return this.data.memberships
      .filter((m) => m.securityId === securityId)
      .flatMap((m) => {
        const index = this.data.indices.find((i) => i.id === m.indexId);
        return index
          ? [{
              indexId: index.id,
              indexCode: index.code,
              indexSlug: index.slug,
              indexName: index.name,
              indexShortName: index.shortName,
              indexKind: index.kind,
              addedOn: m.addedOn,
              datasetId: m.datasetId,
            }]
          : [];
      });
  }

  async listDatasets() {
    return this.data.datasets;
  }
}
