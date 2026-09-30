import type { LineItemCode } from "@/domain/fundamentals";

/**
 * Mapa canónico MarketRadar → concepts XBRL de la SEC (us-gaap / dei).
 *
 * Reglas (ver docs/sec-fundamentals.md):
 *   * `concepts` está ORDENADO por preferencia. Por emisor se elige un concept PRINCIPAL (el primero
 *     con datos recientes) y los demás solo rellenan periodos en los que el principal no existe
 *     (p. ej. AAPL usó SalesRevenueNet hasta 2018 y RevenueFromContract… después). El concept usado
 *     queda registrado en cada valor.
 *   * `derive` son fórmulas sobre OTROS concepts reportados del mismo periodo, solo si no hay valor
 *     reportado (origin = derived).
 *   * `financialTemplate` indica qué ocurre en bancos/aseguradoras/brokers, cuyos estados no tienen
 *     esas partidas (se marcan NOT APPLICABLE, nunca 0).
 *   * Nada de extensiones propias de la empresa: la API companyfacts solo publica taxonomías estándar.
 */

export type SecUnitKind = "USD" | "USD/shares" | "shares";

export interface DerivationRule {
  /** Descripción legible de la fórmula. */
  label: string;
  /** Concepts sumados (+) y restados (−). Todos los `plus` y `minus` deben existir salvo `optional`. */
  plus: readonly string[];
  minus?: readonly string[];
  /** Componentes que pueden faltar (se tratan como no reportados, no como 0). */
  optional?: readonly string[];
  /** Al menos uno de estos debe existir para que la derivación tenga sentido. */
  requireAnyOf?: readonly string[];
}

export interface SecLineItemSpec {
  unit: SecUnitKind;
  concepts: readonly string[];
  derive?: readonly DerivationRule[];
  /** Cambio de signo al normalizar (capex: pagos positivos). */
  sign?: "abs";
  /** En plantilla financiera (bancos/aseguradoras) la partida no aplica si no se reporta. */
  financialTemplate?: "not_applicable";
  /** Concepts preferidos en plantilla financiera (se prueban antes que `concepts`). */
  financialConcepts?: readonly string[];
}

export const SEC_LINE_ITEMS: Record<LineItemCode, SecLineItemSpec | null> = {
  revenue: {
    unit: "USD",
    concepts: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "SalesRevenueServicesNet",
      "RevenuesNetOfInterestExpense",
      "RegulatedAndUnregulatedOperatingRevenue",
    ],
    financialConcepts: ["RevenuesNetOfInterestExpense", "Revenues"],
  },
  gross_profit: {
    unit: "USD",
    concepts: ["GrossProfit"],
    derive: [
      { label: "revenue − cost of revenue", plus: ["@revenue"], minus: ["CostOfRevenue"] },
      { label: "revenue − cost of goods and services sold", plus: ["@revenue"], minus: ["CostOfGoodsAndServicesSold"] },
    ],
    financialTemplate: "not_applicable",
  },
  operating_income: { unit: "USD", concepts: ["OperatingIncomeLoss"], financialTemplate: "not_applicable" },
  net_income: { unit: "USD", concepts: ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"] },
  net_income_to_common: { unit: "USD", concepts: ["NetIncomeLossAvailableToCommonStockholdersBasic"] },
  weighted_average_shares_basic: {
    unit: "shares",
    concepts: ["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
  },
  weighted_average_shares_diluted: {
    unit: "shares",
    concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
  },
  eps_basic: { unit: "USD/shares", concepts: ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"] },
  eps_diluted: { unit: "USD/shares", concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"] },
  pretax_income: {
    unit: "USD",
    concepts: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
    ],
  },
  income_tax_expense: { unit: "USD", concepts: ["IncomeTaxExpenseBenefit"] },
  depreciation_amortization: {
    unit: "USD",
    concepts: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"],
  },
  dividends_per_share: { unit: "USD/shares", concepts: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"] },
  operating_cash_flow: {
    unit: "USD",
    concepts: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  },
  capital_expenditure: {
    unit: "USD",
    concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    sign: "abs",
    financialTemplate: "not_applicable",
  },
  // Calculado por MarketRadar (OCF − capex): no es un concept XBRL.
  free_cash_flow: null,
  cash_and_equivalents: {
    unit: "USD",
    concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
    financialConcepts: ["CashAndDueFromBanks", "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  },
  total_assets: { unit: "USD", concepts: ["Assets"] },
  total_liabilities: {
    unit: "USD",
    concepts: ["Liabilities"],
    derive: [
      {
        label: "liabilities and equity − total equity incl. non-controlling interests",
        plus: ["LiabilitiesAndStockholdersEquity"],
        minus: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
      },
    ],
  },
  total_debt: {
    unit: "USD",
    concepts: ["DebtLongtermAndShorttermCombinedAmount"],
    derive: [
      {
        label: "long-term debt (incl. current) + short-term borrowings + commercial paper",
        plus: ["LongTermDebt", "ShortTermBorrowings", "CommercialPaper"],
        optional: ["ShortTermBorrowings", "CommercialPaper"],
        requireAnyOf: ["LongTermDebt"],
      },
      {
        label: "long-term debt noncurrent + current + short-term borrowings + commercial paper",
        plus: ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"],
        optional: ["LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"],
        requireAnyOf: ["LongTermDebtNoncurrent"],
      },
    ],
    financialTemplate: "not_applicable",
  },
  total_equity: { unit: "USD", concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  shares_outstanding: { unit: "shares", concepts: ["CommonStockSharesOutstanding"] },
};

/** Acciones en circulación de portada (dei). Solo existe sin dimensiones en emisores de clase única. */
export const DEI_SHARES_OUTSTANDING = "dei:EntityCommonStockSharesOutstanding";

/** Plantillas por SIC: los estados financieros de bancos, brokers y aseguradoras no tienen margen bruto, EBIT ni capex. */
export type IndustryTemplate = "general" | "financial" | "reit";

export function industryTemplate(sic: string | number | null | undefined): IndustryTemplate {
  const code = Number(sic);
  if (!Number.isFinite(code)) return "general";
  if (code === 6798) return "reit";
  if (code >= 6000 && code <= 6799) return "financial";
  return "general";
}

/**
 * Concepts usados SOLO para validar el balance (activo = pasivo + patrimonio + patrimonio temporal).
 * El patrimonio temporal (minoritarios rescatables, preferentes convertibles) no es pasivo ni patrimonio.
 */
export const BALANCE_CHECK_CONCEPTS = {
  equityIncludingNci: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  minorityInterest: "MinorityInterest",
  temporaryEquity: [
    "TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests",
    "TemporaryEquityCarryingAmountAttributableToParent",
    "RedeemableNoncontrollingInterestEquityCarryingAmount",
    "RedeemableNoncontrollingInterestEquityCommonCarryingAmount",
  ],
} as const;

/** Todos los concepts que el motor necesita leer (partidas + componentes de derivaciones + validación). */
export function requiredConcepts(): Set<string> {
  const out = new Set<string>([BALANCE_CHECK_CONCEPTS.equityIncludingNci, BALANCE_CHECK_CONCEPTS.minorityInterest, ...BALANCE_CHECK_CONCEPTS.temporaryEquity]);
  for (const spec of Object.values(SEC_LINE_ITEMS)) {
    if (!spec) continue;
    for (const c of [...spec.concepts, ...(spec.financialConcepts ?? [])]) out.add(c);
    for (const d of spec.derive ?? []) for (const c of [...d.plus, ...(d.minus ?? [])]) if (!c.startsWith("@")) out.add(c);
  }
  return out;
}
