/**
 * Calendario de sesiones regulares de una bolsa (festivos excluidos, medias sesiones incluidas).
 * Las horas se guardan en UTC (ISO 8601); la fecha de sesión es la fecha local de la bolsa.
 */
export interface MarketSession {
  date: string;
  opensAt: string;
  closesAt: string;
}

/**
 * Una barra diaria de EE. UU. es DEFINITIVA cuando termina la sesión extendida (4 h después del
 * cierre regular: 20:00 ET, o 17:00 ET en medias sesiones) más el retraso del feed. Antes, la barra
 * del día está incompleta (el volumen diario de Alpaca incluye la negociación fuera de horario).
 */
export const BAR_FINAL_AFTER_CLOSE_MS = (4 * 60 + 20) * 60 * 1000;

/** Última sesión cuya barra diaria ya es definitiva en `now` (null si no hay ninguna). */
export function lastFinalSession(sessions: readonly MarketSession[], now: Date): MarketSession | null {
  let found: MarketSession | null = null;
  for (const s of sessions) {
    if (Date.parse(s.closesAt) + BAR_FINAL_AFTER_CLOSE_MS <= now.getTime()) {
      if (!found || s.date > found.date) found = s;
    }
  }
  return found;
}

/** Sesiones del calendario en [from, to] que no tienen barra (huecos de datos). */
export function missingSessions(sessions: readonly MarketSession[], barDates: ReadonlySet<string>, from: string, to: string): string[] {
  return sessions.filter((s) => s.date >= from && s.date <= to && !barDates.has(s.date)).map((s) => s.date);
}

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Convierte una hora local de Nueva York (fecha + "HH:MM") a ISO UTC, con horario de verano. */
export function newYorkTimeToUtc(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Desfase de Nueva York en ese instante (−4 h en verano, −5 h en invierno).
  const parts = Object.fromEntries(NY_PARTS.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asNy = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess + (guess - asNy)).toISOString();
}
