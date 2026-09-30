import { type BreadthInput, computeBreadth } from "./breadth";

const member = (overrides: Partial<BreadthInput> = {}): BreadthInput => ({
  return: 0,
  price: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 50,
  isNew52wHigh: false,
  isNew52wLow: false,
  ...overrides,
});

describe("computeBreadth", () => {
  it("counts advancers, decliners and unchanged", () => {
    const stats = computeBreadth([
      member({ return: 0.01 }),
      member({ return: 0.02 }),
      member({ return: -0.01 }),
      member({ return: 0 }),
      member({ return: null }),
    ]);
    expect(stats).toMatchObject({ total: 5, advancers: 2, decliners: 1, unchanged: 1, returnCoverage: 4 });
    expect(stats.pctPositive).toBeCloseTo(0.5);
  });

  it("computes % above each EMA over members with data only", () => {
    const stats = computeBreadth([
      member({ price: 110, ema20: 100, ema50: 120, ema200: 90 }),
      member({ price: 90, ema20: 100, ema50: 80, ema200: null }),
      member({ price: null }),
    ]);
    expect(stats.pctAboveEma20).toBeCloseTo(0.5);
    expect(stats.pctAboveEma50).toBeCloseTo(0.5);
    expect(stats.pctAboveEma200).toBeCloseTo(1);
    expect(stats.emaCoverage).toEqual({ ema20: 2, ema50: 2, ema200: 1 });
  });

  it("averages RSI and counts 52-week extremes", () => {
    const stats = computeBreadth([
      member({ rsi14: 70, isNew52wHigh: true }),
      member({ rsi14: 30, isNew52wLow: true }),
      member({ rsi14: null, isNew52wHigh: true }),
    ]);
    expect(stats.averageRsi14).toBe(50);
    expect(stats.rsiCoverage).toBe(2);
    expect(stats.new52wHighs).toBe(2);
    expect(stats.new52wLows).toBe(1);
  });

  it("returns nulls rather than zeros when there is no data", () => {
    const stats = computeBreadth([]);
    expect(stats.pctPositive).toBeNull();
    expect(stats.pctAboveEma50).toBeNull();
    expect(stats.averageRsi14).toBeNull();
  });
});
