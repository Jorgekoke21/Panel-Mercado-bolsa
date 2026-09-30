/**
 * Indicadores técnicos (funciones puras). Entrada: serie cronológica ya ajustada por splits.
 * Salida alineada con la entrada: null mientras no hay suficiente histórico.
 */

export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] as number;
    if (i >= period) sum -= values[i - period] as number;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA con semilla SMA(period) en la sesión `period − 1`; α = 2 / (period + 1). */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i] as number;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = alpha * (values[i] as number) + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** MACD(fast, slow, signal): línea = EMA(fast) − EMA(slow); señal = EMA(signal) de la línea; histograma = línea − señal. */
export function macd(
  closes: readonly number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const line = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f === null || f === undefined || s === null || s === undefined ? null : f - s;
  });
  const firstIndex = line.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstIndex >= 0) {
    const tail = ema(line.slice(firstIndex) as number[], signal);
    tail.forEach((v, i) => (signalLine[firstIndex + i] = v));
  }
  const histogram = line.map((v, i) => (v === null || signalLine[i] === null ? null : v - (signalLine[i] as number)));
  return { macd: line, signal: signalLine, histogram };
}

/** ATR de Wilder: media suavizada del True Range = max(H − L, |H − Cprev|, |L − Cprev|). */
export function atr(bars: readonly { high: number; low: number; close: number }[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prev = (bars[i - 1] as { close: number }).close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  // Primer ATR: media simple de los TR 1..period (el TR 0 no tiene cierre previo).
  let value = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  out[period] = value;
  for (let i = period + 1; i < bars.length; i++) {
    value = (value * (period - 1) + (tr[i] as number)) / period;
    out[i] = value;
  }
  return out;
}

/** RSI de Wilder (suavizado 1/period). Primer valor en la sesión `period`. */
export function rsi(closes: readonly number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = (closes[i] as number) - (closes[i - 1] as number);
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const change = (closes[i] as number) - (closes[i - 1] as number);
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = value();
  }
  return out;
}
