/**
 * Empresas relevantes para la cadena de suministro que NO están en el universo de MarketRadar
 * (S&P 500). Se pueden reconocer en noticias y aparecer en el grafo, pero no tienen fichas ni datos
 * de mercado. Lista deliberadamente corta: cada una debe tener relaciones con evidencia.
 */
export interface ExternalCompanyDef {
  code: string;
  name: string;
  country: string;
  /** Ticker principal (informativo; no hay datos de mercado). */
  listing: string | null;
  aliases: readonly string[];
  description: string;
}

export const EXTERNAL_COMPANIES: readonly ExternalCompanyDef[] = [
  { code: "tsmc", name: "Taiwan Semiconductor Manufacturing (TSMC)", country: "TW", listing: "2330.TW / TSM", aliases: ["TSMC", "Taiwan Semiconductor", "Taiwan Semiconductor Manufacturing"], description: "Largest contract chip manufacturer (foundry)." },
  { code: "asml", name: "ASML Holding", country: "NL", listing: "ASML", aliases: ["ASML"], description: "Sole supplier of EUV lithography systems." },
  { code: "samsung", name: "Samsung Electronics", country: "KR", listing: "005930.KS", aliases: ["Samsung Electronics", "Samsung"], description: "Memory chips, foundry and consumer electronics." },
  { code: "sk_hynix", name: "SK Hynix", country: "KR", listing: "000660.KS", aliases: ["SK Hynix", "SK hynix", "Hynix"], description: "Memory chips, including high-bandwidth memory (HBM)." },
  { code: "foxconn", name: "Hon Hai Precision (Foxconn)", country: "TW", listing: "2317.TW", aliases: ["Foxconn", "Hon Hai"], description: "Largest electronics contract manufacturer." },
  { code: "aramco", name: "Saudi Aramco", country: "SA", listing: "2222.SR", aliases: ["Saudi Aramco", "Aramco"], description: "State oil company of Saudi Arabia." },
];

export const EXTERNAL_BY_CODE: ReadonlyMap<string, ExternalCompanyDef> = new Map(EXTERNAL_COMPANIES.map((c) => [c.code, c]));
