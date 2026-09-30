/** Rutas canónicas de MarketRadar (CAMBIO 1). Único sitio donde se construyen URLs. */
export { companyPath } from "./ticker";

export const indexPath = (slug: string) => `/index/${slug}`;
export const sectorPath = (slug: string) => `/sector/${slug}`;
export const industryPath = (slug: string) => `/industry/${slug}`;
export const subIndustryPath = (industrySlug: string, subSlug: string) => `/industry/${industrySlug}/${subSlug}`;

export interface CompaniesQuery {
  q?: string;
  sector?: string;
  index?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
}

export function companiesPath(query: CompaniesQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/companies?${qs}` : "/companies";
}

/** Añade/actualiza el parámetro `range` conservando la ruta. */
export function withRange(path: string, range: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("range", range);
  return `${base}?${params.toString()}`;
}
