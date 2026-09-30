import { BAR_FINAL_AFTER_CLOSE_MS, lastFinalSession, type MarketSession } from "@/domain/market-calendar";

/**
 * Planificador del sync automático (función pura). No usa una hora fija: decide a partir del
 * calendario oficial de sesiones y del estado de los datos.
 *
 *   * Precios: si hay una sesión DEFINITIVA (cierre + 4 h 20 min, medias sesiones incluidas) posterior
 *     a la última sesión materializada, o si los índices sintéticos van por detrás.
 *   * SEC (acciones y fundamentales): si el último sync correcto tiene más de `secMaxAgeDays` días.
 *     Se ejecuta ANTES que los precios (la capitalización depende de las acciones).
 *   * Fines de semana y festivos: no hay sesión nueva ⇒ no se llama a ningún proveedor.
 */
export interface AutoSyncState {
  now: Date;
  /** Calendario almacenado alrededor de hoy (al menos las últimas dos semanas y la próxima). */
  sessions: readonly MarketSession[];
  /** Sesión de las instantáneas de mercado más recientes (null si no hay). */
  snapshotsAsOf: string | null;
  /** Securities cuya instantánea va por detrás de snapshotsAsOf. */
  laggingSecurities: number;
  /** Última sesión de los índices sintéticos (null si no hay). */
  groupIndicesAsOf: string | null;
  lastSecSuccessAt: string | null;
  /** Último sync de precios terminado (para espaciar los reintentos de series rezagadas). */
  lastPriceRunAt: string | null;
  force?: boolean;
  secMaxAgeDays?: number;
}

export interface AutoSyncPlan {
  prices: boolean;
  sec: boolean;
  /** Última sesión definitiva según el calendario. */
  targetSession: string | null;
  /** Próximo momento en que habrá una sesión nueva definitiva (informativo). */
  nextFinalAt: string | null;
  reasons: string[];
}

export const SEC_MAX_AGE_DAYS = 7;
/** Una serie que sigue por detrás (suspendida, deslistada) se reintenta como mucho cada 6 h. */
export const LAGGING_RETRY_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

export function planAutoSync(state: AutoSyncState): AutoSyncPlan {
  const reasons: string[] = [];
  const target = lastFinalSession(state.sessions, state.now)?.date ?? null;
  const next = state.sessions
    .map((s) => ({ date: s.date, finalAt: Date.parse(s.closesAt) + BAR_FINAL_AFTER_CLOSE_MS }))
    .filter((s) => s.finalAt > state.now.getTime())
    .sort((a, b) => a.finalAt - b.finalAt)[0];

  let prices = false;
  if (state.force) {
    prices = true;
    reasons.push("forced");
  } else if (!target) {
    reasons.push("no final session in the stored calendar");
  } else if (!state.snapshotsAsOf || state.snapshotsAsOf < target) {
    prices = true;
    reasons.push(`new final session ${target} (materialised: ${state.snapshotsAsOf ?? "none"})`);
  } else if (!state.groupIndicesAsOf || state.groupIndicesAsOf < target) {
    prices = true;
    reasons.push(`synthetic indices behind (${state.groupIndicesAsOf ?? "none"} < ${target})`);
  } else if (state.laggingSecurities > 0 && (!state.lastPriceRunAt || state.now.getTime() - Date.parse(state.lastPriceRunAt) > LAGGING_RETRY_MS)) {
    // Series que fallaron en la última ejecución: se reintentan (el resto es incremental e idempotente).
    prices = true;
    reasons.push(`${state.laggingSecurities} securities behind ${target}: retry`);
  } else {
    reasons.push(`up to date (${target})`);
  }

  const maxAge = (state.secMaxAgeDays ?? SEC_MAX_AGE_DAYS) * DAY_MS;
  const sec = state.force === true || !state.lastSecSuccessAt || state.now.getTime() - Date.parse(state.lastSecSuccessAt) > maxAge;
  if (sec) reasons.push(state.lastSecSuccessAt ? `SEC data older than ${state.secMaxAgeDays ?? SEC_MAX_AGE_DAYS} days` : "no SEC sync recorded");
  // Si hay que refrescar la SEC, también se recalculan instantáneas (market cap depende de las acciones).
  if (sec && !prices && target) {
    prices = true;
    reasons.push("recompute snapshots after SEC refresh");
  }

  return { prices, sec, targetSession: target, nextFinalAt: next ? new Date(next.finalAt).toISOString() : null, reasons };
}
