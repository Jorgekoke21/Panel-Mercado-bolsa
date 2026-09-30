import type { CashDividendAction, CorporateAction, SplitAction, UnsupportedAction } from "@/domain/corporate-actions";
import type { EarningsEstimate, EarningsEvent, ReportTiming } from "@/domain/earnings";
import type { FinancialStatementValue, LineItemCode, SharesOutstandingPoint, StoredPeriodType } from "@/domain/fundamentals";
import type { DailyBar } from "@/domain/prices";
import type { ValuationMetric, ValuationValue } from "@/domain/valuation";
import type { ProviderProfile } from "../ports";
import type { DividendRaw, EodBarRaw, FundamentalsRaw, SplitRaw, StatementPeriodRaw } from "./schemas";

/**
 * Traducción PURA respuesta EODHD → dominio canónico de MarketRadar.
 * Sin I/O: se prueba con fixtures. Ninguna función inventa valores: si un campo falta o no es
 * numérico, el resultado es null (o el elemento se rechaza con un motivo explícito).
 */

/** number | "123.45" → number; null/""/NaN → null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const toText = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

// --- Precios -------------------------------------------------------------------------------

export interface MappedBars {
  bars: DailyBar[];
  /** Barras rechazadas o sospechosas (se registran en sync_runs; nunca se ocultan). */
  issues: string[];
}

export function mapEodBars(raw: readonly EodBarRaw[]): MappedBars {
  const bars: DailyBar[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const { open, high, low, close } = r;
    if (open === null || high === null || low === null || close === null) {
      issues.push(`${r.date}: rejected, missing OHLC value`);
      continue;
    }
    if (!(open > 0 && high > 0 && low > 0 && close > 0)) {
      issues.push(`${r.date}: rejected, non-positive price`);
      continue;
    }
    if (low > high) {
      issues.push(`${r.date}: rejected, low ${low} > high ${high}`);
      continue;
    }
    if (seen.has(r.date)) {
      issues.push(`${r.date}: rejected, duplicated date`);
      continue;
    }
    if (open < low || open > high || close < low || close > high) {
      issues.push(`${r.date}: kept, open/close outside the high-low range`);
    }
    const volume = r.volume ?? null;
    if (volume !== null && volume < 0) issues.push(`${r.date}: negative volume replaced by null`);
    seen.add(r.date);
    bars.push({
      tradeDate: r.date,
      open,
      high,
      low,
      close,
      volume: volume !== null && volume >= 0 ? volume : null,
      providerAdjustedClose: r.adjusted_close ?? null,
    });
  }
  bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return { bars, issues };
}

// --- Acciones corporativas -------------------------------------------------------------------

const SPLIT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)\s*$/;

/** "4.000000/1.000000" → 4 acciones nuevas por 1 antigua. */
export function parseSplitRatio(text: string): { toShares: number; fromShares: number } | null {
  const match = SPLIT_PATTERN.exec(text);
  if (!match) return null;
  const toShares = Number(match[1]);
  const fromShares = Number(match[2]);
  if (!(toShares > 0 && fromShares > 0)) return null;
  return { toShares, fromShares };
}

export function mapSplits(raw: readonly SplitRaw[]): { actions: SplitAction[]; issues: string[] } {
  const actions: SplitAction[] = [];
  const issues: string[] = [];
  for (const r of raw) {
    const ratio = parseSplitRatio(r.split);
    if (!ratio) {
      issues.push(`${r.date}: unparseable split ratio "${r.split}"`);
      continue;
    }
    if (ratio.toShares === ratio.fromShares) {
      issues.push(`${r.date}: split ratio 1:1 ignored`);
      continue;
    }
    actions.push({ kind: "split", exDate: r.date, ...ratio });
  }
  return { actions, issues };
}

/** Periodicidades que tratamos como dividendo ordinario en efectivo. null = el proveedor no la declara. */
const REGULAR_DIVIDEND_PERIODS = new Set(["quarterly", "semi-annual", "semiannual", "annual", "monthly", "interim", "final"]);

export function mapDividend(r: DividendRaw, expectedCurrency: string): CorporateAction {
  const amount = toNumber(r.unadjustedValue);
  const currency = toText(r.currency)?.toUpperCase() ?? null;
  const period = toText(r.period);
  const unsupported = (type: UnsupportedAction["type"], reason: string): UnsupportedAction => ({
    kind: "unsupported",
    type,
    exDate: r.date,
    reason,
    amount,
    currency,
    providerLabel: period,
  });

  if (period && /special|extra|bonus/i.test(period)) return unsupported("special_dividend", `Special dividend (period "${period}")`);
  if (period && !REGULAR_DIVIDEND_PERIODS.has(period.toLowerCase())) return unsupported("other", `Unknown dividend period "${period}"`);
  if (amount === null || amount <= 0) return unsupported("other", "Provider did not supply a positive unadjusted amount");
  if (currency && currency !== expectedCurrency)
    return unsupported("other", `Dividend currency ${currency} differs from trading currency ${expectedCurrency}`);

  const dividend: CashDividendAction = {
    kind: "cash_dividend",
    exDate: r.date,
    amount,
    currency: currency ?? expectedCurrency,
    providerAdjustedAmount: toNumber(r.value),
    declarationDate: r.declarationDate ?? null,
    recordDate: r.recordDate ?? null,
    paymentDate: r.paymentDate ?? null,
    frequency: period,
  };
  return dividend;
}

// --- Perfil ------------------------------------------------------------------------------------

export function mapProfile(raw: FundamentalsRaw): ProviderProfile {
  const g = raw.General;
  const employees = toNumber(g.FullTimeEmployees);
  return {
    providerCode: g.Code,
    name: toText(g.Name),
    exchange: toText(g.Exchange),
    currency: toText(g.CurrencyCode),
    countryIso: toText(g.CountryISO),
    isin: toText(g.ISIN),
    cik: toText(g.CIK),
    lei: toText(g.LEI),
    cusip: toText(g.CUSIP),
    figi: toText(g.OpenFigi),
    website: toText(g.WebURL),
    description: toText(g.Description),
    employees: employees !== null && employees >= 0 ? Math.round(employees) : null,
    logoUrl: toText(g.LogoURL),
    ipoDate: toText(g.IPODate),
    fiscalYearEnd: toText(g.FiscalYearEnd),
    isDelisted: g.IsDelisted ?? null,
    updatedAt: toText(g.UpdatedAt),
  };
}

// --- Estados financieros -----------------------------------------------------------------------

type StatementKey = "Income_Statement" | "Balance_Sheet" | "Cash_Flow";

interface LineItemMapping {
  statement: StatementKey;
  /** Campos EODHD por orden de preferencia (se registra el usado en `sourceField`). */
  fields: readonly string[];
  /** Normalización de signo (capex se guarda como importe positivo gastado). */
  sign?: "positive_outflow";
}

/**
 * Mapeo canónico → EODHD. Las partidas con `fields: []` NO existen en EODHD como dato del proveedor
 * (EPS por periodo y acciones medias ponderadas; ver informe de 2B.1).
 */
export const EODHD_LINE_ITEM_MAP: Record<LineItemCode, LineItemMapping> = {
  revenue: { statement: "Income_Statement", fields: ["totalRevenue"] },
  gross_profit: { statement: "Income_Statement", fields: ["grossProfit"] },
  operating_income: { statement: "Income_Statement", fields: ["operatingIncome"] },
  net_income: { statement: "Income_Statement", fields: ["netIncome"] },
  net_income_to_common: { statement: "Income_Statement", fields: ["netIncomeApplicableToCommonShares"] },
  // EODHD no publica acciones medias ponderadas ⇒ el EPS calculado queda NULL con motivo.
  weighted_average_shares_basic: { statement: "Income_Statement", fields: [] },
  weighted_average_shares_diluted: { statement: "Income_Statement", fields: [] },
  // EPS por periodo: EODHD no lo publica en los estados; lo calcula MarketRadar (derived-financials).
  eps_basic: { statement: "Income_Statement", fields: [] },
  eps_diluted: { statement: "Income_Statement", fields: [] },
  operating_cash_flow: { statement: "Cash_Flow", fields: ["totalCashFromOperatingActivities"] },
  capital_expenditure: { statement: "Cash_Flow", fields: ["capitalExpenditures"], sign: "positive_outflow" },
  free_cash_flow: { statement: "Cash_Flow", fields: ["freeCashFlow"] },
  cash_and_equivalents: { statement: "Balance_Sheet", fields: ["cashAndEquivalents", "cash"] },
  total_assets: { statement: "Balance_Sheet", fields: ["totalAssets"] },
  total_liabilities: { statement: "Balance_Sheet", fields: ["totalLiab"] },
  pretax_income: { statement: "Income_Statement", fields: ["incomeBeforeTax"] },
  income_tax_expense: { statement: "Income_Statement", fields: ["incomeTaxExpense"] },
  depreciation_amortization: { statement: "Cash_Flow", fields: ["depreciation"] },
  dividends_per_share: { statement: "Income_Statement", fields: [] },
  total_debt: { statement: "Balance_Sheet", fields: ["shortLongTermDebtTotal"] },
  total_equity: { statement: "Balance_Sheet", fields: ["totalStockholderEquity"] },
  shares_outstanding: { statement: "Balance_Sheet", fields: ["commonStockSharesOutstanding"] },
};

const PERIOD_SOURCES: readonly { key: "quarterly" | "yearly"; periodType: StoredPeriodType }[] = [
  { key: "quarterly", periodType: "quarterly" },
  { key: "yearly", periodType: "annual" },
];

export function mapStatements(raw: FundamentalsRaw): { values: FinancialStatementValue[]; warnings: string[] } {
  const values: FinancialStatementValue[] = [];
  const warnings: string[] = [];
  const financials = raw.Financials;
  if (!financials) return { values, warnings: ["Financials section missing"] };

  for (const [code, mapping] of Object.entries(EODHD_LINE_ITEM_MAP) as [LineItemCode, LineItemMapping][]) {
    if (mapping.fields.length === 0) continue;
    const statement = financials[mapping.statement];
    for (const { key, periodType } of PERIOD_SOURCES) {
      for (const period of Object.values(statement?.[key] ?? {}) as StatementPeriodRaw[]) {
        const field = mapping.fields.find((f) => toNumber(period[f]) !== null);
        if (!field) continue;
        let value = toNumber(period[field]) as number;
        if (mapping.sign === "positive_outflow") value = Math.abs(value);
        values.push({
          lineItem: code,
          periodType,
          fiscalPeriodEnd: period.date,
          filingDate: period.filing_date ?? null,
          currency: toText(period.currency_symbol) ?? toText(statement?.currency_symbol),
          origin: "provider",
          value,
          missingReason: null,
          sourceField: `${mapping.statement}.${key}.${field}`,
        });
      }
    }
  }
  return { values, warnings };
}

export function mapShares(raw: FundamentalsRaw): SharesOutstandingPoint[] {
  const points: SharesOutstandingPoint[] = [];
  // Solo trimestral: el bloque `annual` de EODHD fecha el año en curso a 31-dic (fecha futura).
  for (const q of Object.values(raw.outstandingShares?.quarterly ?? {})) {
    const shares = toNumber(q.shares);
    if (!q.dateFormatted || shares === null || shares <= 0) continue;
    points.push({ asOfDate: q.dateFormatted, shares: Math.round(shares), basis: "period_end", sourceField: "outstandingShares.quarterly" });
  }
  const current = toNumber(raw.SharesStats?.SharesOutstanding);
  const asOf = raw.General.UpdatedAt?.slice(0, 10);
  if (current !== null && current > 0 && asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    points.push({ asOfDate: asOf, shares: Math.round(current), basis: "current", sourceField: "SharesStats.SharesOutstanding" });
  }
  return points.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

// --- Earnings ------------------------------------------------------------------------------------

const TIMING: Record<string, ReportTiming> = {
  beforemarket: "before_market",
  aftermarket: "after_market",
  duringmarket: "during_market",
};

export function mapEarningsEvents(raw: FundamentalsRaw): EarningsEvent[] {
  return Object.values(raw.Earnings?.History ?? {})
    .map((h): EarningsEvent => {
      const providerEpsActual = toNumber(h.epsActual);
      const providerEpsEstimate = toNumber(h.epsEstimate);
      // EODHD devuelve epsDifference = 0 cuando falta actual o estimate: eso NO es una sorpresa real.
      const hasBoth = providerEpsActual !== null && providerEpsEstimate !== null;
      const timingKey = toText(h.beforeAfterMarket)?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      return {
        fiscalPeriodEnd: h.date,
        reportDate: h.reportDate ?? null,
        timing: TIMING[timingKey] ?? null,
        providerEpsActual,
        providerEpsEstimate,
        providerEpsSurprise: hasBoth ? toNumber(h.epsDifference) : null,
        providerEpsSurprisePercent: hasBoth ? toNumber(h.surprisePercent) : null,
        // EODHD no documenta si su EPS de earnings es GAAP o ajustado.
        epsBasis: "unspecified",
        currency: toText(h.currency),
      };
    })
    .sort((a, b) => a.fiscalPeriodEnd.localeCompare(b.fiscalPeriodEnd));
}

const ESTIMATE_PERIOD = /^[+-]?\d+[qy]$/;

export function mapEarningsEstimates(raw: FundamentalsRaw): EarningsEstimate[] {
  const count = (v: unknown) => {
    const n = toNumber(v);
    return n === null ? null : Math.round(n);
  };
  return Object.values(raw.Earnings?.Trend ?? {})
    .filter((t) => typeof t.period === "string" && ESTIMATE_PERIOD.test(t.period))
    .map((t) => ({
      periodCode: t.period as string,
      periodEnd: t.date,
      epsAvg: toNumber(t.earningsEstimateAvg),
      epsLow: toNumber(t.earningsEstimateLow),
      epsHigh: toNumber(t.earningsEstimateHigh),
      epsYearAgo: toNumber(t.earningsEstimateYearAgoEps),
      epsAnalysts: count(t.earningsEstimateNumberOfAnalysts),
      revenueAvg: toNumber(t.revenueEstimateAvg),
      revenueLow: toNumber(t.revenueEstimateLow),
      revenueHigh: toNumber(t.revenueEstimateHigh),
      revenueAnalysts: count(t.revenueEstimateNumberOfAnalysts),
    }))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

// --- Valoración ----------------------------------------------------------------------------------

interface ValuationMapping {
  metric: ValuationMetric;
  section: "Highlights" | "Valuation";
  field: string;
  /** EODHD usa 0 como "sin dato" en ratios (p. ej. P/E de empresas con pérdidas). */
  zeroMeansMissing: boolean;
}

export const EODHD_VALUATION_MAP: readonly ValuationMapping[] = [
  { metric: "market_cap", section: "Highlights", field: "MarketCapitalization", zeroMeansMissing: true },
  { metric: "enterprise_value", section: "Valuation", field: "EnterpriseValue", zeroMeansMissing: true },
  { metric: "pe_ttm", section: "Valuation", field: "TrailingPE", zeroMeansMissing: true },
  { metric: "pe_forward", section: "Valuation", field: "ForwardPE", zeroMeansMissing: true },
  { metric: "peg", section: "Highlights", field: "PEGRatio", zeroMeansMissing: true },
  { metric: "ps_ttm", section: "Valuation", field: "PriceSalesTTM", zeroMeansMissing: true },
  { metric: "pb_mrq", section: "Valuation", field: "PriceBookMRQ", zeroMeansMissing: true },
  { metric: "ev_revenue", section: "Valuation", field: "EnterpriseValueRevenue", zeroMeansMissing: true },
  { metric: "ev_ebitda", section: "Valuation", field: "EnterpriseValueEbitda", zeroMeansMissing: true },
  // Un 0 es real para empresas que no pagan dividendo.
  { metric: "dividend_yield", section: "Highlights", field: "DividendYield", zeroMeansMissing: false },
];

export function mapValuation(raw: FundamentalsRaw): ValuationValue[] {
  const values: ValuationValue[] = [];
  for (const m of EODHD_VALUATION_MAP) {
    const value = toNumber(raw[m.section]?.[m.field]);
    if (value === null || (m.zeroMeansMissing && value === 0)) continue;
    values.push({ metric: m.metric, value, origin: "provider", method: `${m.section}.${m.field}` });
  }
  return values;
}

/** Fecha (YYYY-MM-DD) de la última actualización de fundamentales según EODHD. */
export function fundamentalsAsOf(raw: FundamentalsRaw): string | null {
  const updated = raw.General.UpdatedAt?.slice(0, 10) ?? null;
  return updated && /^\d{4}-\d{2}-\d{2}$/.test(updated) ? updated : null;
}
