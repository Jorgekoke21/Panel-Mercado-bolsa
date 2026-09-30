import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { AdjustedBar } from "@/domain/prices";
import { TIME_RANGES, type TimeRange } from "@/domain/time-range";
import { atr, ema, macd, rsi, sma } from "./indicators";
import { periodReturns, subtractCalendar } from "./period-returns";

/**
 * Indicadores de la ÚLTIMA sesión CALCULADOS por MarketRadar a partir de barras diarias ajustadas
 * por splits (price return). Ningún valor procede de indicadores o ratios del proveedor.
 *
 *   * SMA/EMA 20·50·200, RSI 14 (Wilder), MACD 12·26·9, ATR 14 (Wilder).
 *   * Volumen relativo = volumen de la última sesión / media de las 20 sesiones ANTERIORES.
 *   * 52W: máximo/mínimo intradía de las sesiones posteriores a (fecha − 1 año), incluida la última.
 *     "Nuevo máximo/mínimo" = el máximo (mínimo) intradía de la última sesión marca el extremo.
 *   * null = histórico insuficiente para ese indicador (nunca se extrapola).
 */
export interface MarketIndicators {
  asOfDate: string;
  firstDate: string;
  barCount: number;
  close: number;
  previousClose: number | null;
  volume: number | null;
  returns: Record<TimeRange, number | null>;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  averageVolume20: number | null;
  relativeVolume: number | null;
  averageDollarVolume20: number | null;
  high52w: number;
  low52w: number;
  isNew52wHigh: boolean;
  isNew52wLow: boolean;
}

const lastOf = (values: readonly (number | null)[]) => values.at(-1) ?? null;
export const VOLUME_WINDOW = 20;

export function computeIndicators(bars: readonly AdjustedBar[]): MarketIndicators | null {
  const last = bars.at(-1);
  const first = bars[0];
  if (!last || !first) return null;
  const closes = bars.map((b) => b.close);

  const since = subtractCalendar(last.tradeDate, { years: 1 });
  let high52w = -Infinity;
  let low52w = Infinity;
  for (let i = bars.length - 1; i >= 0 && (bars[i] as AdjustedBar).tradeDate > since; i--) {
    const b = bars[i] as AdjustedBar;
    if (b.high > high52w) high52w = b.high;
    if (b.low < low52w) low52w = b.low;
  }

  // Ventana de volumen: las 20 sesiones anteriores a la última, todas con volumen.
  const prior = bars.slice(-VOLUME_WINDOW - 1, -1);
  const complete = prior.length === VOLUME_WINDOW && prior.every((b) => b.volume !== null);
  const averageVolume20 = complete ? prior.reduce((s, b) => s + (b.volume as number), 0) / VOLUME_WINDOW : null;
  const averageDollarVolume20 = complete ? prior.reduce((s, b) => s + (b.volume as number) * b.close, 0) / VOLUME_WINDOW : null;

  const returns = periodReturns(bars.map((b) => ({ date: b.tradeDate, close: b.close })), TIME_RANGES) as Record<TimeRange, number | null>;
  const m = macd(closes);

  return {
    asOfDate: last.tradeDate,
    firstDate: first.tradeDate,
    barCount: bars.length,
    close: last.close,
    previousClose: bars.at(-2)?.close ?? null,
    volume: last.volume,
    returns,
    sma20: lastOf(sma(closes, 20)),
    sma50: lastOf(sma(closes, 50)),
    sma200: lastOf(sma(closes, 200)),
    ema20: lastOf(ema(closes, 20)),
    ema50: lastOf(ema(closes, 50)),
    ema200: lastOf(ema(closes, 200)),
    rsi14: lastOf(rsi(closes, 14)),
    macd: lastOf(m.macd),
    macdSignal: lastOf(m.signal),
    macdHistogram: lastOf(m.histogram),
    atr14: lastOf(atr(bars, 14)),
    averageVolume20,
    relativeVolume: averageVolume20 && averageVolume20 > 0 && last.volume !== null ? last.volume / averageVolume20 : null,
    averageDollarVolume20,
    high52w,
    low52w,
    isNew52wHigh: last.high >= high52w,
    isNew52wLow: last.low <= low52w,
  };
}

/** Instantánea de dominio (UI) a partir de los indicadores y la capitalización ya verificada. */
export function toSecurityMarketSnapshot(
  securityId: string,
  currency: string,
  ind: MarketIndicators,
  marketCap: { value: number | null; status: SecurityMarketSnapshot["marketCapStatus"]; reason: string | null },
): SecurityMarketSnapshot {
  return {
    securityId,
    currency,
    asOfDate: ind.asOfDate,
    price: ind.close,
    previousClose: ind.previousClose,
    returns: ind.returns,
    marketCap: marketCap.status === "VERIFIED" ? marketCap.value : null,
    marketCapStatus: marketCap.status,
    marketCapReason: marketCap.reason,
    volume: ind.volume,
    averageVolume20: ind.averageVolume20,
    relativeVolume: ind.relativeVolume,
    averageDollarVolume20: ind.averageDollarVolume20,
    rsi14: ind.rsi14,
    sma20: ind.sma20,
    sma50: ind.sma50,
    sma200: ind.sma200,
    ema20: ind.ema20,
    ema50: ind.ema50,
    ema200: ind.ema200,
    macd: ind.macd,
    macdSignal: ind.macdSignal,
    macdHistogram: ind.macdHistogram,
    atr14: ind.atr14,
    high52w: ind.high52w,
    low52w: ind.low52w,
    isNew52wHigh: ind.isNew52wHigh,
    isNew52wLow: ind.isNew52wLow,
  };
}
