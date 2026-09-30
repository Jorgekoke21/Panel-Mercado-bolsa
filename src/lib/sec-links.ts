/** Enlaces públicos a EDGAR (trazabilidad en la UI). Funciones puras, sin llamadas a la SEC. */

/** Índice de un filing concreto. */
export function filingIndexUrl(cik: string, accessionNumber: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNumber.replaceAll("-", "")}/${accessionNumber}-index.htm`;
}

/** Lista de filings de un emisor en EDGAR. */
export function companyFilingsUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`;
}
