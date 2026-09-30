import { describe, expect, it } from "vitest";
import type { FinancialStatementValue } from "@/domain/fundamentals";
import aaplFacts from "./__fixtures__/companyfacts-aapl.json";
import brkFacts from "./__fixtures__/companyfacts-brk.json";
import jpmFacts from "./__fixtures__/companyfacts-jpm.json";
import orlyFacts from "./__fixtures__/companyfacts-orly.json";
import pltrFacts from "./__fixtures__/companyfacts-pltr.json";
import { industryTemplate, requiredConcepts } from "./concepts";
import { classifyDuration, dedupeFacts, normalizeCompanyFacts, type SecFact } from "./normalize";
import { companyFactsSchema, flattenCompanyFacts } from "./parse";

/** Fixtures: companyfacts REALES de la SEC (29-09-2026), recortados a los concepts usados y a periodos desde 2023-06. */
function run(raw: unknown, sic: number) {
  const { facts } = flattenCompanyFacts(companyFactsSchema.parse(raw), requiredConcepts());
  return normalizeCompanyFacts(facts, { template: industryTemplate(sic), minPeriodEnd: "2023-01-01" });
}

const find = (values: FinancialStatementValue[], item: string, type: "annual" | "quarterly", end: string) =>
  values.find((v) => v.lineItem === item && v.periodType === type && v.fiscalPeriodEnd === end);

const coverage = (n: ReturnType<typeof run>, item: string) => n.coverage.find((c) => c.lineItem === item);

describe("SEC normalization — building blocks", () => {
  it("classifies durations including 52/53-week fiscal periods", () => {
    expect(classifyDuration("2024-09-29", "2024-12-28")).toBe("quarter");
    expect(classifyDuration("2024-09-29", "2025-03-29")).toBe("half");
    expect(classifyDuration("2024-09-29", "2025-06-28")).toBe("nine_months");
    expect(classifyDuration("2023-10-01", "2024-09-28")).toBe("annual");
    expect(classifyDuration("2024-01-01", "2024-02-15")).toBe("other");
  });

  it("dedupes comparatives across filings and keeps the latest (restated) value", () => {
    const base = { concept: "Revenues", unit: "USD", start: "2024-01-01", end: "2024-12-31", fy: 2024, fp: "FY" };
    const [only] = dedupeFacts([
      { ...base, val: 100, accn: "0000000000-25-000001", form: "10-K", filed: "2025-02-01" },
      { ...base, val: 101, accn: "0000000000-26-000001", form: "10-K", filed: "2026-02-01", fy: 2025 },
      { ...base, val: 999, accn: "0000000000-26-000002", form: "8-K", filed: "2026-03-01" },
    ] as SecFact[]);
    expect(only).toMatchObject({ val: 101, accn: "0000000000-26-000001", restated: true, originalFy: 2024 });
  });
});

describe("SEC normalization — AAPL (52/53-week fiscal year ending September)", () => {
  const n = run(aaplFacts, 3571);

  it("rebuilds the fiscal calendar from 10-K / 10-Q periods", () => {
    const fy2025 = n.calendar.find((y) => y.fiscalYear === 2025);
    expect(fy2025).toMatchObject({ start: "2024-09-29", end: "2025-09-27" });
    expect(fy2025?.quarters.map((q) => `${q.quarter}:${q.end}`)).toEqual(["1:2024-12-28", "2:2025-03-29", "3:2025-06-28", "4:2025-09-27"]);
  });

  it("keeps reported annual values with full provenance", () => {
    expect(find(n.values, "revenue", "annual", "2025-09-27")).toMatchObject({
      value: 416161000000,
      origin: "reported",
      fiscalYear: 2025,
      sourceField: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
      provenance: expect.objectContaining({ form: "10-K", accessionNumber: expect.stringMatching(/^\d{10}-\d{2}-\d{6}$/) }),
    });
  });

  it("derives Q4 = FY − 9M YTD (matches the Q4 figure published by third-party vendors)", () => {
    const q4 = find(n.values, "revenue", "quarterly", "2025-09-27");
    expect(q4).toMatchObject({ value: 102466000000, origin: "derived", fiscalQuarter: 4 });
    expect(q4?.provenance?.derivation).toMatch(/FY to 2025-09-27 .* − 9M YTD to 2025-06-28/);
  });

  it("de-accumulates YTD cash flows into quarters", () => {
    expect(find(n.values, "operating_cash_flow", "quarterly", "2025-03-29")).toMatchObject({ value: 23952000000, origin: "derived" });
    expect(find(n.values, "operating_cash_flow", "quarterly", "2024-12-28")).toMatchObject({ value: 29935000000, origin: "reported" });
    expect(find(n.values, "capital_expenditure", "quarterly", "2025-06-28")?.value).toBe(3462000000);
  });

  it("never subtracts per-share or share-count values (no Q4 EPS)", () => {
    expect(find(n.values, "eps_diluted", "quarterly", "2025-06-28")).toMatchObject({ origin: "reported" });
    expect(find(n.values, "eps_diluted", "quarterly", "2025-09-27")).toBeUndefined();
    expect(find(n.values, "weighted_average_shares_diluted", "quarterly", "2025-09-27")).toBeUndefined();
    expect(find(n.values, "eps_diluted", "annual", "2025-09-27")?.value).toBe(7.46);
  });

  it("derives total debt from its reported components and records them", () => {
    const debt = find(n.values, "total_debt", "quarterly", "2025-09-27") ?? find(n.values, "total_debt", "annual", "2025-09-27");
    expect(debt?.value).toBe(90700000000 + 7979000000);
    expect(debt?.provenance?.derivation).toMatch(/LongTermDebt .* CommercialPaper/);
  });

  it("exposes single-class cover-page shares", () => {
    expect(n.coverShares.length).toBeGreaterThan(0);
    expect(n.coverShares.every((s) => s.basis === "cover_page" && s.sourceField.startsWith("dei:"))).toBe(true);
  });
});

describe("SEC normalization — JPM (bank template)", () => {
  const n = run(jpmFacts, 6021);

  it("uses bank revenue (net of interest expense) and bank cash", () => {
    expect(coverage(n, "revenue")?.concepts[0]).toBe("RevenuesNetOfInterestExpense");
    expect(coverage(n, "cash_and_equivalents")?.concepts[0]).toBe("CashAndDueFromBanks");
  });

  it("marks gross profit, operating income, capex and debt NOT APPLICABLE (never 0)", () => {
    for (const item of ["gross_profit", "operating_income", "capital_expenditure", "total_debt"]) {
      expect(coverage(n, item)?.status).toBe("not_applicable");
      expect(n.values.some((v) => v.lineItem === item)).toBe(false);
    }
  });

  it("still has EPS and weighted-average shares as reported", () => {
    expect(coverage(n, "eps_diluted")?.status).toBe("available");
    expect(coverage(n, "weighted_average_shares_diluted")?.status).toBe("available");
  });
});

describe("SEC normalization — BRK (insurer, multi-class, company-specific EPS)", () => {
  const n = run(brkFacts, 6331);

  it("explains missing EPS instead of inventing it (EPS per Class A equivalent share is a company extension)", () => {
    const eps = coverage(n, "eps_basic");
    // Con el histórico completo es "discontinued" (último EPS estándar en 2013); en el fixture recortado
    // el EPS antiguo queda fuera del calendario ⇒ "missing". En ambos casos, con explicación.
    expect(["discontinued", "missing"]).toContain(eps?.status);
    expect(eps?.reason).toMatch(/company-specific extension|outside the periods|dimensions/);
    expect(coverage(n, "eps_diluted")?.status).toBe("missing");
    expect(n.values.some((v) => v.lineItem === "eps_basic" && v.fiscalPeriodEnd >= "2023-01-01")).toBe(false);
  });

  it("has revenue, net income and cash flows", () => {
    for (const item of ["revenue", "net_income", "operating_cash_flow", "total_assets", "total_equity"]) expect(coverage(n, item)?.status).toBe("available");
  });

  it("publishes no issuer-level cover shares (they are per class, i.e. dimensional)", () => {
    expect(n.coverShares).toEqual([]);
  });
});

describe("SEC normalization — PLTR and ORLY", () => {
  it("PLTR: no debt concept in recent filings ⇒ not reported, never 0", () => {
    const n = run(pltrFacts, 7372);
    expect(["missing", "discontinued"]).toContain(coverage(n, "total_debt")?.status);
    expect(n.values.some((v) => v.lineItem === "total_debt" && v.value === 0)).toBe(false);
  });

  it("ORLY: keeps negative equity as reported", () => {
    const n = run(orlyFacts, 5531);
    const equity = n.values.filter((v) => v.lineItem === "total_equity").sort((a, b) => a.fiscalPeriodEnd.localeCompare(b.fiscalPeriodEnd)).at(-1);
    expect(equity?.value).toBeLessThan(0);
    expect(equity?.origin).toBe("reported");
  });
});

describe("SEC normalization — concept fallback discipline", () => {
  // Presentado 30 días después del cierre (10-Q realista).
  const fact = (concept: string, end: string, val: number, filed = new Date(Date.parse(end) + 30 * 86_400_000).toISOString().slice(0, 10)): SecFact => ({
    concept,
    unit: "USD",
    start: null,
    end,
    val,
    accn: `0000000000-26-${String(val).padStart(6, "0").slice(-6)}`,
    fy: 2025,
    fp: "Q1",
    form: "10-Q",
    filed,
  });
  const quarter = (end: string, start: string, fp: string): SecFact => ({ ...fact("Revenues", end, 1), start, fp });

  it("fills periods outside the principal concept range, but never gaps inside it", () => {
    const facts: SecFact[] = [
      // Calendario: tres trimestres naturales.
      quarter("2025-03-31", "2025-01-01", "Q1"),
      quarter("2025-06-30", "2025-04-01", "Q2"),
      quarter("2025-09-30", "2025-07-01", "Q3"),
      // Principal con un hueco en junio; alternativo con datos antes y en el hueco.
      fact("CashAndCashEquivalentsAtCarryingValue", "2025-03-31", 10),
      fact("CashAndCashEquivalentsAtCarryingValue", "2025-09-30", 30),
      fact("CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "2025-06-30", 999),
    ];
    const n = normalizeCompanyFacts(facts, { template: "general", minPeriodEnd: "2020-01-01" });
    const cash = n.values.filter((v) => v.lineItem === "cash_and_equivalents").map((v) => `${v.fiscalPeriodEnd}=${v.value}`);
    expect(cash).toEqual(["2025-03-31=10", "2025-09-30=30"]);
  });
});
