import type { TimeRange } from "@/domain/time-range";
import { simpleReturn } from "./returns";

/**
 * Rendimientos por periodo a partir de una serie diaria de cierres (ya ajustada).
 *
 *   * 1D: sesión anterior. 1W: 5 sesiones (D13).
 *   * 1M…5Y: último cierre en o antes de (fecha final − periodo calendario).
 *   * YTD: último cierre del año natural anterior.
 * Si el histórico no llega a la fecha base, el rendimiento es null (nunca se extrapola).
 */
export interface ClosePoint {
  date: string;
  close: number;
}

const CALENDAR_OFFSETS: Partial<Record<TimeRange, { months?: number; years?: number }>> = {
  "1M": { months: 1 },
  "3M": { months: 3 },
  "6M": { months: 6 },
  "1Y": { years: 1 },
  "3Y": { years: 3 },
  "5Y": { years: 5 },
};

/** Resta meses/años a una fecha ISO, ajustando al último día del mes si hace falta (31-mar − 1M = 28/29-feb). */
export function subtractCalendar(isoDate: string, offset: { months?: number; years?: number }): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const totalMonths = y * 12 + (m - 1) - (offset.months ?? 0) - (offset.years ?? 0) * 12;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Índice del último punto con fecha <= `date` (serie ordenada) o -1. */
export function lastIndexOnOrBefore(points: readonly ClosePoint[], date: string): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((points[mid] as ClosePoint).date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function baseIndexFor(points: readonly ClosePoint[], range: TimeRange): number {
  const lastIndex = points.length - 1;
  const last = points[lastIndex];
  if (!last) return -1;
  if (range === "1D") return lastIndex - 1;
  if (range === "1W") return lastIndex - 5;
  if (range === "YTD") return lastIndexOnOrBefore(points, `${Number(last.date.slice(0, 4)) - 1}-12-31`);
  const offset = CALENDAR_OFFSETS[range];
  if (!offset) return -1;
  const target = subtractCalendar(last.date, offset);
  // Sin histórico que cubra la fecha objetivo → null (p. ej. una salida a bolsa reciente).
  if ((points[0] as ClosePoint).date > target) return -1;
  return lastIndexOnOrBefore(points, target);
}

export function periodReturns(points: readonly ClosePoint[], ranges: readonly TimeRange[]): Partial<Record<TimeRange, number | null>> {
  const out: Partial<Record<TimeRange, number | null>> = {};
  const last = points.at(-1);
  for (const range of ranges) {
    const index = baseIndexFor(points, range);
    const base = index >= 0 ? points[index] : undefined;
    out[range] = base && last ? simpleReturn(base.close, last.close) : null;
  }
  return out;
}
