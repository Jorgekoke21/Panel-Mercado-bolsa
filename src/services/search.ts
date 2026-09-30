import type { Repositories } from "./market-rows";

/** Índice compacto para el buscador del cliente (~500 filas, sin datos de mercado). */
export interface SearchEntry {
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string;
}

export async function getSearchIndex(repos: Repositories): Promise<SearchEntry[]> {
  const securities = await repos.reference.listSecurities();
  return securities.map((s) => ({
    ticker: s.ticker,
    name: s.companyName,
    sector: s.classification?.sector.name ?? null,
    exchange: s.exchange.acronym ?? s.exchange.mic,
  }));
}
