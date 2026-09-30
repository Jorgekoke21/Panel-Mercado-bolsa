import type { SecurityMarketSnapshot } from "@/domain/market-data";

/** Instantánea mínima para tests (todos los campos a null salvo los indicados). */
export function testSnapshot(overrides: Partial<SecurityMarketSnapshot> = {}): SecurityMarketSnapshot {
  return {
    securityId: "s",
    currency: "USD",
    asOfDate: "2026-09-28",
    price: null,
    previousClose: null,
    returns: {},
    marketCap: null,
    marketCapStatus: "MISSING",
    marketCapReason: null,
    volume: null,
    averageVolume20: null,
    relativeVolume: null,
    averageDollarVolume20: null,
    rsi14: null,
    sma20: null,
    sma50: null,
    sma200: null,
    ema20: null,
    ema50: null,
    ema200: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    atr14: null,
    high52w: null,
    low52w: null,
    isNew52wHigh: false,
    isNew52wLow: false,
    ...overrides,
  };
}
