/** Filas del seed con los mismos nombres de columna que las tablas SQL. */

export interface DatasetRow {
  id: string;
  key: string;
  name: string;
  source: string;
  source_url: string | null;
  license: string | null;
  is_secondary_source: boolean;
  source_revision: string | null;
  source_revision_at: string | null;
  sha256: string | null;
  retrieved_at: string | null;
  effective_date: string | null;
  notes: string | null;
}

export interface CountryRow {
  code: string;
  iso3: string;
  iso_numeric: string;
  name: string;
  region: string | null;
}

export interface ExchangeRow {
  id: string;
  mic: string;
  name: string;
  acronym: string | null;
  country_code: string;
  timezone: string;
  currency: string;
  dataset_id: string;
}

export interface TaxonomyRow {
  code: string;
  name: string;
  publisher: string | null;
  dataset_id: string;
}

interface ClassificationBase {
  id: string;
  taxonomy_code: string;
  code: string;
  name: string;
  slug: string;
}
export interface SectorRow extends ClassificationBase {
  sort_order: number;
}
export interface IndustryGroupRow extends ClassificationBase {
  sector_id: string;
}
export interface IndustryRow extends ClassificationBase {
  industry_group_id: string;
}
export interface SubIndustryRow extends ClassificationBase {
  industry_id: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  cik: string | null;
  sub_industry_id: string | null;
  hq_city: string | null;
  hq_region: string | null;
  hq_country_code: string | null;
  founded_year: number | null;
  dataset_id: string;
}

export interface SecurityRow {
  id: string;
  company_id: string;
  exchange_id: string;
  ticker: string;
  name: string;
  currency: string;
  share_class: string | null;
  security_type: string;
  is_primary: boolean;
  dataset_id: string;
}

export interface IndexRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  short_name: string | null;
  kind: "official" | "synthetic";
  methodology: "provider" | "equal_weight" | "cap_weight";
  provider: string;
  country_code: string | null;
  currency: string | null;
  constituents_tracked: boolean;
  dataset_id: string;
}

export interface IndexConstituentRow {
  id: string;
  index_id: string;
  security_id: string;
  added_on: string | null;
  dataset_id: string;
}

export interface ThemeRow {
  id: string;
  slug: string;
  name: string;
}

export interface CompanyThemeRow {
  company_id: string;
  theme_id: string;
  source: "manual" | "provider" | "ai";
  confidence: number | null;
  note: string | null;
  dataset_id: string;
}

export interface SeedTables {
  datasets: DatasetRow[];
  countries: CountryRow[];
  exchanges: ExchangeRow[];
  taxonomies: TaxonomyRow[];
  sectors: SectorRow[];
  industry_groups: IndustryGroupRow[];
  industries: IndustryRow[];
  sub_industries: SubIndustryRow[];
  companies: CompanyRow[];
  securities: SecurityRow[];
  indices: IndexRow[];
  index_constituents: IndexConstituentRow[];
  themes: ThemeRow[];
  company_themes: CompanyThemeRow[];
}

/** Orden de inserción respetando las claves foráneas. */
export const TABLE_ORDER: (keyof SeedTables)[] = [
  "datasets",
  "countries",
  "exchanges",
  "taxonomies",
  "sectors",
  "industry_groups",
  "industries",
  "sub_industries",
  "companies",
  "securities",
  "indices",
  "index_constituents",
  "themes",
  "company_themes",
];
