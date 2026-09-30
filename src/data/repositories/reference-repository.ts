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
 * Lectura de datos de referencia (identidad, clasificación, índices) desde NUESTRA base de
 * datos. La UI y los servicios solo conocen esta interfaz; nunca hablan con proveedores.
 */
export interface SecurityFilter {
  /** Solo componentes actuales de este índice. */
  indexSlug?: string;
  sectorId?: string;
  industryId?: string;
  subIndustryId?: string;
  /** Búsqueda por ticker o nombre de empresa. */
  search?: string;
}

export type SecuritySortField = "ticker" | "company" | "sector";

export interface SecurityPageRequest {
  filter: SecurityFilter;
  sort: { field: SecuritySortField; direction: "asc" | "desc" };
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReferenceRepository {
  listIndices(): Promise<MarketIndex[]>;
  getIndexBySlug(slug: string): Promise<MarketIndex | null>;
  /** Nº de componentes actuales por id de índice. */
  countIndexConstituents(): Promise<Map<string, number>>;

  listSectors(): Promise<Sector[]>;
  getSectorBySlug(slug: string): Promise<Sector | null>;
  listIndustryGroups(sectorId?: string): Promise<IndustryGroup[]>;
  listIndustries(): Promise<Industry[]>;
  getIndustryBySlug(slug: string): Promise<Industry | null>;
  listSubIndustries(industryId?: string): Promise<SubIndustry[]>;

  /** Todos los valores que cumplen el filtro (el universo de Fase 1 es pequeño). */
  listSecurities(filter?: SecurityFilter): Promise<SecuritySummary[]>;
  pageSecurities(request: SecurityPageRequest): Promise<Page<SecuritySummary>>;
  /** Valor por ticker canónico; si cotiza en varias bolsas, el principal. */
  getSecurityByTicker(ticker: string): Promise<SecuritySummary | null>;
  listCompanySecurities(companyId: string): Promise<SecuritySummary[]>;
  getCompanyProfile(companyId: string): Promise<CompanyProfile | null>;
  listCompanyThemes(companyId: string): Promise<Theme[]>;
  listIndexMemberships(securityId: string): Promise<IndexMembership[]>;

  listDatasets(): Promise<Dataset[]>;
}
