/**
 * Procedencia de datos: principio de arquitectura desde Fase 1.
 *
 * Todo dataset que llega a la interfaz viaja con su procedencia. Los componentes solo la
 * muestran; nunca la deducen ni la inventan.
 */
export interface Provenance {
  /** Identificador técnico de la fuente: "mock", "wikipedia", "fmp", "sec", "fred"… */
  source: string;
  /** Etiqueta legible de la fuente. */
  sourceLabel: string;
  /** Momento al que corresponden los datos (ISO 8601). */
  asOf: string;
  /** Datos con retraso respecto al mercado (p. ej. 15 min o fin de día). */
  isDelayed: boolean;
  /** Datos simulados: nunca deben interpretarse como reales. */
  isDemo: boolean;
  /** Frecuencia de los datos de mercado (Fase 2B: solo "eod"). */
  frequency?: DataFrequency;
  /** Clave del dataset de procedencia (`datasets.key`). */
  dataset?: string;
  /** Momento en que MarketRadar descargó los datos (ISO 8601). */
  ingestedAt?: string;
  /**
   * Cobertura de un conjunto (listas, heatmaps, agregados): cuántos miembros tienen dato real.
   * covered < total ⇒ PARTIAL (los que faltan se muestran como sin dato, nunca con valores simulados).
   */
  coverage?: { covered: number; total: number };
}

/** Estado de un panel: datos reales completos, parciales o simulados. */
export type DataStatus = "REAL" | "PARTIAL" | "DEMO";

export function dataStatus(provenance: Provenance): DataStatus {
  if (provenance.isDemo) return "DEMO";
  if (provenance.coverage && provenance.coverage.covered < provenance.coverage.total) return "PARTIAL";
  return "REAL";
}

export type DataFrequency = "eod" | "delayed" | "realtime";

/** Datos de fin de día: fin de semana + festivo sin marcarlos como desactualizados. */
export const EOD_STALE_AFTER_MS = 4 * 24 * 60 * 60 * 1000;

export interface WithProvenance<T> {
  data: T;
  provenance: Provenance;
}

/** Edad máxima por defecto antes de marcar datos como desactualizados (se afinará en Fase 2). */
export const DEFAULT_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function isStale(
  provenance: Provenance,
  now: Date,
  maxAgeMs = provenance.frequency === "eod" ? EOD_STALE_AFTER_MS : DEFAULT_STALE_AFTER_MS,
): boolean {
  if (provenance.isDemo) return false;
  const asOf = Date.parse(provenance.asOf);
  if (Number.isNaN(asOf)) return true;
  return now.getTime() - asOf > maxAgeMs;
}
