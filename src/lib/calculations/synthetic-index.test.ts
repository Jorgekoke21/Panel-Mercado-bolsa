import { describe, expect, it } from "vitest";
import { GroupIndexAccumulator, rebase, sharesOn } from "./synthetic-index";

const SESSIONS = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"];
const series = (closes: number[], caps: (number | null)[] = closes.map(() => null), from = 0) =>
  closes.map((c, i) => ({ date: SESSIONS[from + i] as string, adjClose: c, marketCap: caps[i] ?? null }));

describe("MarketRadar synthetic group indices", () => {
  it("equal weight: daily-rebalanced average of member returns, base 100", () => {
    const acc = new GroupIndexAccumulator(SESSIONS);
    acc.add({ groups: ["sector:x"], capWeighted: false, bars: series([100, 110, 110, 121]) }); // +10 %, 0, +10 %
    acc.add({ groups: ["sector:x"], capWeighted: false, bars: series([50, 45, 45, 45]) }); // −10 %, 0, 0
    const s = acc.build("sector:x");
    expect(s?.startDate).toBe("2026-01-02");
    expect(s?.equal).toEqual([100, 100, 100, expect.closeTo(105, 9)]);
    expect(s?.cap).toBeNull();
    expect(s).toMatchObject({ equalMembers: 2, capMembers: 0, totalMembers: 2 });
  });

  it("cap weight: weights are previous-close market caps (only members with verified caps)", () => {
    const acc = new GroupIndexAccumulator(SESSIONS);
    acc.add({ groups: ["index:sp500"], capWeighted: true, bars: series([100, 110, 110, 110], [300, 330, 330, 330]) });
    acc.add({ groups: ["index:sp500"], capWeighted: true, bars: series([10, 9, 9, 9], [100, 90, 90, 90]) });
    acc.add({ groups: ["index:sp500"], capWeighted: false, bars: series([1, 1.2, 1.2, 1.2]) }); // sin cap verificada: solo equal
    const s = acc.build("index:sp500");
    // Día 1: (300 × 10 % + 100 × −10 %) / 400 = +5 %.
    expect(s?.cap?.[1]).toBeCloseTo(105);
    expect(s?.equal[1]).toBeCloseTo(100 * (1 + (0.1 - 0.1 + 0.2) / 3));
    expect(s?.capMembers).toBe(2);
  });

  it("members join from their first session and split-like jumps are excluded", () => {
    const acc = new GroupIndexAccumulator(SESSIONS);
    acc.add({ groups: ["industry:y"], capWeighted: false, bars: series([100, 101, 102, 103]) });
    acc.add({ groups: ["industry:y"], capWeighted: false, bars: series([0.13, 16.4, 16.4], undefined, 1) }); // ×125: split no registrado
    const s = acc.build("industry:y");
    expect(acc.excludedReturns).toBe(1);
    // Día 2: solo el primer miembro (el salto ×125 del segundo se excluye). Día 3: ambos.
    expect(s?.equal[2]).toBeCloseTo(102);
    expect(s?.equal[3]).toBeCloseTo(102 * (1 + (103 / 102 - 1 + 0) / 2));
  });

  it("re-expresses shares for splits between the report date and the day (price × shares = cap that day)", () => {
    const history = [
      { asOfDate: "2024-01-20", shares: 100 },
      { asOfDate: "2024-07-20", shares: 1000 },
    ];
    const splits = [{ exDate: "2024-06-10", shareFactor: 10 }];
    expect(sharesOn("2024-03-01", history, splits)).toBe(100);
    expect(sharesOn("2024-06-15", history, splits)).toBe(1000); // cifra pre-split × 10
    expect(sharesOn("2024-08-01", history, splits)).toBe(1000);
    expect(sharesOn("2023-06-01", history, splits)).toBe(100); // antes del primer dato: el primero
    expect(sharesOn("2024-01-01", [], splits)).toBeNull();
  });

  it("rebases any series to 100 at the first date of the selected period", () => {
    const pts = [
      { time: "2026-01-02", value: 50 },
      { time: "2026-01-05", value: 55 },
      { time: "2026-01-06", value: 60.5 },
    ];
    expect(rebase(pts, "2026-01-03")).toEqual([
      { time: "2026-01-05", value: 100 },
      { time: "2026-01-06", value: expect.closeTo(110, 9) },
    ]);
    expect(rebase(pts, "2027-01-01")).toEqual([]);
  });
});
