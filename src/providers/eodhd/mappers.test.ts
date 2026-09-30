import { describe, expect, it } from "vitest";
import { AAPL_DIVIDENDS_SAMPLE, AAPL_EOD_2020_SPLIT, AAPL_FUNDAMENTALS_TRIMMED, AAPL_SPLITS } from "./__fixtures__/aapl";
import {
  mapDividend,
  mapEarningsEstimates,
  mapEarningsEvents,
  mapEodBars,
  mapProfile,
  mapShares,
  mapSplits,
  mapStatements,
  mapValuation,
  parseSplitRatio,
  toNumber,
} from "./mappers";
import { dividendsResponseSchema, eodResponseSchema, fundamentalsSchema, splitsResponseSchema } from "./schemas";

const fundamentals = fundamentalsSchema.parse(AAPL_FUNDAMENTALS_TRIMMED);

describe("EODHD mapping — prices", () => {
  it("maps real /eod rows to canonical raw bars (close unadjusted, provider adjusted kept apart)", () => {
    const { bars, issues } = mapEodBars(eodResponseSchema.parse(AAPL_EOD_2020_SPLIT));
    expect(issues).toEqual([]);
    expect(bars).toHaveLength(7);
    expect(bars[3]).toEqual({
      tradeDate: "2020-08-28",
      open: 504.05,
      high: 505.77,
      low: 498.31,
      close: 499.23,
      volume: 187630000,
      providerAdjustedClose: 120.9557,
    });
    // Primer día tras el split 4:1: el close sin ajustar cae ~4×.
    expect(bars[4]?.close).toBe(129.04);
  });

  it("rejects impossible bars with an explicit reason and never invents values", () => {
    const { bars, issues } = mapEodBars([
      { date: "2024-01-03", open: 10, high: 9, low: 11, close: 10, volume: 5 },
      { date: "2024-01-02", open: 0, high: 1, low: 0, close: 1, volume: 5 },
      { date: "2024-01-04", open: null, high: 1, low: 1, close: 1, volume: 5 },
      { date: "2024-01-05", open: 10, high: 12, low: 9, close: 13, volume: null },
      { date: "2024-01-05", open: 10, high: 12, low: 9, close: 11, volume: 1 },
    ]);
    expect(bars.map((b) => b.tradeDate)).toEqual(["2024-01-05"]);
    expect(bars[0]?.volume).toBeNull();
    expect(issues).toHaveLength(5);
    expect(issues.join(" ")).toMatch(/low 11 > high 9/);
    expect(issues.join(" ")).toMatch(/duplicated/);
  });
});

describe("EODHD mapping — corporate actions", () => {
  it("parses split ratios as new/old shares", () => {
    expect(parseSplitRatio("4.000000/1.000000")).toEqual({ toShares: 4, fromShares: 1 });
    expect(parseSplitRatio("1:10")).toEqual({ toShares: 1, fromShares: 10 });
    expect(parseSplitRatio("garbage")).toBeNull();
  });

  it("maps the real AAPL split history", () => {
    const { actions, issues } = mapSplits(splitsResponseSchema.parse(AAPL_SPLITS));
    expect(issues).toEqual([]);
    expect(actions.map((a) => `${a.exDate} ${a.toShares}:${a.fromShares}`)).toEqual([
      "1987-06-16 2:1",
      "2000-06-21 2:1",
      "2005-02-28 2:1",
      "2014-06-09 7:1",
      "2020-08-31 4:1",
    ]);
  });

  it("stores the UNADJUSTED dividend amount and keeps the provider-adjusted one for validation", () => {
    const [feb2020] = dividendsResponseSchema.parse(AAPL_DIVIDENDS_SAMPLE);
    const action = mapDividend(feb2020!, "USD");
    expect(action).toMatchObject({ kind: "cash_dividend", exDate: "2020-02-07", amount: 0.77, providerAdjustedAmount: 0.1925, frequency: "Quarterly" });
  });

  it("accepts dividends without declared period (null) as regular cash dividends", () => {
    const old = dividendsResponseSchema.parse(AAPL_DIVIDENDS_SAMPLE).find((d) => d.date === "1987-05-11");
    expect(mapDividend(old!, "USD")).toMatchObject({ kind: "cash_dividend", amount: 0.12096, frequency: null });
  });

  it("flags special, unknown-period, foreign-currency and amount-less dividends as unsupported (never dropped)", () => {
    const base = { date: "2024-03-01", value: 1, unadjustedValue: 1, currency: "USD" };
    expect(mapDividend({ ...base, period: "Special" }, "USD")).toMatchObject({ kind: "unsupported", type: "special_dividend" });
    expect(mapDividend({ ...base, period: "Other" }, "USD")).toMatchObject({ kind: "unsupported", type: "other", providerLabel: "Other" });
    expect(mapDividend({ ...base, period: "Quarterly", currency: "CAD" }, "USD")).toMatchObject({ kind: "unsupported", reason: expect.stringMatching(/CAD/) });
    expect(mapDividend({ ...base, period: "Quarterly", unadjustedValue: null }, "USD")).toMatchObject({ kind: "unsupported", amount: null });
  });
});

describe("EODHD mapping — fundamentals", () => {
  it("maps statements to canonical line items with the source field recorded", () => {
    const { values, warnings } = mapStatements(fundamentals);
    expect(warnings).toEqual([]);
    const find = (code: string, period: string, type = "quarterly") =>
      values.find((v) => v.lineItem === code && v.fiscalPeriodEnd === period && v.periodType === type);
    expect(find("revenue", "2026-06-30")).toMatchObject({ value: 109417000000, currency: "USD", filingDate: "2026-07-31", sourceField: "Income_Statement.quarterly.totalRevenue" });
    expect(find("net_income", "2025-09-30", "annual")?.value).toBe(112010000000);
    expect(find("total_debt", "2026-06-30")).toMatchObject({ value: 84307000000, sourceField: "Balance_Sheet.quarterly.shortLongTermDebtTotal" });
    expect(find("revenue", "2026-06-30")).toMatchObject({ origin: "provider", missingReason: null });
    // cashAndEquivalents es null en EODHD → se usa `cash` y queda registrado.
    expect(find("cash_and_equivalents", "2026-06-30")).toMatchObject({ value: 39544000000, sourceField: "Balance_Sheet.quarterly.cash" });
    expect(find("shares_outstanding", "2026-06-30")?.value).toBe(14750302000);
  });

  it("normalises capex to a positive outflow and keeps FCF = OCF − capex", () => {
    const { values } = mapStatements(fundamentals);
    const q = (code: string) => values.find((v) => v.lineItem === code && v.fiscalPeriodEnd === "2026-06-30" && v.periodType === "quarterly")?.value;
    expect(q("capital_expenditure")).toBe(2455000000);
    expect(q("operating_cash_flow")! - q("capital_expenditure")!).toBe(q("free_cash_flow"));
  });

  it("does not produce EPS line items: EODHD statements do not publish them (MISSING, not inferred)", () => {
    const { values } = mapStatements(fundamentals);
    expect(values.some((v) => v.lineItem === "eps_basic" || v.lineItem === "eps_diluted")).toBe(false);
  });

  it("uses quarterly shares outstanding and ignores the annual block (future-dated year buckets)", () => {
    const points = mapShares(fundamentals);
    expect(points.map((p) => `${p.basis}:${p.asOfDate}`)).toEqual(["period_end:2026-03-31", "period_end:2026-06-30", "current:2026-09-27"]);
    expect(points.some((p) => p.asOfDate === "2026-12-31")).toBe(false);
  });

  it("maps the profile used for identity verification", () => {
    expect(mapProfile(fundamentals)).toMatchObject({ providerCode: "AAPL", cik: "0000320193", isin: "US0378331005", currency: "USD", updatedAt: "2026-09-27" });
  });
});

describe("EODHD mapping — earnings", () => {
  it("never reports a surprise when actual or estimate is missing (EODHD sends epsDifference 0)", () => {
    const events = mapEarningsEvents(fundamentals);
    const upcoming = events.find((e) => e.fiscalPeriodEnd === "2026-09-30");
    expect(upcoming).toMatchObject({ providerEpsActual: null, providerEpsEstimate: 1.98, providerEpsSurprise: null, providerEpsSurprisePercent: null, timing: "after_market", reportDate: "2026-10-29" });
    const old = events.find((e) => e.fiscalPeriodEnd === "1993-12-31");
    expect(old).toMatchObject({ providerEpsActual: 0.0031, providerEpsEstimate: null, providerEpsSurprise: null, timing: null });
    const reported = events.find((e) => e.fiscalPeriodEnd === "2026-06-30");
    expect(reported).toMatchObject({ providerEpsActual: 2.02, providerEpsEstimate: 1.88, providerEpsSurprise: 0.14, providerEpsSurprisePercent: 7.4468, epsBasis: "unspecified" });
  });

  it("maps consensus estimates with numeric strings parsed", () => {
    const estimates = mapEarningsEstimates(fundamentals);
    expect(estimates.length).toBeGreaterThan(0);
    const nextYear = estimates.find((e) => e.periodCode === "+1y");
    expect(nextYear?.epsAvg).toBeCloseTo(9.5783);
    expect(nextYear?.epsAnalysts).toBe(40);
  });
});

describe("EODHD mapping — valuation", () => {
  it("marks every value as provider-origin with its source field", () => {
    const values = mapValuation(fundamentals);
    expect(values.every((v) => v.origin === "provider")).toBe(true);
    expect(values.find((v) => v.metric === "pe_forward")).toMatchObject({ value: 35.2113, method: "Valuation.ForwardPE" });
  });

  it("treats a 0 ratio as missing but keeps a 0 dividend yield", () => {
    const raw = fundamentalsSchema.parse({ General: { Code: "X" }, Valuation: { TrailingPE: 0, ForwardPE: "12.5" }, Highlights: { DividendYield: 0 } });
    const values = mapValuation(raw);
    expect(values.map((v) => v.metric).sort()).toEqual(["dividend_yield", "pe_forward"]);
  });

  it("parses numbers defensively", () => {
    expect(toNumber("383266000000.00")).toBe(383266000000);
    expect(toNumber("")).toBeNull();
    expect(toNumber("n/a")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});
