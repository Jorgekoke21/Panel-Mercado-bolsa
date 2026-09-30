import type { SecurityMarketSnapshot } from "@/domain/market-data";
import { aggregateMoney, computeGroupBreadth, computeGroupPerformance } from "./group-performance";
import { testSnapshot } from "./test-snapshot";

const snap = (marketCap: number, oneDay: number, currency = "USD"): SecurityMarketSnapshot =>
  testSnapshot({ securityId: `${marketCap}`, currency, price: 10, returns: { "1D": oneDay }, marketCap, marketCapStatus: "VERIFIED", rsi14: 50, ema20: 9, ema50: 11 });

describe("group performance", () => {
  it("never sums different currencies", () => {
    expect(aggregateMoney([{ value: 1, currency: "USD" }, { value: 2, currency: "USD" }])).toEqual({
      kind: "single",
      value: 3,
      currency: "USD",
    });
    expect(aggregateMoney([{ value: 1, currency: "USD" }, { value: 2, currency: "EUR" }])).toEqual({
      kind: "mixed",
      currencies: ["EUR", "USD"],
    });
    expect(aggregateMoney([{ value: null, currency: "USD" }])).toEqual({ kind: "empty" });
  });

  it("computes cap- and equal-weighted returns per range", () => {
    const perf = computeGroupPerformance([snap(300, 0.1), snap(100, -0.1), null]);
    expect(perf.count).toBe(3);
    expect(perf.capWeighted["1D"]).toBeCloseTo(0.05);
    expect(perf.equalWeighted["1D"]).toBeCloseTo(0);
    expect(perf.capWeighted["1Y"]).toBeNull();
    expect(perf.marketCap).toEqual({ kind: "single", value: 400, currency: "USD" });
  });

  it("computes breadth for the selected range", () => {
    const breadth = computeGroupBreadth([snap(1, 0.01), snap(1, -0.01), null], "1D");
    expect(breadth).toMatchObject({ total: 3, advancers: 1, decliners: 1, returnCoverage: 2 });
    expect(breadth.pctAboveEma20).toBe(1);
    expect(breadth.pctAboveEma50).toBe(0);
  });
});
