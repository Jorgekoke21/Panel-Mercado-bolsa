/**
 * Fundamentales canónicos: taxonomía propia de partidas (line items), no el JSON del proveedor.
 *
 * El catálogo se replica en la tabla `canonical_line_items` (migraciones 0007–0009); un test verifica
 * que ambos coinciden. Cada adaptador traduce los campos de su proveedor a estos códigos y
 * guarda qué campo de origen usó (`sourceField`) para poder auditar el mapeo.
 */

export type FinancialStatementKind = "income" | "balance" | "cash_flow";
export type LineItemUnit = "currency" | "per_share" | "shares";
/** duration = flujo del periodo (se suma en TTM) · instant = foto a fecha de cierre (TTM = último). */
export type LineItemNature = "duration" | "instant";

export interface LineItemDefinition {
  code: string;
  statement: FinancialStatementKind;
  label: string;
  unit: LineItemUnit;
  nature: LineItemNature;
  description: string;
}

export const CANONICAL_LINE_ITEMS = [
  { code: "revenue", statement: "income", label: "Revenue", unit: "currency", nature: "duration", description: "Total revenue (net sales)." },
  { code: "gross_profit", statement: "income", label: "Gross profit", unit: "currency", nature: "duration", description: "Revenue minus cost of revenue." },
  { code: "operating_income", statement: "income", label: "Operating income", unit: "currency", nature: "duration", description: "Income from operations (EBIT as reported by the provider when equal)." },
  { code: "net_income", statement: "income", label: "Net income", unit: "currency", nature: "duration", description: "Net income attributable to the company." },
  { code: "net_income_to_common", statement: "income", label: "Net income to common", unit: "currency", nature: "duration", description: "Net income attributable to common shareholders." },
  { code: "weighted_average_shares_basic", statement: "income", label: "Weighted avg. shares (basic)", unit: "shares", nature: "duration", description: "Weighted-average basic shares outstanding during the period." },
  { code: "weighted_average_shares_diluted", statement: "income", label: "Weighted avg. shares (diluted)", unit: "shares", nature: "duration", description: "Weighted-average diluted shares outstanding during the period." },
  { code: "eps_basic", statement: "income", label: "EPS (basic)", unit: "per_share", nature: "duration", description: "Basic EPS as reported in filings (SEC), or calculated by MarketRadar as net income to common / weighted-average basic shares. Never derived from period-end shares." },
  { code: "eps_diluted", statement: "income", label: "EPS (diluted)", unit: "per_share", nature: "duration", description: "Diluted EPS as reported in filings (SEC), or calculated by MarketRadar as net income to common / weighted-average diluted shares. Never derived from period-end shares." },
  { code: "pretax_income", statement: "income", label: "Pre-tax income", unit: "currency", nature: "duration", description: "Income from continuing operations before income taxes." },
  { code: "income_tax_expense", statement: "income", label: "Income tax expense", unit: "currency", nature: "duration", description: "Income tax expense (benefit)." },
  { code: "depreciation_amortization", statement: "cash_flow", label: "Depreciation & amortization", unit: "currency", nature: "duration", description: "Depreciation, depletion and amortization (cash-flow statement add-back)." },
  { code: "dividends_per_share", statement: "income", label: "Dividends declared per share", unit: "per_share", nature: "duration", description: "Common stock dividends declared per share in the period." },
  { code: "operating_cash_flow", statement: "cash_flow", label: "Operating cash flow", unit: "currency", nature: "duration", description: "Net cash from operating activities." },
  { code: "capital_expenditure", statement: "cash_flow", label: "Capital expenditure", unit: "currency", nature: "duration", description: "Capital expenditure as a POSITIVE amount spent (sign normalised by the adapter)." },
  { code: "free_cash_flow", statement: "cash_flow", label: "Free cash flow", unit: "currency", nature: "duration", description: "Free cash flow. Provider value and MarketRadar calculation (operating cash flow − capex) are stored separately (value_origin)." },
  { code: "cash_and_equivalents", statement: "balance", label: "Cash & equivalents", unit: "currency", nature: "instant", description: "Cash and cash equivalents at period end." },
  { code: "total_assets", statement: "balance", label: "Total assets", unit: "currency", nature: "instant", description: "Total assets at period end." },
  { code: "total_liabilities", statement: "balance", label: "Total liabilities", unit: "currency", nature: "instant", description: "Total liabilities at period end (reported, or derived as liabilities-and-equity minus total equity including non-controlling interests)." },
  { code: "total_debt", statement: "balance", label: "Total debt", unit: "currency", nature: "instant", description: "Short-term borrowings plus long-term debt (including current portion) at period end; excludes operating lease liabilities. Components are recorded when derived." },
  { code: "total_equity", statement: "balance", label: "Total equity", unit: "currency", nature: "instant", description: "Total stockholders' equity at period end." },
  { code: "shares_outstanding", statement: "balance", label: "Shares outstanding", unit: "shares", nature: "instant", description: "Common shares outstanding at period end as reported in the balance sheet." },
] as const satisfies readonly LineItemDefinition[];

export type LineItemCode = (typeof CANONICAL_LINE_ITEMS)[number]["code"];

export const LINE_ITEM_CODES: readonly LineItemCode[] = CANONICAL_LINE_ITEMS.map((i) => i.code);

export function lineItemDefinition(code: LineItemCode): LineItemDefinition {
  const def = CANONICAL_LINE_ITEMS.find((i) => i.code === code);
  if (!def) throw new Error(`Unknown line item: ${code}`);
  return def;
}

/** Periodos almacenados. TTM es DERIVADO (se calcula, no se guarda). */
export type StoredPeriodType = "annual" | "quarterly";
export type FinancialPeriodType = StoredPeriodType | "ttm";

/**
 * Origen de un valor fundamental:
 *   * reported   — tal como figura en un filing oficial (SEC XBRL), con concept y accession.
 *   * derived    — aritmética directa sobre valores reportados del mismo emisor (p. ej. Q4 = FY − 9M,
 *                  trimestre = YTD − YTD anterior); la fórmula y sus filings quedan registrados.
 *   * calculated — fórmula analítica de MarketRadar (FCF = OCF − capex, EPS = NI / acciones medias).
 *   * provider   — valor publicado por un proveedor comercial (EODHD), con su metodología.
 */
export type FundamentalOrigin = "reported" | "derived" | "calculated" | "provider";

/** Trazabilidad hasta el filing (SEC). */
export interface FilingProvenance {
  /** taxonomy:concept, o la fórmula si el valor es derivado. */
  concept: string;
  accessionNumber: string | null;
  form: string | null;
  filedDate: string | null;
  /** El valor fue reexpresado en un filing posterior (se usa el último). */
  restated: boolean;
  /** Fórmula y componentes cuando origin = derived. */
  derivation: string | null;
}

/** Motivos por los que un valor calculado queda NULL (nunca se sustituye en silencio). */
export const CALCULATION_MISSING_REASONS = [
  "provider_missing_weighted_average_shares",
  "provider_missing_net_income_to_common",
  "incompatible_components",
  "fourth_quarter_not_reported",
] as const;
export type CalculationMissingReason = (typeof CALCULATION_MISSING_REASONS)[number];

export interface FinancialStatementValue {
  lineItem: LineItemCode;
  periodType: StoredPeriodType;
  /** Fecha de cierre fiscal del periodo (YYYY-MM-DD). */
  fiscalPeriodEnd: string;
  /** Fecha de presentación (filing) si el proveedor la da. */
  filingDate: string | null;
  currency: string | null;
  origin: FundamentalOrigin;
  /** null solo para valores calculados imposibles, con `missingReason`. */
  value: number | null;
  missingReason: CalculationMissingReason | null;
  /** Campo del proveedor (provider), concept XBRL (reported) o fórmula (derived / calculated). */
  sourceField: string;
  /** Inicio del periodo (duration) si se conoce. */
  periodStart?: string | null;
  /** Año fiscal según el emisor (DocumentFiscalYearFocus del filing original). */
  fiscalYear?: number | null;
  /** 1–4 para trimestres; null en anual. */
  fiscalQuarter?: number | null;
  provenance?: FilingProvenance | null;
}

/** Estado de cobertura de una partida para un emisor (explica MISSING / N/A en la UI). */
export type LineItemCoverageStatus = "available" | "missing" | "not_applicable" | "discontinued";

export interface LineItemCoverage {
  lineItem: LineItemCode;
  status: LineItemCoverageStatus;
  /** Motivo legible (en inglés, se muestra en la UI). */
  reason: string | null;
  /** Concept(s) usados. */
  concepts: string[];
  annualPeriods: number;
  quarterlyPeriods: number;
  latestPeriodEnd: string | null;
}

/** Punto de acciones en circulación. */
export interface SharesOutstandingPoint {
  asOfDate: string;
  shares: number;
  /**
   * period_end: cifra reportada a cierre de periodo fiscal.
   * current: foto "actual" del proveedor (fechada con la actualización del proveedor).
   * cover_page: dei:EntityCommonStockSharesOutstanding de la portada de un filing SEC.
   */
  basis: "period_end" | "current" | "cover_page";
  sourceField: string;
}
