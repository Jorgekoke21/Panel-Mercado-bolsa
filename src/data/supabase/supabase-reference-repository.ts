import "server-only";
import { DataAccessError } from "@/data/errors";
import type {
  Page,
  ReferenceRepository,
  SecurityFilter,
  SecurityPageRequest,
} from "@/data/repositories/reference-repository";
import type { Industry, IndustryGroup, Sector, SecuritySummary, SubIndustry, Theme } from "@/domain/reference";
import {
  sanitizeSearch,
  type SecurityViewRow,
  toCompanyProfile,
  toDataset,
  toIndexMembership,
  toMarketIndex,
  toSecuritySummary,
} from "./mappers";
import type { MarketRadarSupabase } from "./server-client";

const PAGE = 1000; // igual a `max_rows` de PostgREST (supabase/config.toml)

const SORT_COLUMNS = { ticker: "ticker", company: "company_name", sector: "sector_name" } as const;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

function unwrap<T>(operation: string, result: QueryResult<T>): T {
  if (result.error) throw new DataAccessError(`Database query failed (${operation})`, operation, { cause: result.error });
  if (result.data === null) throw new DataAccessError(`Database returned no data (${operation})`, operation);
  return result.data;
}

/**
 * Repositorio de referencia sobre Supabase/PostgREST. Una instancia por petición
 * (ver `data/registry.ts`): memoiza lecturas repetidas dentro de la misma petición.
 */
export class SupabaseReferenceRepository implements ReferenceRepository {
  private readonly memo = new Map<string, Promise<unknown>>();

  constructor(private readonly db: MarketRadarSupabase) {}

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.memo.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      this.memo.set(key, pending);
      pending.catch(() => this.memo.delete(key));
    }
    return pending;
  }

  listIndices() {
    return this.once("indices", async () => {
      const rows = unwrap("listIndices", await this.db.from("indices").select("*").eq("is_active", true).order("name"));
      return rows.map(toMarketIndex);
    });
  }

  async getIndexBySlug(slug: string) {
    return (await this.listIndices()).find((i) => i.slug === slug) ?? null;
  }

  countIndexConstituents() {
    return this.once("constituentCounts", async () => {
      const counts = new Map<string, number>();
      for (let from = 0; ; from += PAGE) {
        const rows = unwrap(
          "countIndexConstituents",
          await this.db.from("v_index_memberships").select("index_id").order("index_id").order("security_id").range(from, from + PAGE - 1),
        );
        for (const r of rows) if (r.index_id) counts.set(r.index_id, (counts.get(r.index_id) ?? 0) + 1);
        if (rows.length < PAGE) break;
      }
      return counts;
    });
  }

  listSectors(): Promise<Sector[]> {
    return this.once("sectors", async () => {
      const rows = unwrap("listSectors", await this.db.from("sectors").select("*").order("sort_order"));
      return rows.map((r) => ({ id: r.id, taxonomyCode: r.taxonomy_code, code: r.code, name: r.name, slug: r.slug, sortOrder: r.sort_order }));
    });
  }

  async getSectorBySlug(slug: string) {
    return (await this.listSectors()).find((s) => s.slug === slug) ?? null;
  }

  private allIndustryGroups(): Promise<IndustryGroup[]> {
    return this.once("industryGroups", async () => {
      const rows = unwrap("listIndustryGroups", await this.db.from("industry_groups").select("*").order("code"));
      return rows.map((r) => ({ id: r.id, taxonomyCode: r.taxonomy_code, code: r.code, name: r.name, slug: r.slug, sectorId: r.sector_id }));
    });
  }

  async listIndustryGroups(sectorId?: string) {
    const groups = await this.allIndustryGroups();
    return sectorId ? groups.filter((g) => g.sectorId === sectorId) : groups;
  }

  listIndustries(): Promise<Industry[]> {
    return this.once("industries", async () => {
      const rows = unwrap("listIndustries", await this.db.from("industries").select("*").order("code"));
      return rows.map((r) => ({
        id: r.id, taxonomyCode: r.taxonomy_code, code: r.code, name: r.name, slug: r.slug, industryGroupId: r.industry_group_id,
      }));
    });
  }

  async getIndustryBySlug(slug: string) {
    return (await this.listIndustries()).find((i) => i.slug === slug) ?? null;
  }

  private allSubIndustries(): Promise<SubIndustry[]> {
    return this.once("subIndustries", async () => {
      const rows = unwrap("listSubIndustries", await this.db.from("sub_industries").select("*").order("code"));
      return rows.map((r) => ({ id: r.id, taxonomyCode: r.taxonomy_code, code: r.code, name: r.name, slug: r.slug, industryId: r.industry_id }));
    });
  }

  async listSubIndustries(industryId?: string) {
    const subs = await this.allSubIndustries();
    return industryId ? subs.filter((s) => s.industryId === industryId) : subs;
  }

  /** Construye la consulta base sobre la vista adecuada aplicando los filtros. */
  private securitiesQuery(filter: SecurityFilter, withCount = false) {
    const options = withCount ? { count: "exact" as const } : undefined;
    const plain = () => this.db.from("v_securities").select("*", options);
    type SecuritiesQuery = ReturnType<typeof plain>;
    // v_index_constituent_securities = v_securities + (index_id, index_slug, added_on): sus filas
    // son un superconjunto de las de v_securities, así que se tipa como tal tras filtrar por índice.
    let query: SecuritiesQuery = filter.indexSlug
      ? (this.db
          .from("v_index_constituent_securities")
          .select("*", options)
          .eq("index_slug", filter.indexSlug) as unknown as SecuritiesQuery)
      : plain();
    query = query.eq("is_active", true);
    if (filter.sectorId) query = query.eq("sector_id", filter.sectorId);
    if (filter.industryId) query = query.eq("industry_id", filter.industryId);
    if (filter.subIndustryId) query = query.eq("sub_industry_id", filter.subIndustryId);
    const search = filter.search ? sanitizeSearch(filter.search) : "";
    if (search) query = query.or(`ticker.ilike.%${search}%,company_name.ilike.%${search}%`);
    return query;
  }

  listSecurities(filter: SecurityFilter = {}): Promise<SecuritySummary[]> {
    return this.once(`securities:${JSON.stringify(filter)}`, async () => {
      const all: SecurityViewRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const rows = unwrap(
          "listSecurities",
          await this.securitiesQuery(filter).order("ticker").order("security_id").range(from, from + PAGE - 1),
        ) as SecurityViewRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return all.map(toSecuritySummary);
    });
  }

  async pageSecurities(request: SecurityPageRequest): Promise<Page<SecuritySummary>> {
    const from = (request.page - 1) * request.pageSize;
    const result = await this.securitiesQuery(request.filter, true)
      .order(SORT_COLUMNS[request.sort.field], { ascending: request.sort.direction === "asc" })
      .order("ticker")
      .range(from, from + request.pageSize - 1);
    // Una página fuera de rango devuelve error 416 en PostgREST: se trata como página vacía.
    if (result.error && result.status === 416) {
      return { items: [], total: result.count ?? 0, page: request.page, pageSize: request.pageSize };
    }
    const rows = unwrap("pageSecurities", result) as SecurityViewRow[];
    return { items: rows.map(toSecuritySummary), total: result.count ?? rows.length, page: request.page, pageSize: request.pageSize };
  }

  async getSecurityByTicker(ticker: string) {
    const rows = unwrap(
      "getSecurityByTicker",
      await this.db.from("v_securities").select("*").eq("ticker", ticker).order("is_primary", { ascending: false }).limit(1),
    );
    const row = rows[0];
    return row ? toSecuritySummary(row) : null;
  }

  async listCompanySecurities(companyId: string) {
    const rows = unwrap(
      "listCompanySecurities",
      await this.db.from("v_securities").select("*").eq("company_id", companyId).order("ticker"),
    );
    return rows.map(toSecuritySummary);
  }

  async getCompanyProfile(companyId: string) {
    const rows = unwrap(
      "getCompanyProfile",
      await this.db.from("v_securities").select("*").eq("company_id", companyId).order("is_primary", { ascending: false }).limit(1),
    );
    const row = rows[0];
    return row ? toCompanyProfile(row) : null;
  }

  async listCompanyThemes(companyId: string): Promise<Theme[]> {
    const rows = unwrap(
      "listCompanyThemes",
      await this.db.from("company_themes").select("source, confidence, themes(id, slug, name)").eq("company_id", companyId),
    );
    return rows
      .flatMap((r) =>
        r.themes
          ? [{ id: r.themes.id, slug: r.themes.slug, name: r.themes.name, source: r.source as Theme["source"], confidence: r.confidence }]
          : [],
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listIndexMemberships(securityId: string) {
    const rows = unwrap(
      "listIndexMemberships",
      await this.db.from("v_index_memberships").select("*").eq("security_id", securityId).order("index_name"),
    );
    return rows.map(toIndexMembership);
  }

  listDatasets() {
    return this.once("datasets", async () => {
      const rows = unwrap("listDatasets", await this.db.from("datasets").select("*").order("key"));
      return rows.map(toDataset);
    });
  }
}
