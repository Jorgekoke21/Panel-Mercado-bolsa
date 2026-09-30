import { alignToCommonStart, rebaseSeries, simpleReturn } from "./returns";

describe("returns", () => {
  it("computes simple returns and rejects invalid inputs", () => {
    expect(simpleReturn(100, 110)).toBeCloseTo(0.1);
    expect(simpleReturn(0, 10)).toBeNull();
    expect(simpleReturn(null, 10)).toBeNull();
  });

  it("rebases a series to 100", () => {
    const rebased = rebaseSeries([
      { time: "2026-01-01", value: 50 },
      { time: "2026-01-02", value: 55 },
    ]);
    expect(rebased[0]?.value).toBe(100);
    expect(rebased[1]?.value).toBeCloseTo(110, 10);
    expect(rebaseSeries([{ time: "t", value: 0 }])).toEqual([]);
  });

  it("aligns series to their latest common start", () => {
    const [a, b] = alignToCommonStart([
      [{ time: "2026-01-01", value: 1 }, { time: "2026-01-02", value: 2 }],
      [{ time: "2026-01-02", value: 5 }],
    ]);
    expect(a).toEqual([{ time: "2026-01-02", value: 2 }]);
    expect(b).toHaveLength(1);
  });
});
