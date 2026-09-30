import type { SecuritySummary } from "@/domain/reference";
import type { NodeKey } from "./types";

/**
 * Vista compacta del universo de MarketRadar para el motor de noticias y el grafo: emisores con sus
 * valores, clasificación GICS y CIK. Se construye desde NUESTRA base de datos (ReferenceRepository o
 * el store de sync), nunca desde proveedores.
 */
export interface UniverseCompany {
  companyId: string;
  name: string;
  /** Tickers de todas sus clases (GOOGL, GOOG). */
  tickers: string[];
  primaryTicker: string;
  securityIds: Record<string, string>;
  cik: string | null;
  hqCountry: string | null;
  sectorCode: string | null;
  industryCode: string | null;
  subIndustryCode: string | null;
}

export interface ClassificationLabel {
  code: string;
  name: string;
  slug: string;
  /** uuid de la fila (para enlazar con repositorios que trabajan por id). */
  id: string;
}

export interface Universe {
  companies: UniverseCompany[];
  byCompanyId: Map<string, UniverseCompany>;
  byTicker: Map<string, UniverseCompany>;
  byCik: Map<string, UniverseCompany>;
  /** securityId ⇒ { ticker, emisor }. */
  bySecurityId: Map<string, { ticker: string; company: UniverseCompany }>;
  sectors: Map<string, ClassificationLabel>;
  industries: Map<string, ClassificationLabel>;
  subIndustries: Map<string, ClassificationLabel>;
}

const normalizeCik = (cik: string) => cik.replace(/^0+/, "");

export function buildUniverse(securities: readonly SecuritySummary[], ciks: ReadonlyMap<string, string> = new Map()): Universe {
  const byCompanyId = new Map<string, UniverseCompany>();
  const sectors = new Map<string, ClassificationLabel>();
  const industries = new Map<string, ClassificationLabel>();
  const subIndustries = new Map<string, ClassificationLabel>();
  for (const s of securities) {
    const c = s.classification;
    if (c) {
      sectors.set(c.sector.code, { code: c.sector.code, name: c.sector.name, slug: c.sector.slug, id: c.sector.id });
      industries.set(c.industry.code, { code: c.industry.code, name: c.industry.name, slug: c.industry.slug, id: c.industry.id });
      subIndustries.set(c.subIndustry.code, { code: c.subIndustry.code, name: c.subIndustry.name, slug: c.subIndustry.slug, id: c.subIndustry.id });
    }
    let company = byCompanyId.get(s.companyId);
    if (!company) {
      const cik = ciks.get(s.companyId);
      company = {
        companyId: s.companyId,
        name: s.companyName,
        tickers: [],
        primaryTicker: s.ticker,
        securityIds: {},
        cik: cik ? normalizeCik(cik) : null,
        hqCountry: s.headquarters.countryCode,
        sectorCode: c?.sector.code ?? null,
        industryCode: c?.industry.code ?? null,
        subIndustryCode: c?.subIndustry.code ?? null,
      };
      byCompanyId.set(s.companyId, company);
    }
    company.tickers.push(s.ticker);
    company.securityIds[s.ticker] = s.securityId;
    if (s.isPrimary) company.primaryTicker = s.ticker;
  }
  const companies = [...byCompanyId.values()];
  const byTicker = new Map<string, UniverseCompany>();
  const byCik = new Map<string, UniverseCompany>();
  const bySecurityId = new Map<string, { ticker: string; company: UniverseCompany }>();
  for (const c of companies) {
    for (const [t, id] of Object.entries(c.securityIds)) bySecurityId.set(id, { ticker: t, company: c });
    for (const t of c.tickers) byTicker.set(t, c);
    if (c.cik) byCik.set(c.cik, c);
  }
  return { companies, byCompanyId, byTicker, byCik, bySecurityId, sectors, industries, subIndustries };
}

export function cikKey(cik: string): string {
  return normalizeCik(cik);
}

/** Nodos de clasificación (sub-industria → industria → sector) de un emisor. */
export function classificationNodes(company: UniverseCompany): NodeKey[] {
  const out: NodeKey[] = [];
  if (company.subIndustryCode) out.push(`subIndustry:${company.subIndustryCode}`);
  if (company.industryCode) out.push(`industry:${company.industryCode}`);
  if (company.sectorCode) out.push(`sector:${company.sectorCode}`);
  return out;
}
