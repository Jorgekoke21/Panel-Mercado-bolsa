import type { IndexKind, IndexMembership, IndexMethodology, IndexScope, MarketIndex } from "@/domain/market-index";
import type { ClassificationPath, CompanyProfile, Dataset, SecuritySummary } from "@/domain/reference";
import type { Database } from "./database.types";

/** Conversión filas SQL (snake_case, columnas de vista nullable) → dominio. Funciones puras. */

type Views = Database["public"]["Views"];
type Tables = Database["public"]["Tables"];
export type SecurityViewRow = Views["v_securities"]["Row"];
export type MembershipViewRow = Views["v_index_memberships"]["Row"];
export type IndexRow = Tables["indices"]["Row"];
export type DatasetRow = Tables["datasets"]["Row"];

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) throw new Error(`Unexpected null in required column "${field}"`);
  return value;
}

function classificationOf(row: SecurityViewRow): ClassificationPath | null {
  if (!row.sub_industry_id || !row.industry_id || !row.industry_group_id || !row.sector_id || !row.taxonomy_code) return null;
  const node = (id: string, code: string | null, name: string | null, slug: string | null) => ({
    id,
    taxonomyCode: row.taxonomy_code ?? "",
    code: code ?? "",
    name: name ?? "",
    slug: slug ?? "",
  });
  return {
    taxonomyCode: row.taxonomy_code,
    sector: node(row.sector_id, row.sector_code, row.sector_name, row.sector_slug),
    industryGroup: node(row.industry_group_id, row.industry_group_code, row.industry_group_name, row.industry_group_slug),
    industry: node(row.industry_id, row.industry_code, row.industry_name, row.industry_slug),
    subIndustry: node(row.sub_industry_id, row.sub_industry_code, row.sub_industry_name, row.sub_industry_slug),
  };
}

export function toSecuritySummary(row: SecurityViewRow): SecuritySummary {
  return {
    securityId: required(row.security_id, "security_id"),
    ticker: required(row.ticker, "ticker"),
    securityName: required(row.security_name, "security_name"),
    currency: required(row.currency, "currency"),
    shareClass: row.share_class,
    isPrimary: row.is_primary ?? false,
    companyId: required(row.company_id, "company_id"),
    companyName: required(row.company_name, "company_name"),
    companySlug: required(row.company_slug, "company_slug"),
    exchange: {
      id: required(row.exchange_id, "exchange_id"),
      mic: required(row.exchange_mic, "exchange_mic"),
      name: required(row.exchange_name, "exchange_name"),
      acronym: row.exchange_acronym,
      countryCode: required(row.exchange_country_code, "exchange_country_code"),
    },
    headquarters: {
      city: row.hq_city,
      region: row.hq_region,
      countryCode: row.hq_country_code,
      countryName: row.hq_country_name,
    },
    classification: classificationOf(row),
  };
}

export function toCompanyProfile(row: SecurityViewRow): CompanyProfile {
  return {
    companyId: required(row.company_id, "company_id"),
    name: required(row.company_name, "company_name"),
    legalName: row.legal_name,
    cik: row.cik,
    website: row.website,
    description: row.description,
    logoUrl: row.logo_url,
    employees: row.employees,
    foundedYear: row.founded_year,
    domicileCountryCode: row.domicile_country_code,
  };
}

function scopeOf(row: IndexRow): IndexScope | null {
  if (row.scope_sector_id) return { level: "sector", id: row.scope_sector_id };
  if (row.scope_industry_group_id) return { level: "industryGroup", id: row.scope_industry_group_id };
  if (row.scope_industry_id) return { level: "industry", id: row.scope_industry_id };
  if (row.scope_sub_industry_id) return { level: "subIndustry", id: row.scope_sub_industry_id };
  return null;
}

export function toMarketIndex(row: IndexRow): MarketIndex {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    kind: row.kind as IndexKind,
    methodology: row.methodology as IndexMethodology,
    provider: row.provider,
    countryCode: row.country_code,
    currency: row.currency,
    description: row.description,
    scope: scopeOf(row),
    constituentsTracked: row.constituents_tracked,
  };
}

export function toIndexMembership(row: MembershipViewRow): IndexMembership {
  return {
    indexId: required(row.index_id, "index_id"),
    indexCode: required(row.index_code, "index_code"),
    indexSlug: required(row.index_slug, "index_slug"),
    indexName: required(row.index_name, "index_name"),
    indexShortName: row.index_short_name,
    indexKind: required(row.index_kind, "index_kind") as IndexKind,
    addedOn: row.added_on,
    datasetId: row.dataset_id,
  };
}

export function toDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    source: row.source,
    sourceUrl: row.source_url,
    isSecondarySource: row.is_secondary_source,
    sourceRevision: row.source_revision,
    sourceRevisionAt: row.source_revision_at,
    retrievedAt: row.retrieved_at,
    effectiveDate: row.effective_date,
    notes: row.notes,
  };
}

/** Limpia la búsqueda del usuario para el filtro `or=(…ilike…)` de PostgREST. */
export function sanitizeSearch(input: string): string {
  return input.replace(/[^\p{L}\p{N} .&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}
