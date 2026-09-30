import { capWeightedReturn, equalWeightedReturn, groupBy, mean, sum, weights } from "./aggregation";

describe("aggregation", () => {
  it("sums and averages ignoring missing values", () => {
    expect(sum([1, null, 2, undefined, Number.NaN])).toBe(3);
    expect(sum([null])).toBeNull();
    expect(mean([1, 3, null])).toBe(2);
    expect(mean([])).toBeNull();
  });

  it("computes cap-weighted returns", () => {
    const result = capWeightedReturn([
      { marketCap: 300, return: 0.1 },
      { marketCap: 100, return: -0.1 },
    ]);
    expect(result).toBeCloseTo(0.05, 10);
  });

  it("shows how one giant can dominate the cap-weighted figure while most members fall", () => {
    const members = [
      { marketCap: 3000, return: 0.04 },
      { marketCap: 50, return: -0.02 },
      { marketCap: 50, return: -0.02 },
      { marketCap: 50, return: -0.02 },
    ];
    expect(capWeightedReturn(members)).toBeGreaterThan(0);
    expect(equalWeightedReturn(members.map((m) => m.return))).toBeLessThan(0);
  });

  it("skips members without market cap or return", () => {
    expect(capWeightedReturn([{ marketCap: null, return: 0.5 }, { marketCap: 10, return: null }])).toBeNull();
    expect(capWeightedReturn([{ marketCap: 0, return: 0.5 }, { marketCap: 10, return: 0.1 }])).toBeCloseTo(0.1);
  });

  it("groups items preserving order", () => {
    const groups = groupBy(["a1", "b1", "a2"], (s) => s[0]);
    expect([...groups.entries()]).toEqual([["a", ["a1", "a2"]], ["b", ["b1"]]]);
  });

  it("computes weights over positive values", () => {
    expect(weights([1, 3, null, -1])).toEqual([0.25, 0.75, null, null]);
    expect(weights([null])).toEqual([null]);
  });
});
