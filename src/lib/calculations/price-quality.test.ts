import { describe, expect, it } from "vitest";
import type { CorporateAction } from "@/domain/corporate-actions";
import type { MarketSession } from "@/domain/market-calendar";
import type { DailyBar } from "@/domain/prices";
import { assessSeriesQuality, looksLikeSplit, type SeriesQualityInput } from "./price-quality";

const session = (date: string): MarketSession => ({ date, opensAt: `${date}T13:30:00.000Z`, closesAt: `${date}T20:00:00.000Z` });
const DATES = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"];
const bar = (tradeDate: string, close: number, volume: number | null = 1000): DailyBar => ({ tradeDate, open: close, high: close, low: close, close, volume, providerAdjustedClose: null });

const input = (overrides: Partial<SeriesQualityInput> = {}): SeriesQualityInput => ({
  bars: DATES.map((d, i) => bar(d, 100 + i)),
  sessions: DATES.map(session),
  expectedLastSession: "2026-09-28",
  requestedFrom: "2026-09-21",
  actions: [],
  rejectedBars: [],
  skippedFactors: [],
  ...overrides,
});

const kinds = (r: ReturnType<typeof assessSeriesQuality>) => r.notes.map((n) => n.kind);

describe("price series quality", () => {
  it("PASS: current, complete against the calendar, no unexplained jumps", () => {
    expect(assessSeriesQuality(input())).toEqual({ status: "PASS", notes: [] });
  });

  it("MISSING when the provider has no bars", () => {
    expect(assessSeriesQuality(input({ bars: [] })).status).toBe("MISSING");
  });

  it("WARNING for calendar sessions without a bar (missing sessions)", () => {
    const r = assessSeriesQuality(input({ bars: DATES.filter((d) => d !== "2026-09-23").map((d) => bar(d, 100)) }));
    expect(r.status).toBe("WARNING");
    expect(r.notes[0]?.message).toMatch(/1 calendar session\(s\) without a bar: 2026-09-23/);
  });

  it("WARNING when slightly behind, FAIL when the series is several sessions stale", () => {
    const sessions = [...DATES, "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map(session);
    expect(assessSeriesQuality(input({ sessions, expectedLastSession: "2026-09-29" })).status).toBe("WARNING");
    const stale = assessSeriesQuality(input({ sessions, expectedLastSession: "2026-10-02" }));
    expect(stale.status).toBe("FAIL");
    expect(stale.notes[0]?.message).toMatch(/4 session\(s\) behind/);
  });

  it("history shorter than requested (recent IPO, e.g. PLTR) is informative, not a warning", () => {
    const r = assessSeriesQuality(input({ bars: DATES.slice(2).map((d) => bar(d, 100)), requestedFrom: "2026-09-21" }));
    expect(r.status).toBe("PASS");
    expect(kinds(r)).toEqual(["short_history"]);
  });

  it("split-like jump without a recorded split (EXE 2020: ×125 reverse split) is a WARNING", () => {
    const bars = [bar("2026-09-21", 0.1312), bar("2026-09-22", 16.38), ...DATES.slice(2).map((d) => bar(d, 16))];
    const r = assessSeriesQuality(input({ bars }));
    expect(r.status).toBe("WARNING");
    expect(kinds(r)).toContain("possible_unrecorded_split");
  });

  it("a large market move that does not look like a split (+46 % on earnings) is informative only", () => {
    const bars = [bar("2026-09-21", 100), bar("2026-09-22", 146), ...DATES.slice(2).map((d) => bar(d, 146))];
    const r = assessSeriesQuality(input({ bars }));
    expect(r.status).toBe("PASS");
    expect(kinds(r)).toEqual(["large_move"]);
    expect(looksLikeSplit(0.5)).toBe(true);
    expect(looksLikeSplit(0.1)).toBe(true);
    expect(looksLikeSplit(125)).toBe(true);
    expect(looksLikeSplit(1.46)).toBe(false);
    expect(looksLikeSplit(0.6)).toBe(false);
  });

  it("a recorded split that matches the prices is fine; one the prices contradict is reported", () => {
    const split: CorporateAction = { kind: "split", exDate: "2026-09-22", toShares: 4, fromShares: 1 };
    const ok = [bar("2026-09-21", 400), ...DATES.slice(1).map((d) => bar(d, 100))];
    expect(assessSeriesQuality(input({ bars: ok, actions: [split] })).status).toBe("PASS");
    const flat = DATES.map((d) => bar(d, 100));
    const r = assessSeriesQuality(input({ bars: flat, actions: [split] }));
    expect(kinds(r)).toContain("split_not_reflected");
    // Si el motor de ajustes ya lo descartó, se informa una sola vez (factor_skipped).
    const skipped = assessSeriesQuality(input({ bars: flat, actions: [split], skippedFactors: [{ exDate: "2026-09-22", kind: "split", reason: "Split 4:1 not reflected in raw prices; not applied" }] }));
    expect(kinds(skipped)).toEqual(["factor_skipped"]);
  });

  it("unsupported events: spin-offs and stock dividends warn (price return), special dividends inform (total return)", () => {
    const actions: CorporateAction[] = [
      { kind: "unsupported", type: "spinoff", exDate: "2026-09-24", reason: "Spin-off", amount: null, currency: null, providerLabel: null },
      { kind: "unsupported", type: "special_dividend", exDate: "2026-09-25", reason: "Special", amount: 1, currency: "USD", providerLabel: null },
    ];
    const r = assessSeriesQuality(input({ actions }));
    expect(r.status).toBe("WARNING");
    expect(r.notes.map((n) => [n.kind, n.severity])).toEqual([
      ["unsupported_spinoff", "warning"],
      ["unsupported_special_dividend", "info"],
    ]);
  });

  it("flags suspended trading (zero volume and frozen close for several sessions)", () => {
    const bars = DATES.map((d, i) => (i >= 1 && i <= 4 ? bar(d, 11.85, 0) : bar(d, i === 0 ? 11.85 : 44.99)));
    const r = assessSeriesQuality(input({ bars }));
    expect(kinds(r)).toContain("suspended_trading");
  });
});
