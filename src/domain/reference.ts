/**
 * Modelo de referencia: geografía, bolsas, clasificación, empresas y valores.
 * Nada aquí asume un país, una divisa, una bolsa, un índice o una taxonomía concretos.
 */

export interface Country {
  code: string;
  iso3: string;
  name: string;
  region: string | null;
}

export interface Exchange {
  id: string;
  mic: string;
  name: string;
  acronym: string | null;
  countryCode: string;
  timezone: string;
  currency: string;
}

export type ClassificationLevel = "sector" | "industryGroup" | "industry" | "subIndustry";

export interface ClassificationNode {
  id: string;
  taxonomyCode: string;
  code: string;
  name: string;
  slug: string;
}

export interface Sector extends ClassificationNode {
  sortOrder: number;
}
export interface IndustryGroup extends ClassificationNode {
  sectorId: string;
}
export interface Industry extends ClassificationNode {
  industryGroupId: string;
}
export interface SubIndustry extends ClassificationNode {
  industryId: string;
}

/** Ruta completa de clasificación de una empresa (null si aún no está clasificada). */
export interface ClassificationPath {
  taxonomyCode: string;
  sector: ClassificationNode;
  industryGroup: ClassificationNode;
  industry: ClassificationNode;
  subIndustry: ClassificationNode;
}

export interface Headquarters {
  city: string | null;
  region: string | null;
  countryCode: string | null;
  countryName: string | null;
}

/**
 * Valor cotizado + emisor + bolsa + clasificación. Es el "read model" principal de listados,
 * rankings y heatmaps.
 */
export interface SecuritySummary {
  securityId: string;
  ticker: string;
  securityName: string;
  currency: string;
  shareClass: string | null;
  isPrimary: boolean;
  companyId: string;
  companyName: string;
  companySlug: string;
  exchange: { id: string; mic: string; name: string; acronym: string | null; countryCode: string };
  headquarters: Headquarters;
  classification: ClassificationPath | null;
}

/** Datos de ficha de empresa (identidad). Campos de Fase 2 pueden ser null. */
export interface CompanyProfile {
  companyId: string;
  name: string;
  legalName: string | null;
  cik: string | null;
  website: string | null;
  description: string | null;
  logoUrl: string | null;
  employees: number | null;
  foundedYear: number | null;
  domicileCountryCode: string | null;
}

export interface Theme {
  id: string;
  slug: string;
  name: string;
  source: "manual" | "provider" | "ai";
  confidence: number | null;
}

export interface Dataset {
  id: string;
  key: string;
  name: string;
  source: string;
  sourceUrl: string | null;
  isSecondarySource: boolean;
  sourceRevision: string | null;
  sourceRevisionAt: string | null;
  retrievedAt: string | null;
  effectiveDate: string | null;
  notes: string | null;
}
