/**
 * Fase 2B.1 — piloto EOD. Solo estos valores se sincronizan con datos reales; el resto del
 * universo sigue en DEMO (Fase 1) hasta 2B.2.
 *
 * Cubren: gran capitalización, NASDAQ y NYSE, ticker con clase (BRK.B), históricos largos y
 * cortos (PLTR cotiza desde 2020), splits recientes (NVDA, AAPL), dividendos y ausencia de
 * dividendos (BRK.B, PLTR, ORLY).
 */
export const PILOT_TICKERS = ["AAPL", "NVDA", "PLTR", "BRK.B", "ORLY"] as const;

/**
 * Inicio del histórico diario: 1 de enero de (año actual − 7).
 * Cubre 5Y + calentamiento de EMA/SMA 200 (≈ 10 meses) con margen.
 */
export const PRICE_HISTORY_YEARS = 7;

export function priceHistoryStart(today: Date): string {
  return `${today.getUTCFullYear() - PRICE_HISTORY_YEARS}-01-01`;
}

/** Solape al sincronizar de forma incremental: re-descarga los últimos días para recoger correcciones. */
export const INCREMENTAL_OVERLAP_DAYS = 10;
