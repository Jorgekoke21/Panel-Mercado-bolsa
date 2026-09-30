import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { RankingDefinition } from "@/domain/ranking";
import { metricValue, rankRows } from "./ranking";
import { testSnapshot } from "./test-snapshot";

const snapshot = (overrides: Partial<SecurityMarketSnapshot> = {}): SecurityMarketSnapshot => testSnapshot({ price: 100, ...overrides });

const def = (overrides: Partial<RankingDefinition> = {}): RankingDefinition => ({
  id: "t",
  title: "t",
  description: "",
  metric: { kind: "return", range: "1D" },
  direction: "desc",
  columns: [],
  limit: 10,
  ...overrides,
});

describe("rankRows", () => {
  const rows = [
    { ticker: "AAA", snapshot: snapshot({ returns: { "1D": 0.02 }, rsi14: 70 }) },
    { ticker: "BBB", snapshot: snapshot({ returns: { "1D": -0.05 }, rsi14: 20 }) },
    { ticker: "CCC", snapshot: snapshot({ returns: { "1D": 0.02 }, rsi14: null }) },
    { ticker: "DDD", snapshot: snapshot({ returns: { "1D": null } }) },
    { ticker: "EEE", snapshot: null },
  ];

  it("sorts descending with a stable ticker tie-break and excludes missing data", () => {
    expect(rankRows(rows, def()).map((r) => r.row.ticker)).toEqual(["AAA", "CCC", "BBB"]);
  });

  it("sorts ascending and applies the limit", () => {
    expect(rankRows(rows, def({ direction: "asc", limit: 1 })).map((r) => r.row.ticker)).toEqual(["BBB"]);
  });

  it("ranks by other metrics", () => {
    expect(rankRows(rows, def({ metric: { kind: "rsi14" } })).map((r) => r.row.ticker)).toEqual(["AAA", "BBB"]);
  });

  it("applies 52-week filters", () => {
    const withHigh = [
      { ticker: "X", snapshot: snapshot({ isNew52wHigh: true, returns: { "1D": 0.01 } }) },
      { ticker: "Y", snapshot: snapshot({ returns: { "1D": 0.03 } }) },
    ];
    expect(rankRows(withHigh, def({ filter: "new52wHigh" })).map((r) => r.row.ticker)).toEqual(["X"]);
  });
});

describe("metricValue", () => {
  it("derives dollar volume and 52-week distances", () => {
    const s = snapshot({ price: 90, volume: 1000, high52w: 100, low52w: 60 });
    expect(metricValue(s, { kind: "dollarVolume" })).toBe(90_000);
    expect(metricValue(s, { kind: "distanceFrom52wHigh" })).toBeCloseTo(-0.1);
    expect(metricValue(s, { kind: "distanceFrom52wLow" })).toBeCloseTo(0.5);
    expect(metricValue(snapshot({ price: null }), { kind: "distanceFrom52wHigh" })).toBeNull();
  });
});
