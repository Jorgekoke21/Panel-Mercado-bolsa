/**
 * Market breadth: qué ocurre DENTRO de un grupo (índice, sector, industria).
 *
 * Solo métricas objetivas (D14): no se usa "bullish" como sinónimo de "en positivo".
 * Los porcentajes se calculan sobre los miembros con dato disponible; `*Coverage` indica
 * cuántos miembros tenían ese dato.
 */
export interface BreadthStats {
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  /** Miembros con rendimiento disponible para el periodo. */
  returnCoverage: number;
  /** Fracción (0–1) de miembros con rendimiento > 0. */
  pctPositive: number | null;
  pctAboveEma20: number | null;
  pctAboveEma50: number | null;
  pctAboveEma200: number | null;
  emaCoverage: { ema20: number; ema50: number; ema200: number };
  averageRsi14: number | null;
  medianRsi14: number | null;
  rsiCoverage: number;
  new52wHighs: number;
  new52wLows: number;
}
