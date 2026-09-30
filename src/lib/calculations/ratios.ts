import type { FinancialStatementValue, FundamentalOrigin, LineItemCode } from "@/domain/fundamentals";
import type { MarketCapCheck } from "./market-cap";
import { computeTtm, type TtmValue } from "./ttm";

/**
 * Ratios de valoración, rentabilidad y crecimiento CALCULADOS por MarketRadar (funciones puras).
 *
 * Cada ratio devuelve un valor o un estado explícito — nunca un número dudoso:
 *   * ok              — calculado con datos verificados.
 *   * not_meaningful  — calculable pero sin sentido económico (beneficio ≤ 0, patrimonio negativo…).
 *   * not_applicable  — no aplica al modelo de negocio (EV/EBITDA en bancos y aseguradoras…).
 *   * missing         — falta algún dato (se dice cuál).
 *   * unverified      — depende de una capitalización no verificada (multiclase…).
 */
export type RatioStatus = "ok" | "not_meaningful" | "not_applicable" | "missing" | "unverified";

export type RatioId =
  | "market_cap"
  | "enterprise_value"
  | "pe"
  | "ps"
  | "pb"
  | "ev_ebitda"
  | "fcf_yield"
  | "dividend_yield"
  | "gross_margin"
  | "operating_margin"
  | "net_margin"
  | "fcf_margin"
  | "roe"
  | "roic"
  | "revenue_growth"
  | "net_income_growth"
  | "eps_growth";

export type RatioUnit = "currency" | "multiple" | "percent";

export interface RatioResult {
  id: RatioId;
  label: string;
  group: "valuation" | "profitability" | "growth";
  unit: RatioUnit;
  status: RatioStatus;
  value: number | null;
  /** Fórmula legible. */
  formula: string;
  /** Motivo si no es ok. */
  reason: string | null;
  /** Entradas usadas (para el tooltip de procedencia). */
  inputs: string[];
}

export interface RatioInput {
  template: "general" | "financial" | "reit";
  /** Solo valores de UNA fuente de fundamentales (p. ej. SEC). */
  statements: readonly FinancialStatementValue[];
  /** Orígenes admitidos (SEC: reported + derived). */
  origins: readonly FundamentalOrigin[];
  price: { value: number; date: string } | null;
  marketCap: MarketCapCheck | null;
  /** Dividendos en efectivo por acción con fecha ex en los últimos 365 días (de acciones corporativas). null = desconocido. */
  /** Dividendos por acción de los últimos 12 meses (misma fuente que el precio) o null si no hay datos. */
  dividendsTtmPerShare: number | { perShare: number; foreignExcluded: number; specialExcluded: number } | null;
}

const fmtPeriod = (t: TtmValue) => `TTM to ${t.asOfPeriodEnd}`;

function latestValue(values: readonly FinancialStatementValue[], item: LineItemCode, origins: readonly FundamentalOrigin[], before?: string) {
  return values
    .filter((v) => v.lineItem === item && v.value !== null && origins.includes(v.origin) && (!before || v.fiscalPeriodEnd <= before))
    .sort((a, b) => b.fiscalPeriodEnd.localeCompare(a.fiscalPeriodEnd) || (a.periodType === "quarterly" ? -1 : 1))[0];
}

/** TTM de hace un año: los 4 trimestres que acaban ~12 meses antes del último TTM. */
function ttmYearAgo(values: readonly FinancialStatementValue[], item: LineItemCode, origins: readonly FundamentalOrigin[], latest: TtmValue | null): TtmValue | null {
  if (!latest) return null;
  const cutoff = new Date(Date.parse(latest.asOfPeriodEnd) - 330 * 86_400_000).toISOString().slice(0, 10);
  return computeTtm(values.filter((v) => v.fiscalPeriodEnd <= cutoff), item, origins);
}

export function computeRatios(input: RatioInput): RatioResult[] {
  const { statements: v, origins, template } = input;
  const financial = template === "financial";
  const ttm = (item: LineItemCode) => computeTtm(v, item, origins);
  const revenue = ttm("revenue");
  const netIncome = ttm("net_income");
  const grossProfit = ttm("gross_profit");
  const operatingIncome = ttm("operating_income");
  const da = ttm("depreciation_amortization");
  const ocf = ttm("operating_cash_flow");
  const capex = ttm("capital_expenditure");
  const pretax = ttm("pretax_income");
  const tax = ttm("income_tax_expense");
  const equity = latestValue(v, "total_equity", origins);
  const debt = latestValue(v, "total_debt", origins);
  const cash = latestValue(v, "cash_and_equivalents", origins);

  const mc = input.marketCap;
  const marketCap = mc?.status === "VERIFIED" ? mc.calculated : null;
  const results: RatioResult[] = [];
  const push = (r: Omit<RatioResult, "value" | "status" | "reason"> & Partial<Pick<RatioResult, "value" | "status" | "reason">>) =>
    results.push({ value: null, status: "ok", reason: null, ...r });

  /** Estado común de los ratios que dependen de la capitalización. */
  const marketCapGate = (): Pick<RatioResult, "status" | "reason"> | null => {
    if (!mc || mc.status === "MISSING") return { status: "missing", reason: `Market cap unavailable (${mc?.reason.replaceAll("_", " ") ?? "no price or shares"})` };
    if (mc.status === "UNVERIFIED") return { status: "unverified", reason: `Market cap not verified (${mc.reason.replaceAll("_", " ")})` };
    return null;
  };
  const priceInput = input.price ? [`Price ${input.price.value.toFixed(2)} on ${input.price.date} (split-adjusted close)`] : [];

  // --- Valoración ------------------------------------------------------------------------------------
  push({
    id: "market_cap",
    label: "Market cap",
    group: "valuation",
    unit: "currency",
    formula: "Last close × shares outstanding",
    ...(marketCapGate() ?? { value: marketCap }),
    inputs: priceInput,
  });

  const withMarketCap = (
    id: RatioId,
    label: string,
    formula: string,
    denominator: { value: number; label: string } | null,
    missingLabel: string,
    opts: { nonPositive?: string; notApplicable?: boolean; unit?: RatioUnit; invert?: boolean } = {},
  ) => {
    const base = { id, label, group: "valuation" as const, unit: opts.unit ?? "multiple", formula };
    if (opts.notApplicable) return push({ ...base, status: "not_applicable", reason: "Not meaningful for banks, insurers and brokers", inputs: [] });
    const gate = marketCapGate();
    if (gate) return push({ ...base, ...gate, inputs: [] });
    if (!denominator) return push({ ...base, status: "missing", reason: missingLabel, inputs: [] });
    if (opts.nonPositive && denominator.value <= 0) return push({ ...base, status: "not_meaningful", reason: opts.nonPositive, inputs: [denominator.label] });
    const value = opts.invert ? denominator.value / (marketCap as number) : (marketCap as number) / denominator.value;
    push({ ...base, value, inputs: [...priceInput, denominator.label] });
  };

  withMarketCap("pe", "P/E (TTM)", "Market cap / net income (TTM)", netIncome && { value: netIncome.value, label: `Net income ${fmtPeriod(netIncome)}` }, "Net income TTM unavailable", {
    nonPositive: "Net income is zero or negative",
  });
  withMarketCap("ps", "P/S (TTM)", "Market cap / revenue (TTM)", revenue && { value: revenue.value, label: `Revenue ${fmtPeriod(revenue)}` }, "Revenue TTM unavailable", {
    nonPositive: "Revenue is zero or negative",
  });
  withMarketCap("pb", "P/B", "Market cap / total equity", equity ? { value: equity.value as number, label: `Equity at ${equity.fiscalPeriodEnd}` } : null, "Equity unavailable", {
    nonPositive: "Equity is negative or zero",
  });

  // EV = market cap + deuda − caja.
  const evBase = { id: "enterprise_value" as const, label: "Enterprise value", group: "valuation" as const, unit: "currency" as const, formula: "Market cap + total debt − cash" };
  let ev: number | null = null;
  if (financial) push({ ...evBase, status: "not_applicable", reason: "Debt is operating funding for banks and insurers", inputs: [] });
  else if (marketCapGate()) push({ ...evBase, ...(marketCapGate() as Pick<RatioResult, "status" | "reason">), inputs: [] });
  else if (!debt || !cash) push({ ...evBase, status: "missing", reason: !debt ? "Total debt not reported with standard concepts" : "Cash unavailable", inputs: [] });
  else {
    ev = (marketCap as number) + (debt.value as number) - (cash.value as number);
    push({ ...evBase, value: ev, inputs: [...priceInput, `Debt at ${debt.fiscalPeriodEnd}`, `Cash at ${cash.fiscalPeriodEnd}`] });
  }
  const evResult = results.at(-1) as RatioResult;

  const ebitda = operatingIncome && da ? operatingIncome.value + da.value : null;
  const evEbitdaBase = { id: "ev_ebitda" as const, label: "EV/EBITDA (TTM)", group: "valuation" as const, unit: "multiple" as const, formula: "EV / (operating income + D&A) (TTM)" };
  if (financial) push({ ...evEbitdaBase, status: "not_applicable", reason: "Not meaningful for banks and insurers", inputs: [] });
  else if (ev === null) push({ ...evEbitdaBase, status: evResult.status, reason: `Enterprise value unavailable: ${evResult.reason ?? "missing input"}`, inputs: [] });
  else if (ebitda === null) push({ ...evEbitdaBase, status: "missing", reason: "Operating income or D&A TTM unavailable", inputs: [] });
  else if (ebitda <= 0) push({ ...evEbitdaBase, status: "not_meaningful", reason: "EBITDA is zero or negative", inputs: [] });
  else push({ ...evEbitdaBase, value: ev / ebitda, inputs: [`EBITDA ${fmtPeriod(operatingIncome as TtmValue)}`] });

  const fcf = ocf && capex ? ocf.value - capex.value : null;
  withMarketCap("fcf_yield", "FCF yield (TTM)", "(Operating cash flow − capex) (TTM) / market cap", fcf !== null ? { value: fcf, label: `FCF ${fmtPeriod(ocf as TtmValue)}` } : null, "Operating cash flow or capex TTM unavailable", {
    notApplicable: financial,
    unit: "percent",
    invert: true,
  });

  const dyBase = { id: "dividend_yield" as const, label: "Dividend yield (TTM)", group: "valuation" as const, unit: "percent" as const, formula: "Cash dividends per share with ex-date in the last 12 months / price" };
  if (!input.price) push({ ...dyBase, status: "missing", reason: "No price data synced", inputs: [] });
  else if (input.dividendsTtmPerShare === null) push({ ...dyBase, status: "missing", reason: "No corporate-actions data synced for this security", inputs: [] });
  else {
    const d = typeof input.dividendsTtmPerShare === "number" ? { perShare: input.dividendsTtmPerShare, foreignExcluded: 0, specialExcluded: 0 } : input.dividendsTtmPerShare;
    if (d.foreignExcluded > 0) {
      // El proveedor publica algunos dividendos de emisores extranjeros NETOS de retención (p. ej. NXPI 0.8619 = 1.014 × 85 %).
      push({ ...dyBase, status: "unverified", reason: `${d.foreignExcluded} foreign-issuer dividend(s) in the last 12 months may be reported net of withholding tax; yield not computed`, inputs: [] });
    } else {
      const inputs = [...priceInput, `Dividends ${d.perShare.toFixed(4)} per share (last 365 days)`];
      if (d.specialExcluded > 0) inputs.push(`${d.specialExcluded} special dividend(s) excluded`);
      push({ ...dyBase, value: d.perShare / input.price.value, inputs });
    }
  }

  // --- Rentabilidad ------------------------------------------------------------------------------------
  const margin = (id: RatioId, label: string, numerator: TtmValue | null, numeratorLabel: string, notApplicable = false) => {
    const base = { id, label, group: "profitability" as const, unit: "percent" as const, formula: `${numeratorLabel} / revenue (TTM)` };
    if (notApplicable) return push({ ...base, status: "not_applicable", reason: "Not part of a bank / insurer income statement", inputs: [] });
    if (!numerator || !revenue) return push({ ...base, status: "missing", reason: `${numeratorLabel} or revenue TTM unavailable`, inputs: [] });
    if (revenue.value <= 0) return push({ ...base, status: "not_meaningful", reason: "Revenue is zero or negative", inputs: [] });
    push({ ...base, value: numerator.value / revenue.value, inputs: [`${numeratorLabel} ${fmtPeriod(numerator)}`, `Revenue ${fmtPeriod(revenue)}`] });
  };
  margin("gross_margin", "Gross margin", grossProfit, "Gross profit", financial && !grossProfit);
  margin("operating_margin", "Operating margin", operatingIncome, "Operating income", financial && !operatingIncome);
  margin("net_margin", "Net margin", netIncome, "Net income");
  const fcfTtm: TtmValue | null = fcf !== null && ocf ? { ...ocf, value: fcf } : null;
  margin("fcf_margin", "FCF margin", fcfTtm, "Free cash flow", financial);

  const equityYearAgo = equity ? latestValue(v, "total_equity", origins, new Date(Date.parse(equity.fiscalPeriodEnd) - 330 * 86_400_000).toISOString().slice(0, 10)) : undefined;
  const roeBase = { id: "roe" as const, label: "ROE (TTM)", group: "profitability" as const, unit: "percent" as const, formula: "Net income (TTM) / average equity (now and a year earlier)" };
  if (!netIncome || !equity) push({ ...roeBase, status: "missing", reason: "Net income TTM or equity unavailable", inputs: [] });
  else {
    const avg = equityYearAgo ? ((equity.value as number) + (equityYearAgo.value as number)) / 2 : (equity.value as number);
    if (avg <= 0) push({ ...roeBase, status: "not_meaningful", reason: "Average equity is negative or zero", inputs: [] });
    else push({ ...roeBase, value: netIncome.value / avg, inputs: [`Net income ${fmtPeriod(netIncome)}`, `Equity at ${equity.fiscalPeriodEnd}${equityYearAgo ? ` and ${equityYearAgo.fiscalPeriodEnd}` : ""}`] });
  }

  const roicBase = { id: "roic" as const, label: "ROIC (TTM)", group: "profitability" as const, unit: "percent" as const, formula: "Operating income × (1 − effective tax rate) / (debt + equity − cash)" };
  if (financial) push({ ...roicBase, status: "not_applicable", reason: "Invested capital is not meaningful for banks and insurers", inputs: [] });
  else if (!operatingIncome || !pretax || !tax || !debt || !equity || !cash) {
    push({ ...roicBase, status: "missing", reason: "Operating income, tax, debt, equity or cash unavailable", inputs: [] });
  } else {
    const taxRate = pretax.value > 0 ? Math.min(Math.max(tax.value / pretax.value, 0), 0.5) : null;
    const invested = (debt.value as number) + (equity.value as number) - (cash.value as number);
    if (taxRate === null) push({ ...roicBase, status: "not_meaningful", reason: "Pre-tax income is zero or negative", inputs: [] });
    else if (invested <= 0) push({ ...roicBase, status: "not_meaningful", reason: "Invested capital is negative or zero", inputs: [] });
    else push({ ...roicBase, value: (operatingIncome.value * (1 - taxRate)) / invested, inputs: [`Operating income ${fmtPeriod(operatingIncome)}`, `Tax rate ${(taxRate * 100).toFixed(1)}%`] });
  }

  // --- Crecimiento ---------------------------------------------------------------------------------------
  const growth = (id: RatioId, label: string, item: LineItemCode, now: TtmValue | null) => {
    const base = { id, label, group: "growth" as const, unit: "percent" as const, formula: `${label.replace(" growth (YoY, TTM)", "")} TTM vs TTM a year earlier` };
    const before = ttmYearAgo(v, item, origins, now);
    if (!now || !before) return push({ ...base, status: "missing", reason: "Needs 8 consecutive quarters", inputs: [] });
    if (before.value <= 0) return push({ ...base, status: "not_meaningful", reason: "Base period is zero or negative", inputs: [] });
    push({ ...base, value: now.value / before.value - 1, inputs: [fmtPeriod(now), fmtPeriod(before)] });
  };
  growth("revenue_growth", "Revenue growth (YoY, TTM)", "revenue", revenue);
  growth("net_income_growth", "Net income growth (YoY, TTM)", "net_income", netIncome);

  const epsAnnual = v
    .filter((x) => x.lineItem === "eps_diluted" && x.periodType === "annual" && x.value !== null && origins.includes(x.origin))
    .sort((a, b) => b.fiscalPeriodEnd.localeCompare(a.fiscalPeriodEnd));
  const [epsNow, epsPrev] = epsAnnual;
  const epsBase = { id: "eps_growth" as const, label: "Diluted EPS growth (last FY)", group: "growth" as const, unit: "percent" as const, formula: "Reported diluted EPS, last fiscal year vs the prior one" };
  if (!epsNow || !epsPrev) push({ ...epsBase, status: "missing", reason: "Two annual diluted EPS values are needed", inputs: [] });
  else if ((epsPrev.value as number) <= 0) push({ ...epsBase, status: "not_meaningful", reason: "Prior-year EPS is zero or negative", inputs: [] });
  else push({ ...epsBase, value: (epsNow.value as number) / (epsPrev.value as number) - 1, inputs: [`FY ${epsNow.fiscalYear ?? epsNow.fiscalPeriodEnd}`, `FY ${epsPrev.fiscalYear ?? epsPrev.fiscalPeriodEnd}`] });

  return results;
}
