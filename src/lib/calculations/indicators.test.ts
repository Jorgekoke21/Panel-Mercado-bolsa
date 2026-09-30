import { describe, expect, it } from "vitest";
import type { AdjustedBar } from "@/domain/prices";
import { ema, rsi, sma } from "./indicators";
import { computeIndicators, toSecurityMarketSnapshot } from "./market-snapshot";
import { periodReturns, subtractCalendar } from "./period-returns";
import { computeTtm } from "./ttm";
import type { FinancialStatementValue } from "@/domain/fundamentals";

describe("indicators", () => {
  it("SMA", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("EMA seeded with the SMA", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });

  it("RSI (Wilder): 100 on a straight rise, 0 on a straight fall, ~50 when flat-alternating", () => {
    const up = Array.from({ length: 20 }, (_, i) => 10 + i);
    expect(rsi(up, 14).at(-1)).toBe(100);
    expect(rsi(up.slice().reverse(), 14).at(-1)).toBe(0);
    const zigzag = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 10 : 11));
    expect(rsi(zigzag, 14).at(-1)).toBeGreaterThan(40);
    expect(rsi(zigzag, 14).at(-1)).toBeLessThan(60);
    expect(rsi(up.slice(0, 14), 14).every((v) => v === null)).toBe(true);
  });
});

describe("period returns", () => {
  it("subtracts calendar periods clamping to month end", () => {
    expect(subtractCalendar("2026-03-31", { months: 1 })).toBe("2026-02-28");
    expect(subtractCalendar("2024-03-31", { months: 1 })).toBe("2024-02-29");
    expect(subtractCalendar("2026-01-15", { months: 3 })).toBe("2025-10-15");
    expect(subtractCalendar("2026-09-28", { years: 5 })).toBe("2021-09-28");
  });

  it("uses the last close on or before the base date; YTD from last year's final close; null without history", () => {
    const points = [
      { date: "2025-12-30", close: 90 },
      { date: "2025-12-31", close: 100 },
      { date: "2026-01-02", close: 101 },
      { date: "2026-08-27", close: 108 },
      { date: "2026-08-28", close: 110 },
      { date: "2026-09-21", close: 115 },
      { date: "2026-09-22", close: 116 },
      { date: "2026-09-23", close: 117 },
      { date: "2026-09-24", close: 118 },
      { date: "2026-09-25", close: 119 },
      { date: "2026-09-28", close: 120 },
    ];
    const r = periodReturns(points, ["1D", "1W", "1M", "YTD", "1Y", "5Y"]);
    expect(r["1D"]).toBeCloseTo(120 / 119 - 1);
    expect(r["1W"]).toBeCloseTo(120 / 115 - 1);
    expect(r["1M"]).toBeCloseTo(120 / 110 - 1);
    expect(r.YTD).toBeCloseTo(0.2);
    expect(r["1Y"]).toBeNull();
    expect(r["5Y"]).toBeNull();
  });
});

describe("TTM (derived)", () => {
  const q = (lineItem: FinancialStatementValue["lineItem"], fiscalPeriodEnd: string, value: number): FinancialStatementValue => ({
    lineItem,
    periodType: "quarterly",
    fiscalPeriodEnd,
    filingDate: null,
    currency: "USD",
    origin: "provider",
    value,
    missingReason: null,
    sourceField: "test",
  });

  it("sums the last four consecutive quarters for flows", () => {
    const values = [q("revenue", "2025-06-30", 94), q("revenue", "2025-09-30", 102), q("revenue", "2025-12-31", 143), q("revenue", "2026-03-31", 111), q("revenue", "2026-06-30", 109)];
    expect(computeTtm(values, "revenue")).toMatchObject({ value: 102 + 143 + 111 + 109, asOfPeriodEnd: "2026-06-30" });
  });

  it("returns null when a quarter is missing instead of summing a gap", () => {
    const values = [q("revenue", "2025-06-30", 94), q("revenue", "2025-12-31", 143), q("revenue", "2026-03-31", 111), q("revenue", "2026-06-30", 109)];
    expect(computeTtm(values, "revenue")).toBeNull();
  });

  it("takes the latest quarter for balance-sheet items", () => {
    expect(computeTtm([q("total_debt", "2026-03-31", 80), q("total_debt", "2026-06-30", 84)], "total_debt")?.value).toBe(84);
  });
});

describe("market indicators (calculated from split-adjusted bars)", () => {
  const series = (n: number, lastVolume = 2000): AdjustedBar[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2025, 8, 1) + i * 86_400_000);
      const close = 100 + i;
      return { tradeDate: d.toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: i === n - 1 ? lastVolume : 1000 };
    });

  it("derives price, returns, 52W range, moving averages, MACD, ATR and volume stats", () => {
    const ind = computeIndicators(series(260));
    expect(ind?.close).toBe(359);
    expect(ind?.previousClose).toBe(358);
    expect(ind?.high52w).toBe(360);
    expect(ind?.isNew52wHigh).toBe(true);
    expect(ind?.isNew52wLow).toBe(false);
    // Media de las 20 sesiones ANTERIORES (no incluye la última): 1000 ⇒ volumen relativo 2×.
    expect(ind?.averageVolume20).toBe(1000);
    expect(ind?.relativeVolume).toBe(2);
    expect(ind?.averageDollarVolume20).toBeCloseTo((1000 * (339 + 358)) / 2);
    expect(ind?.sma20).toBeCloseTo(349.5);
    expect(ind?.sma200).toBeCloseTo(259.5);
    expect(ind?.ema200).not.toBeNull();
    // Serie lineal +1/sesión: ATR = rango 2; MACD positivo (EMA rápida por encima de la lenta).
    expect(ind?.atr14).toBeCloseTo(2);
    expect(ind?.macd).toBeGreaterThan(0);
    expect(ind?.rsi14).toBe(100);
    expect(ind?.returns["1D"]).toBeCloseTo(359 / 358 - 1);
    // 260 días naturales de histórico: no llega a 1Y ⇒ null (nunca se extrapola).
    expect(ind?.returns["1Y"]).toBeNull();
    expect(computeIndicators([])).toBeNull();
  });

  it("leaves long-window indicators null with short histories (recent IPO)", () => {
    const ind = computeIndicators(series(30));
    expect(ind?.sma20).not.toBeNull();
    expect(ind?.sma50).toBeNull();
    expect(ind?.ema200).toBeNull();
    expect(ind?.macdSignal).toBeNull();
  });

  it("needs 20 complete prior volumes for relative volume", () => {
    const bars = series(40);
    bars[30] = { ...(bars[30] as AdjustedBar), volume: null };
    const ind = computeIndicators(bars);
    expect(ind?.averageVolume20).toBeNull();
    expect(ind?.relativeVolume).toBeNull();
  });

  it("publishes a market cap in the snapshot only when VERIFIED", () => {
    const ind = computeIndicators(series(260)) as NonNullable<ReturnType<typeof computeIndicators>>;
    expect(toSecurityMarketSnapshot("s", "USD", ind, { value: 3590, status: "VERIFIED", reason: "consistent_with_weighted_average_shares" }).marketCap).toBe(3590);
    const unverified = toSecurityMarketSnapshot("s", "USD", ind, { value: 3590, status: "UNVERIFIED", reason: "multi_class_share_scope_unverified" });
    expect(unverified.marketCap).toBeNull();
    expect(unverified.marketCapReason).toBe("multi_class_share_scope_unverified");
  });
});

