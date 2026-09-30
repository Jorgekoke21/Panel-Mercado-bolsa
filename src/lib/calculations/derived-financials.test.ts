import { describe, expect, it } from "vitest";
import type { FinancialStatementValue } from "@/domain/fundamentals";
import { AAPL_FUNDAMENTALS_TRIMMED } from "@/providers/eodhd/__fixtures__/aapl";
import { mapEarningsEvents, mapStatements } from "@/providers/eodhd/mappers";
import { fundamentalsSchema } from "@/providers/eodhd/schemas";
import { deriveFinancials, FCF_FORMULA } from "./derived-financials";

const raw = fundamentalsSchema.parse(AAPL_FUNDAMENTALS_TRIMMED);
const provider = mapStatements(raw).values;

const v = (lineItem: FinancialStatementValue["lineItem"], value: number, fiscalPeriodEnd = "2025-09-30", periodType: "annual" | "quarterly" = "annual"): FinancialStatementValue => ({
  lineItem,
  periodType,
  fiscalPeriodEnd,
  filingDate: null,
  currency: "USD",
  origin: "provider",
  value,
  missingReason: null,
  sourceField: "test",
});

describe("EPS provenance", () => {
  it("provider earnings EPS stays a provider value with unspecified basis, never a statement EPS", () => {
    const events = mapEarningsEvents(raw);
    expect(events.every((e) => e.epsBasis === "unspecified")).toBe(true);
    const derived = deriveFinancials(provider).values;
    // El EPS de earnings no aparece como eps_basic/eps_diluted con valor.
    expect(derived.filter((d) => d.lineItem.startsWith("eps_") && d.value !== null)).toEqual([]);
  });

  it("real EODHD statements have no weighted-average shares ⇒ calculated EPS is NULL with an explicit reason", () => {
    const eps = deriveFinancials(provider).values.filter((d) => d.lineItem === "eps_basic" || d.lineItem === "eps_diluted");
    expect(eps.length).toBeGreaterThan(0);
    for (const e of eps) {
      expect(e).toMatchObject({ origin: "calculated", value: null, missingReason: "provider_missing_weighted_average_shares" });
    }
  });

  it("never substitutes period-end shares outstanding for weighted-average shares", () => {
    const values = [v("net_income_to_common", 1000), v("net_income", 1000), v("shares_outstanding", 100)];
    const eps = deriveFinancials(values).values.filter((d) => d.lineItem === "eps_basic");
    expect(eps).toEqual([expect.objectContaining({ value: null, missingReason: "provider_missing_weighted_average_shares" })]);
  });

  it("calculates basic and diluted EPS when compatible components exist", () => {
    const values = [v("net_income_to_common", 1000), v("weighted_average_shares_basic", 100), v("weighted_average_shares_diluted", 125)];
    const byItem = Object.fromEntries(deriveFinancials(values).values.map((d) => [d.lineItem, d]));
    expect(byItem.eps_basic).toMatchObject({ value: 10, missingReason: null, sourceField: "marketradar:net_income_to_common/weighted_average_shares_basic" });
    expect(byItem.eps_diluted?.value).toBe(8);
  });

  it("reports missing numerator and incompatible components explicitly", () => {
    const noNumerator = deriveFinancials([v("net_income", 5), v("weighted_average_shares_basic", 100)]).values.find((d) => d.lineItem === "eps_basic");
    expect(noNumerator?.missingReason).toBe("provider_missing_net_income_to_common");
    const zeroShares = deriveFinancials([v("net_income_to_common", 5), v("weighted_average_shares_basic", 0)]).values.find((d) => d.lineItem === "eps_basic");
    expect(zeroShares?.missingReason).toBe("incompatible_components");
  });
});

describe("FCF: provider vs calculated", () => {
  it("keeps the provider FCF untouched and adds a calculated FCF = OCF − capex (capex positive)", () => {
    const derived = deriveFinancials(provider);
    const q = "2026-06-30";
    const providerFcf = provider.find((p) => p.lineItem === "free_cash_flow" && p.fiscalPeriodEnd === q && p.periodType === "quarterly");
    const calculated = derived.values.find((d) => d.lineItem === "free_cash_flow" && d.fiscalPeriodEnd === q && d.periodType === "quarterly");
    expect(providerFcf).toMatchObject({ origin: "provider", value: 31914000000 });
    expect(calculated).toMatchObject({ origin: "calculated", value: 34369000000 - 2455000000, sourceField: FCF_FORMULA });
    expect(derived.fcfDivergences).toEqual([]);
  });

  it("flags a material divergence without overwriting either value", () => {
    const values = [
      v("operating_cash_flow", 58533, "2020-06-30", "quarterly"),
      v("capital_expenditure", 0, "2020-06-30", "quarterly"),
      v("free_cash_flow", 14706, "2020-06-30", "quarterly"),
    ];
    const derived = deriveFinancials(values);
    expect(derived.values.find((d) => d.lineItem === "free_cash_flow")?.value).toBe(58533);
    expect(derived.fcfDivergences).toEqual([
      expect.objectContaining({ fiscalPeriodEnd: "2020-06-30", providerFcf: 14706, calculatedFcf: 58533, relativeDifference: expect.closeTo(0.7488, 3) }),
    ]);
    expect(values[2]?.value).toBe(14706);
  });

  it("does not calculate FCF when a component is missing", () => {
    expect(deriveFinancials([v("operating_cash_flow", 10)]).values.some((d) => d.lineItem === "free_cash_flow")).toBe(false);
  });
});
