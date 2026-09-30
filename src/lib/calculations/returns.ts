import type { LinePoint } from "@/domain/chart";

/** Rendimiento simple entre dos valores (fracción). null si no es calculable. */
export function simpleReturn(start: number | null, end: number | null): number | null {
  if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return null;
  return end / start - 1;
}

/**
 * Rebasa una serie para que su primer punto valga `base` (comparaciones base 100).
 * Devuelve [] si el primer valor no es positivo.
 */
export function rebaseSeries(points: readonly LinePoint[], base = 100): LinePoint[] {
  const first = points[0];
  if (!first || !(first.value > 0)) return [];
  return points.map((p) => ({ time: p.time, value: (p.value / first.value) * base }));
}

/** Alinea varias series al primer instante común para compararlas rebasadas. */
export function alignToCommonStart(series: readonly (readonly LinePoint[])[]): LinePoint[][] {
  const starts = series.map((s) => s[0]?.time).filter((t): t is string => t !== undefined);
  if (starts.length !== series.length) return series.map(() => []);
  const commonStart = starts.reduce((latest, t) => (t > latest ? t : latest));
  return series.map((s) => s.filter((p) => p.time >= commonStart));
}
