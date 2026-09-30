import type { FinancialStatementValue, LineItemCode, LineItemCoverage } from "@/domain/fundamentals";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";

/**
 * Fundamentales ya sincronizados (SEC XBRL, u otro proveedor) leídos de NUESTRA base de datos.
 * La UI nunca llama a la SEC: el job escribe y este repositorio lee.
 */
export interface IssuerFilingProfile {
  source: string;
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  industryTemplate: "general" | "financial" | "reit";
  fiscalYearEnd: string | null;
  ingestedAt: string;
}

export interface FilingRecord {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  acceptedAt: string | null;
  items: string[];
  releaseTiming: "before_market" | "during_market" | "after_market" | null;
}

export interface FundamentalsRepository {
  /** null ⇒ el emisor no tiene fundamentales sincronizados. */
  getIssuerProfile(companyId: string): Promise<IssuerFilingProfile | null>;
  /** Valores de una fuente (p. ej. "sec"), todos los periodos guardados. */
  getStatementValues(companyId: string, source: string): Promise<FinancialStatementValue[]>;
  getCoverage(companyId: string, source: string): Promise<LineItemCoverage[]>;
  /** Último valor reportado/derivado de una partida en un tipo de periodo. */
  getLatestValue(companyId: string, source: string, lineItem: LineItemCode, periodType: "annual" | "quarterly"): Promise<FinancialStatementValue | null>;
  /** Filings del emisor (10-K/10-Q y publicaciones de resultados), más recientes primero. */
  getFilings(companyId: string): Promise<FilingRecord[]>;
  /**
   * Dividendos en efectivo por acción con fecha ex en [from, to]; null si no hay acciones corporativas
   * sincronizadas. Informa aparte de los dividendos que no se suman (extraordinarios; de emisor extranjero,
   * cuyo importe el proveedor puede publicar neto de retención).
   */
  /** Snapshots materializados (métricas sin precio) de varios emisores. */
  listFundamentalSnapshots(companyIds: readonly string[]): Promise<Map<string, FundamentalSnapshot>>;
  getCashDividendsPerShare(securityId: string, from: string, to: string, source: string): Promise<DividendsTtm | null>;
}

export interface DividendsTtm {
  perShare: number;
  /** Dividendos de emisor extranjero en la ventana (importe posiblemente neto de retención): no se suman. */
  foreignExcluded: number;
  /** Dividendos extraordinarios en la ventana: excluidos del yield regular. */
  specialExcluded: number;
}
