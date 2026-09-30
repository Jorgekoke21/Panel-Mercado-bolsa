import type { CorporateAction } from "@/domain/corporate-actions";
import { type MarketSession, missingSessions } from "@/domain/market-calendar";
import type { DailyBar } from "@/domain/prices";

/**
 * Control de calidad de una serie de precios diaria (función pura). Resultado:
 *
 *   * PASS     — serie al día, sin huecos respecto al calendario oficial y sin saltos sin explicar.
 *   * WARNING  — utilizable, con incidencias concretas (huecos, barras rechazadas, saltos de precio
 *                sin acción corporativa, eventos no soportados que afectan a los ajustes…).
 *   * MISSING  — el proveedor no tiene barras para la security.
 *   * FAIL     — la serie no es utilizable como dato actual (desfasada varias sesiones).
 *
 * Las notas `info` explican hechos que no son incidencias (p. ej. histórico que empieza con la
 * salida a bolsa).
 */
export type SeriesQualityStatus = "PASS" | "WARNING" | "MISSING" | "FAIL";

export interface SeriesQualityNote {
  severity: "info" | "warning" | "fail";
  kind: string;
  message: string;
}

export interface SeriesQualityInput {
  bars: readonly DailyBar[];
  /** Calendario oficial que cubre, al menos, el rango de las barras. */
  sessions: readonly MarketSession[];
  /** Última sesión cuya barra ya debería existir (definitiva). */
  expectedLastSession: string | null;
  /** Primera fecha pedida al proveedor. */
  requestedFrom: string;
  actions: readonly CorporateAction[];
  /** Barras rechazadas por el mapeo (precio no positivo, low > high, duplicadas). */
  rejectedBars: readonly string[];
  /** Acciones que no generaron factor (con motivo). */
  skippedFactors: readonly { exDate: string; kind: string; reason: string }[];
}

/** Sesiones de retraso toleradas antes de considerar la serie no actual. */
export const MAX_STALE_SESSIONS = 3;
/** Variación diaria a partir de la cual un salto de precio se revisa. */
export const UNEXPLAINED_JUMP = 0.4;
/**
 * Ratios de split habituales (y sus inversos). 3:2 (−33 %) queda por debajo del umbral y su inverso
 * (+50 %) coincide con subidas reales (resultados), así que no se usa.
 */
const SPLIT_RATIOS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
const SPLIT_TOLERANCE = 0.03;
/** Un cierre que se multiplica (o divide) por 5 o más en una sesión no es un movimiento de mercado normal. */
const EXTREME_RATIO = 5;

/** ¿El cociente de cierres parece un split (≈ 1/2, 1/10 hacia abajo; ≈ 2, 10 hacia arriba; o ≥ 5×)? */
export function looksLikeSplit(ratio: number): boolean {
  if (ratio >= EXTREME_RATIO || ratio <= 1 / EXTREME_RATIO) return true;
  return SPLIT_RATIOS.some((r) => Math.abs(ratio * r - 1) <= SPLIT_TOLERANCE || Math.abs(ratio / r - 1) <= SPLIT_TOLERANCE);
}

/** Sesiones seguidas con volumen 0 y el mismo cierre a partir de las cuales la cotización se considera suspendida. */
export const SUSPENDED_RUN = 3;
/** Tolerancia para open/close fuera del rango high–low. */
const OHLC_TOLERANCE = 0.005;

const list = (dates: readonly string[], max = 5) => `${dates.slice(0, max).join(", ")}${dates.length > max ? ` … (+${dates.length - max})` : ""}`;

export function assessSeriesQuality(input: SeriesQualityInput): { status: SeriesQualityStatus; notes: SeriesQualityNote[] } {
  const { bars, sessions } = input;
  const notes: SeriesQualityNote[] = [];
  const first = bars[0];
  const last = bars.at(-1);
  if (!first || !last) {
    return { status: "MISSING", notes: [{ severity: "fail", kind: "no_bars", message: "The provider returned no daily bars for this security" }] };
  }

  // 1. Actualidad: sesiones del calendario posteriores a la última barra.
  if (input.expectedLastSession && last.tradeDate < input.expectedLastSession) {
    const behind = sessions.filter((s) => s.date > last.tradeDate && s.date <= (input.expectedLastSession as string)).length;
    if (behind > 0) {
      notes.push({
        severity: behind > MAX_STALE_SESSIONS ? "fail" : "warning",
        kind: "stale",
        message: `Last bar ${last.tradeDate} is ${behind} session(s) behind ${input.expectedLastSession}`,
      });
    }
  }

  // 2. Huecos respecto al calendario oficial dentro del rango de la serie.
  const dates = new Set(bars.map((b) => b.tradeDate));
  const gaps = missingSessions(sessions, dates, first.tradeDate, last.tradeDate);
  if (gaps.length > 0) notes.push({ severity: "warning", kind: "missing_sessions", message: `${gaps.length} calendar session(s) without a bar: ${list(gaps)}` });
  const sessionDates = new Set(sessions.map((s) => s.date));
  const calendarFrom = sessions[0]?.date ?? "9999";
  const calendarTo = sessions.at(-1)?.date ?? "0000";
  const extra = bars.filter((b) => b.tradeDate >= calendarFrom && b.tradeDate <= calendarTo && !sessionDates.has(b.tradeDate)).map((b) => b.tradeDate);
  if (extra.length > 0) notes.push({ severity: "warning", kind: "non_session_bars", message: `${extra.length} bar(s) on non-session days: ${list(extra)}` });

  // 3. Histórico más corto que el pedido (salida a bolsa o inicio de datos del proveedor).
  const firstSessionRequested = sessions.find((s) => s.date >= input.requestedFrom)?.date ?? input.requestedFrom;
  if (first.tradeDate > firstSessionRequested) {
    notes.push({ severity: "info", kind: "short_history", message: `History starts on ${first.tradeDate} (requested from ${input.requestedFrom}); longer-period returns are unavailable` });
  }

  // 4. Barras rechazadas y OHLC incoherente.
  if (input.rejectedBars.length > 0) notes.push({ severity: "warning", kind: "rejected_bars", message: `${input.rejectedBars.length} bar(s) rejected: ${list(input.rejectedBars, 3)}` });
  const inconsistent = bars
    .filter((b) => b.open > b.high * (1 + OHLC_TOLERANCE) || b.open < b.low * (1 - OHLC_TOLERANCE) || b.close > b.high * (1 + OHLC_TOLERANCE) || b.close < b.low * (1 - OHLC_TOLERANCE))
    .map((b) => b.tradeDate);
  if (inconsistent.length > 0) notes.push({ severity: "warning", kind: "ohlc_inconsistent", message: `${inconsistent.length} bar(s) with open/close outside high–low: ${list(inconsistent)}` });
  const suspended: string[] = [];
  let run = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i] as DailyBar;
    run = b.volume === 0 && b.close === (bars[i - 1] as DailyBar).close ? run + 1 : 0;
    if (run === SUSPENDED_RUN) suspended.push(b.tradeDate);
  }
  if (suspended.length > 0) {
    notes.push({ severity: "warning", kind: "suspended_trading", message: `${SUSPENDED_RUN}+ consecutive sessions with zero volume and a frozen close (trading suspended?) around: ${list(suspended)}` });
  }
  const zeroVolume = bars.filter((b) => b.volume === 0).map((b) => b.tradeDate);
  if (zeroVolume.length > 0) notes.push({ severity: "info", kind: "zero_volume", message: `${zeroVolume.length} bar(s) with zero volume: ${list(zeroVolume)}` });

  // 5. Saltos de precio: sin acción corporativa ⇒ posible split no registrado; con split ⇒ el salto debe cuadrar.
  // Los splits que el motor de ajustes ya descartó (no reflejados en precios) se informan como factor_skipped.
  const skippedSplits = new Set(input.skippedFactors.filter((s) => s.kind === "split").map((s) => s.exDate));
  const splitsByDate = new Map(input.actions.flatMap((a) => (a.kind === "split" && !skippedSplits.has(a.exDate) ? [[a.exDate, a.fromShares / a.toShares] as const] : [])));
  const otherEventDates = new Set([...input.actions.filter((a) => a.kind === "unsupported").map((a) => a.exDate), ...skippedSplits]);
  const unexplained: string[] = [];
  const largeMoves: string[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1] as DailyBar;
    const bar = bars[i] as DailyBar;
    const ratio = bar.close / prev.close;
    const splitFactor = splitsByDate.get(bar.tradeDate);
    if (splitFactor !== undefined) {
      // Tras un split N:M el precio sin ajustar debería multiplicarse por ~M/N.
      const implied = ratio / splitFactor;
      if (implied > 1 + UNEXPLAINED_JUMP || implied < 1 - UNEXPLAINED_JUMP) {
        notes.push({ severity: "warning", kind: "split_not_reflected", message: `Split on ${bar.tradeDate} (factor ${splitFactor}) not reflected in raw prices (close ratio ${ratio.toFixed(3)})` });
      }
    } else if (Math.abs(ratio - 1) > UNEXPLAINED_JUMP && !otherEventDates.has(bar.tradeDate)) {
      // Un movimiento grande que cuadra con un ratio de split ⇒ posible split no registrado (afecta a los
      // rendimientos). Si no cuadra, es un movimiento de mercado (resultados, fusiones, crisis): informativo.
      (looksLikeSplit(ratio) ? unexplained : largeMoves).push(`${bar.tradeDate} (${((ratio - 1) * 100).toFixed(0)}%)`);
    }
  }
  if (unexplained.length > 0) {
    notes.push({ severity: "warning", kind: "possible_unrecorded_split", message: `Split-like daily move without a recorded split: ${list(unexplained)}` });
  }
  if (largeMoves.length > 0) {
    notes.push({ severity: "info", kind: "large_move", message: `Daily move above ${UNEXPLAINED_JUMP * 100}% (market move, not split-like): ${list(largeMoves)}` });
  }

  // 6. Eventos que los ajustes no aplican (dentro del histórico).
  for (const a of input.actions) {
    if (a.kind !== "unsupported" || a.exDate <= first.tradeDate || a.exDate > last.tradeDate) continue;
    const affectsPriceReturn = a.type === "stock_dividend" || a.type === "spinoff";
    notes.push({
      severity: affectsPriceReturn ? "warning" : "info",
      kind: `unsupported_${a.type}`,
      message: `${a.type.replace("_", " ")} on ${a.exDate} is not applied to adjusted series (${a.reason})${affectsPriceReturn ? "; returns across that date understate the holder's return" : "; total return excludes it"}`,
    });
  }
  for (const s of input.skippedFactors) {
    if (s.exDate <= first.tradeDate) continue;
    notes.push({ severity: "warning", kind: "factor_skipped", message: `${s.kind} ${s.exDate}: ${s.reason}` });
  }

  const status: SeriesQualityStatus = notes.some((n) => n.severity === "fail") ? "FAIL" : notes.some((n) => n.severity === "warning") ? "WARNING" : "PASS";
  return { status, notes };
}
