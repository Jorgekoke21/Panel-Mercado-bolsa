import { describe, expect, it } from "vitest";
import type { CorporateAction } from "@/domain/corporate-actions";
import type { DailyBar } from "@/domain/prices";
import { mapEodBars } from "@/providers/eodhd/mappers";
import { AAPL_EOD_2020_SPLIT } from "@/providers/eodhd/__fixtures__/aapl";
import { adjustBars, computeAdjustmentFactors, splitContradiction, reconcileWithProviderAdjusted } from "./adjustments";

const bar = (tradeDate: string, close: number, volume: number | null = 1000): DailyBar => ({
  tradeDate,
  open: close,
  high: close,
  low: close,
  close,
  volume,
  providerAdjustedClose: null,
});

const split = (exDate: string, toShares: number, fromShares = 1): CorporateAction => ({ kind: "split", exDate, toShares, fromShares });
const dividend = (exDate: string, amount: number): CorporateAction => ({
  kind: "cash_dividend",
  exDate,
  amount,
  currency: "USD",
  providerAdjustedAmount: null,
  declarationDate: null,
  recordDate: null,
  paymentDate: null,
  frequency: "Quarterly",
});

describe("split adjustment", () => {
  it("re-expresses AAPL before the 2020-08-31 4:1 split in today's share basis (real EODHD bars)", () => {
    const { bars } = mapEodBars(AAPL_EOD_2020_SPLIT);
    const { factors } = computeAdjustmentFactors(bars, [split("2020-08-31", 4)]);
    const adjusted = adjustBars(bars, factors, { mode: "split", volumeBasis: "split_adjusted" });
    const byDate = new Map(adjusted.map((b) => [b.tradeDate, b]));
    expect(byDate.get("2020-08-28")?.close).toBeCloseTo(124.8075, 6);
    expect(byDate.get("2020-08-28")?.high).toBeCloseTo(126.4425, 6);
    // Sesiones en o después de la fecha ex no cambian.
    expect(byDate.get("2020-08-31")?.close).toBe(129.04);
    // El volumen de EODHD ya viene ajustado por splits: NO se vuelve a multiplicar.
    expect(byDate.get("2020-08-28")?.volume).toBe(187630000);
  });

  it("adjusts raw volume by the inverse ratio when the provider sends unadjusted volume", () => {
    const bars = [bar("2024-01-02", 100, 1000), bar("2024-01-03", 25, 4000)];
    const { factors } = computeAdjustmentFactors(bars, [split("2024-01-03", 4)]);
    const [before] = adjustBars(bars, factors, { mode: "split", volumeBasis: "raw" });
    expect(before).toMatchObject({ close: 25, volume: 4000 });
  });

  it("compounds several splits (AAPL 7:1 in 2014 and 4:1 in 2020 ⇒ ÷28)", () => {
    const bars = [bar("2014-06-06", 645.5708), bar("2014-06-09", 93.7), bar("2020-08-28", 499.23), bar("2020-08-31", 129.04)];
    const { factors } = computeAdjustmentFactors(bars, [split("2014-06-09", 7), split("2020-08-31", 4)]);
    const adjusted = adjustBars(bars, factors, { mode: "split", volumeBasis: "split_adjusted" });
    expect(adjusted.map((b) => b.close)).toEqual([expect.closeTo(645.5708 / 28, 9), expect.closeTo(93.7 / 4, 9), expect.closeTo(499.23 / 4, 9), 129.04]);
  });

  it("handles reverse splits (1:10)", () => {
    const bars = [bar("2024-01-02", 1), bar("2024-01-03", 10)];
    const { factors } = computeAdjustmentFactors(bars, [split("2024-01-03", 1, 10)]);
    expect(adjustBars(bars, factors, { mode: "split", volumeBasis: "raw" })[0]).toMatchObject({ close: 10, volume: 100 });
  });
});

describe("dividend (total return) adjustment", () => {
  it("uses the previous unadjusted close: factor = 1 − D / C(t−1)", () => {
    const bars = [bar("2024-02-08", 100), bar("2024-02-09", 99), bar("2024-02-12", 101)];
    const { factors, skipped } = computeAdjustmentFactors(bars, [dividend("2024-02-09", 2)]);
    expect(skipped).toEqual([]);
    expect(factors).toEqual([expect.objectContaining({ kind: "cash_dividend", priceFactor: 0.98, referenceClose: 100, referenceDate: "2024-02-08" })]);
    const tr = adjustBars(bars, factors, { mode: "total_return", volumeBasis: "raw" });
    expect(tr.map((b) => b.close)).toEqual([expect.closeTo(98, 9), 99, 101]);
    // En modo price return los dividendos no se aplican.
    expect(adjustBars(bars, factors, { mode: "split", volumeBasis: "raw" })[0]?.close).toBe(100);
  });

  it("combines a split and a dividend: the dividend (unadjusted) matches the pre-split close basis", () => {
    // Ex-dividendo el 03-01 (−1 %) y split 4:1 el 04-01 (el precio sin ajustar cae a la cuarta parte).
    const bars = [bar("2024-01-02", 400), bar("2024-01-03", 396), bar("2024-01-04", 99)];
    const actions = [dividend("2024-01-03", 4), split("2024-01-04", 4)];
    // Dividendo pagado ANTES del split: 4 USD sobre un cierre previo de 400 ⇒ factor 0.99.
    const { factors } = computeAdjustmentFactors(bars, actions);
    const tr = adjustBars(bars, factors, { mode: "total_return", volumeBasis: "split_adjusted" });
    expect(tr.map((b) => b.close)).toEqual([expect.closeTo(400 * 0.99 * 0.25, 9), expect.closeTo(99, 9), 99]);
  });

  it("does not apply a split that the raw prices contradict (HON 2026-06-29: '1:2 reverse split' with a −1.9 % close)", () => {
    const bars = [bar("2026-06-26", 225.1), bar("2026-06-29", 220.8), bar("2026-06-30", 221.5)];
    const reverse = { kind: "split" as const, exDate: "2026-06-29", toShares: 1, fromShares: 2 };
    expect(splitContradiction(reverse, bars)).toMatch(/not reflected in raw prices/);
    const { factors, skipped } = computeAdjustmentFactors(bars, [reverse]);
    expect(factors).toEqual([]);
    expect(skipped).toEqual([expect.objectContaining({ kind: "split", exDate: "2026-06-29" })]);
    // Un split real (NVDA 10:1, 2024-06-10) sí cuadra con los precios.
    const nvda = [bar("2024-06-07", 1208.88), bar("2024-06-10", 121.79)];
    expect(splitContradiction({ kind: "split", exDate: "2024-06-10", toShares: 10, fromShares: 1 }, nvda)).toBeNull();
  });

  it("skips (and reports) events it cannot apply instead of guessing", () => {
    const bars = [bar("2024-03-01", 10), bar("2024-03-04", 10)];
    const actions: CorporateAction[] = [
      dividend("2024-01-15", 1),
      dividend("2024-03-04", 50),
      dividend("2024-12-01", 1),
      { kind: "unsupported", type: "spinoff", exDate: "2024-03-04", reason: "Spin-off", amount: null, currency: null, providerLabel: null },
    ];
    const { factors, skipped } = computeAdjustmentFactors(bars, actions);
    expect(factors).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/No session before/),
      expect.stringMatching(/not lower than the reference close/),
      expect.stringMatching(/not yet effective/),
      expect.stringMatching(/Unsupported/),
    ]);
  });
});

describe("reconciliation with the provider adjusted close", () => {
  it("our total-return series matches EODHD adjusted_close shape across the AAPL split (real data)", () => {
    const { bars } = mapEodBars(AAPL_EOD_2020_SPLIT);
    const { factors } = computeAdjustmentFactors(bars, [split("2020-08-31", 4)]);
    const tr = adjustBars(bars, factors, { mode: "total_return", volumeBasis: "split_adjusted" });
    const result = reconcileWithProviderAdjusted(bars, tr);
    expect(result.compared).toBe(7);
    // Sin dividendos en esta ventana, la única diferencia es la escala (normalizada) → < 0.01 %.
    expect(result.maxRelativeDeviation).toBeLessThan(1e-4);
  });
});
