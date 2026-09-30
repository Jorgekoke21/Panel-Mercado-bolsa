import type { FilingRecord, IssuerFilingProfile } from "@/data/repositories/fundamentals-repository";
import {
  type FinancialStatementValue,
  type FundamentalOrigin,
  type LineItemCode,
  type LineItemCoverage,
  lineItemDefinition,
} from "@/domain/fundamentals";
import type { SecuritySummary } from "@/domain/reference";
import { computeRatios, type RatioResult } from "@/lib/calculations/ratios";
import type { RealMarketData } from "./company-market-data";
import type { Repositories } from "./market-rows";

/**
 * Vistas de fundamentales de una ficha (Financials, Valuation, Earnings) construidas SOLO con datos
 * sincronizados (SEC XBRL) y cálculos de MarketRadar. Cada celda conserva su procedencia.
 */
export const SEC_SOURCE = "sec";
const SEC_ORIGINS: readonly FundamentalOrigin[] = ["reported", "derived"];

// --- Financials ------------------------------------------------------------------------------------------

export type CellState = "value" | "missing" | "not_applicable";

export interface StatementCell {
  state: CellState;
  value: number | null;
  origin: FundamentalOrigin | null;
  /** Líneas de procedencia o motivo (tooltip). */
  notes: string[];
  accessionNumber: string | null;
}

export interface StatementColumn {
  end: string;
  label: string;
  sublabel: string;
}

export interface StatementRow {
  lineItem: LineItemCode | `${"gross" | "operating" | "net"}_margin`;
  label: string;
  unit: "currency" | "per_share" | "shares" | "percent";
  cells: StatementCell[];
}

export interface StatementSection {
  title: string;
  rows: StatementRow[];
}

export interface FinancialsView {
  profile: IssuerFilingProfile;
  view: "annual" | "quarterly";
  columns: StatementColumn[];
  sections: StatementSection[];
  coverage: LineItemCoverage[];
  latestFiling: FilingRecord | null;
  counts: { reported: number; derived: number; calculated: number };
}

const SECTIONS: { title: string; items: LineItemCode[] }[] = [
  {
    title: "Income statement",
    items: ["revenue", "gross_profit", "operating_income", "pretax_income", "income_tax_expense", "net_income", "eps_basic", "eps_diluted", "weighted_average_shares_basic", "weighted_average_shares_diluted", "dividends_per_share"],
  },
  { title: "Balance sheet", items: ["cash_and_equivalents", "total_assets", "total_liabilities", "total_debt", "total_equity", "shares_outstanding"] },
  { title: "Cash flow", items: ["operating_cash_flow", "capital_expenditure", "free_cash_flow", "depreciation_amortization"] },
];

const ORIGIN_NOTE: Record<FundamentalOrigin, string> = {
  reported: "Reported in an SEC filing",
  derived: "Derived by MarketRadar from reported values",
  calculated: "Calculated by MarketRadar",
  provider: "Provider value",
};

function cellFor(value: FinancialStatementValue | undefined, coverage: LineItemCoverage | undefined, isQ4: boolean, unit: string): StatementCell {
  if (value && value.value !== null) {
    const p = value.provenance;
    const notes = [ORIGIN_NOTE[value.origin]];
    if (value.origin === "reported" && p) notes.push(`${p.concept} · ${p.form ?? ""} filed ${p.filedDate ?? "?"} · ${p.accessionNumber ?? ""}`);
    if (value.origin === "derived" && p?.derivation) notes.push(p.derivation);
    if (value.origin === "calculated") notes.push(value.sourceField.replace("marketradar:", "Formula: "));
    if (p?.restated) notes.push("Restated in a later filing (latest value shown)");
    return { state: "value", value: value.value, origin: value.origin, notes, accessionNumber: p?.accessionNumber ?? null };
  }
  if (coverage?.status === "not_applicable") return { state: "not_applicable", value: null, origin: null, notes: [coverage.reason ?? "Not applicable"], accessionNumber: null };
  const reason =
    value?.missingReason === "fourth_quarter_not_reported" || (isQ4 && (unit === "per_share" || unit === "shares"))
      ? "Filings do not report a separate fourth quarter and per-share values cannot be subtracted"
      : value?.missingReason === "provider_missing_weighted_average_shares"
        ? "Weighted-average shares are not reported with standard concepts"
        : coverage && coverage.status !== "available"
          ? (coverage.reason ?? "Not reported")
          : "Not reported for this period";
  return { state: "missing", value: null, origin: null, notes: [reason], accessionNumber: null };
}

export async function getFinancialsView(repos: Repositories, security: SecuritySummary, view: "annual" | "quarterly"): Promise<FinancialsView | null> {
  const profile = await repos.fundamentals.getIssuerProfile(security.companyId);
  if (!profile) return null;
  const [values, coverage, filings] = await Promise.all([
    repos.fundamentals.getStatementValues(security.companyId, SEC_SOURCE),
    repos.fundamentals.getCoverage(security.companyId, SEC_SOURCE),
    repos.fundamentals.getFilings(security.companyId),
  ]);
  const periodType = view === "annual" ? "annual" : "quarterly";
  const inView = values.filter((v) => v.periodType === periodType);
  const ends = [...new Set(inView.filter((v) => v.value !== null && v.origin !== "calculated").map((v) => v.fiscalPeriodEnd))].sort().slice(view === "annual" ? -6 : -8);
  const meta = new Map(inView.map((v) => [v.fiscalPeriodEnd, v]));
  const columns: StatementColumn[] = ends.map((end) => {
    const m = meta.get(end);
    return {
      end,
      label: view === "annual" ? `FY${m?.fiscalYear ?? end.slice(0, 4)}` : `Q${m?.fiscalQuarter ?? "?"} FY${m?.fiscalYear ?? end.slice(0, 4)}`,
      sublabel: end,
    };
  });

  const covByItem = new Map(coverage.map((c) => [c.lineItem, c]));
  const pick = (item: LineItemCode, end: string) => {
    const candidates = inView.filter((v) => v.lineItem === item && v.fiscalPeriodEnd === end);
    return candidates.find((v) => v.origin === "reported" || v.origin === "derived") ?? candidates.find((v) => v.origin === "calculated");
  };
  const quarterOf = (end: string) => meta.get(end)?.fiscalQuarter ?? null;

  const sections: StatementSection[] = SECTIONS.map((s) => ({
    title: s.title,
    rows: s.items.map((item) => {
      const def = lineItemDefinition(item);
      return {
        lineItem: item,
        label: def.label,
        unit: def.unit,
        cells: ends.map((end) => cellFor(pick(item, end), item === "free_cash_flow" ? undefined : covByItem.get(item), view === "quarterly" && quarterOf(end) === 4, def.unit)),
      };
    }),
  }));

  // Márgenes calculados por columna (solo si numerador y revenue existen en esa columna).
  const marginRow = (id: "gross" | "operating" | "net", label: string, item: LineItemCode): StatementRow => ({
    lineItem: `${id}_margin`,
    label,
    unit: "percent",
    cells: ends.map((end) => {
      const num = pick(item, end);
      const rev = pick("revenue", end);
      if (covByItem.get(item)?.status === "not_applicable") return { state: "not_applicable", value: null, origin: null, notes: ["Not applicable for this industry template"], accessionNumber: null };
      if (!num?.value || !rev?.value || rev.value <= 0) return { state: "missing", value: null, origin: null, notes: ["Needs both the numerator and revenue for this period"], accessionNumber: null };
      return { state: "value", value: num.value / rev.value, origin: "calculated", notes: [`Calculated by MarketRadar: ${label.toLowerCase()} = ${lineItemDefinition(item).label} / revenue`], accessionNumber: null };
    }),
  });
  sections.push({
    title: "Margins",
    rows: [marginRow("gross", "Gross margin", "gross_profit"), marginRow("operating", "Operating margin", "operating_income"), marginRow("net", "Net margin", "net_income")],
  });

  return {
    profile,
    view,
    columns,
    sections,
    coverage,
    latestFiling: filings.find((f) => f.form.startsWith("10-")) ?? null,
    counts: {
      reported: values.filter((v) => v.origin === "reported").length,
      derived: values.filter((v) => v.origin === "derived").length,
      calculated: values.filter((v) => v.origin === "calculated").length,
    },
  };
}

// --- Valuation ----------------------------------------------------------------------------------------------

export interface ValuationView {
  profile: IssuerFilingProfile | null;
  ratios: RatioResult[];
  price: { value: number; date: string } | null;
  latestQuarter: string | null;
}

export async function getValuationView(repos: Repositories, security: SecuritySummary, real: RealMarketData | null): Promise<ValuationView> {
  const profile = await repos.fundamentals.getIssuerProfile(security.companyId);
  const statements = profile ? await repos.fundamentals.getStatementValues(security.companyId, SEC_SOURCE) : [];
  const price = real ? { value: real.snapshot.price as number, date: real.provenance.asOf.slice(0, 10) } : null;
  const dividends = price
    ? await repos.fundamentals.getCashDividendsPerShare(
        security.securityId,
        new Date(Date.parse(price.date) - 365 * 86_400_000).toISOString().slice(0, 10),
        price.date,
        real?.provenance.source ?? "",
      )
    : null;
  const ratios = profile
    ? computeRatios({
        template: profile.industryTemplate,
        statements,
        origins: SEC_ORIGINS,
        price,
        marketCap: real?.marketCap ?? null,
        dividendsTtmPerShare: dividends,
      })
    : [];
  const latestQuarter = statements.filter((v) => v.periodType === "quarterly" && v.origin !== "calculated").map((v) => v.fiscalPeriodEnd).sort().at(-1) ?? null;
  return { profile, ratios, price, latestQuarter };
}

// --- Earnings -------------------------------------------------------------------------------------------------

export interface EarningsRow {
  label: string;
  periodEnd: string;
  release: FilingRecord | null;
  revenue: StatementCell;
  netIncome: StatementCell;
  epsDiluted: StatementCell;
  revenueYoY: number | null;
}

export interface EarningsView {
  profile: IssuerFilingProfile;
  rows: EarningsRow[];
}

export async function getEarningsView(repos: Repositories, security: SecuritySummary): Promise<EarningsView | null> {
  const profile = await repos.fundamentals.getIssuerProfile(security.companyId);
  if (!profile) return null;
  const [values, coverage, filings] = await Promise.all([
    repos.fundamentals.getStatementValues(security.companyId, SEC_SOURCE),
    repos.fundamentals.getCoverage(security.companyId, SEC_SOURCE),
    repos.fundamentals.getFilings(security.companyId),
  ]);
  const covByItem = new Map(coverage.map((c) => [c.lineItem, c]));
  const quarterly = values.filter((v) => v.periodType === "quarterly" && (v.origin === "reported" || v.origin === "derived"));
  const allEnds = [...new Set(quarterly.map((v) => v.fiscalPeriodEnd))].sort();
  const ends = allEnds.slice(-12).reverse();
  const releases = filings.filter((f) => f.form.startsWith("8-K") && f.items.includes("2.02"));
  const get = (item: LineItemCode, end: string) => quarterly.find((v) => v.lineItem === item && v.fiscalPeriodEnd === end);

  const rows = ends.map((end): EarningsRow => {
    const m = quarterly.find((v) => v.fiscalPeriodEnd === end);
    // Publicación = 8-K 2.02 presentado entre 0 y 100 días después del cierre (el más cercano).
    const release =
      releases
        .filter((r) => {
          const d = (Date.parse(r.filingDate) - Date.parse(end)) / 86_400_000;
          return d >= 0 && d <= 100;
        })
        .sort((a, b) => a.filingDate.localeCompare(b.filingDate))[0] ?? null;
    const rev = get("revenue", end);
    // Mismo trimestre del año fiscal anterior (~52 semanas antes).
    const prevEnd = allEnds.find((e) => Math.abs((Date.parse(end) - Date.parse(e)) / 86_400_000 - 364) <= 10);
    const prevRev = prevEnd ? get("revenue", prevEnd) : undefined;
    const isQ4 = m?.fiscalQuarter === 4;
    return {
      label: `Q${m?.fiscalQuarter ?? "?"} FY${m?.fiscalYear ?? end.slice(0, 4)}`,
      periodEnd: end,
      release,
      revenue: cellFor(rev, covByItem.get("revenue"), isQ4, "currency"),
      netIncome: cellFor(get("net_income", end), covByItem.get("net_income"), isQ4, "currency"),
      epsDiluted: cellFor(get("eps_diluted", end), covByItem.get("eps_diluted"), isQ4, "per_share"),
      revenueYoY: rev?.value && prevRev?.value && prevRev.value > 0 ? rev.value / prevRev.value - 1 : null,
    };
  });
  return { profile, rows };
}

// --- Technical ------------------------------------------------------------------------------------------------

export interface TechnicalIndicator {
  label: string;
  value: number | null;
  unit: "price" | "index" | "ratio" | "volume";
  definition: string;
}

export function computeTechnicals(real: RealMarketData): TechnicalIndicator[] {
  // Mismo motor que las instantáneas de listas/rankings (computeIndicators): una sola fuente de verdad.
  const s = real.snapshot;
  const atrPct = s.atr14 !== null && s.price ? (s.atr14 / s.price) * 100 : null;
  return [
    { label: "SMA 20", value: s.sma20, unit: "price", definition: "Simple moving average of the last 20 split-adjusted closes." },
    { label: "SMA 50", value: s.sma50, unit: "price", definition: "Simple moving average of the last 50 split-adjusted closes." },
    { label: "SMA 200", value: s.sma200, unit: "price", definition: "Simple moving average of the last 200 split-adjusted closes." },
    { label: "EMA 20", value: s.ema20, unit: "price", definition: "Exponential moving average (α = 2/21), seeded with the SMA." },
    { label: "EMA 50", value: s.ema50, unit: "price", definition: "Exponential moving average (α = 2/51), seeded with the SMA." },
    { label: "EMA 200", value: s.ema200, unit: "price", definition: "Exponential moving average (α = 2/201), seeded with the SMA." },
    { label: "RSI 14", value: s.rsi14, unit: "index", definition: "Wilder's Relative Strength Index over 14 sessions (0–100)." },
    { label: "MACD (12, 26)", value: s.macd, unit: "price", definition: "EMA 12 − EMA 26 of closes." },
    { label: "MACD signal (9)", value: s.macdSignal, unit: "price", definition: "EMA 9 of the MACD line." },
    { label: "MACD histogram", value: s.macdHistogram, unit: "price", definition: "MACD − signal." },
    { label: "ATR 14", value: s.atr14, unit: "price", definition: "Wilder's Average True Range over 14 sessions." },
    { label: "ATR 14 (% of price)", value: atrPct, unit: "index", definition: "ATR 14 divided by the last close, in percent." },
    { label: "Volume", value: s.volume, unit: "volume", definition: "Shares traded in the last session (consolidated SIP, including extended hours)." },
    { label: "Avg volume (20)", value: s.averageVolume20, unit: "volume", definition: "Average volume of the 20 sessions before the last one." },
    { label: "Relative volume", value: s.relativeVolume, unit: "ratio", definition: "Last session volume / average volume of the previous 20 sessions." },
    { label: "Avg dollar volume (20)", value: s.averageDollarVolume20, unit: "volume", definition: "Average of close × volume over the previous 20 sessions (USD)." },
    { label: "52W high", value: s.high52w, unit: "price", definition: "Highest split-adjusted intraday high over the last 12 months." },
    { label: "52W low", value: s.low52w, unit: "price", definition: "Lowest split-adjusted intraday low over the last 12 months." },
  ];
}
