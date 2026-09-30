import "server-only";
import { DataAccessError } from "@/data/errors";
import type { DividendsTtm, FilingRecord, FundamentalsRepository, IssuerFilingProfile } from "@/data/repositories/fundamentals-repository";
import type { CalculationMissingReason, FinancialStatementValue, FundamentalOrigin, LineItemCode, LineItemCoverage } from "@/domain/fundamentals";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";
import { num, numOrNull } from "./market-mappers";
import type { MarketRadarSupabase } from "./server-client";

const PAGE = 1000; // max_rows de PostgREST

function fail(operation: string, error: { message: string }): never {
  throw new DataAccessError(`Database query failed (${operation})`, operation, { cause: error });
}

/** Lectura de fundamentales sincronizados (clave anon + RLS de solo lectura). */
export class SupabaseFundamentalsRepository implements FundamentalsRepository {
  constructor(private readonly db: MarketRadarSupabase) {}

  async getIssuerProfile(companyId: string): Promise<IssuerFilingProfile | null> {
    const { data, error } = await this.db.from("sec_entities").select("*").eq("company_id", companyId).maybeSingle();
    if (error) fail("getIssuerProfile", error);
    return data
      ? {
          source: "sec",
          cik: data.cik,
          name: data.name,
          sic: data.sic,
          sicDescription: data.sic_description,
          industryTemplate: data.industry_template as IssuerFilingProfile["industryTemplate"],
          fiscalYearEnd: data.fiscal_year_end,
          ingestedAt: data.ingested_at,
        }
      : null;
  }

  async getStatementValues(companyId: string, source: string): Promise<FinancialStatementValue[]> {
    const out: FinancialStatementValue[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from("financial_statement_values")
        .select(
          "line_item_code, period_type, fiscal_period_end, period_start, fiscal_year, fiscal_quarter, filing_date, currency, value, value_origin, missing_reason, source_field, accession_number, form, restated, derivation",
        )
        .eq("company_id", companyId)
        .eq("source", source)
        .order("fiscal_period_end")
        .order("line_item_code")
        .order("period_type")
        .order("value_origin")
        .range(from, from + PAGE - 1);
      if (error) fail("getStatementValues", error);
      for (const r of data) {
        out.push({
          lineItem: r.line_item_code as LineItemCode,
          periodType: r.period_type as FinancialStatementValue["periodType"],
          fiscalPeriodEnd: r.fiscal_period_end,
          periodStart: r.period_start,
          fiscalYear: r.fiscal_year,
          fiscalQuarter: r.fiscal_quarter,
          filingDate: r.filing_date,
          currency: r.currency,
          origin: r.value_origin as FundamentalOrigin,
          value: numOrNull(r.value),
          missingReason: r.missing_reason as CalculationMissingReason | null,
          sourceField: r.source_field,
          provenance: {
            concept: r.source_field,
            accessionNumber: r.accession_number,
            form: r.form,
            filedDate: r.filing_date,
            restated: r.restated,
            derivation: r.derivation,
          },
        });
      }
      if (data.length < PAGE) break;
    }
    return out;
  }

  async getLatestValue(companyId: string, source: string, lineItem: LineItemCode, periodType: "annual" | "quarterly"): Promise<FinancialStatementValue | null> {
    const { data, error } = await this.db
      .from("financial_statement_values")
      .select("fiscal_period_end, fiscal_year, fiscal_quarter, filing_date, value, value_origin, source_field, accession_number, form")
      .eq("company_id", companyId)
      .eq("source", source)
      .eq("line_item_code", lineItem)
      .eq("period_type", periodType)
      .in("value_origin", ["reported", "derived"])
      .not("value", "is", null)
      .order("fiscal_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("getLatestValue", error);
    if (!data) return null;
    return {
      lineItem,
      periodType,
      fiscalPeriodEnd: data.fiscal_period_end,
      fiscalYear: data.fiscal_year,
      fiscalQuarter: data.fiscal_quarter,
      filingDate: data.filing_date,
      currency: null,
      origin: data.value_origin as FundamentalOrigin,
      value: numOrNull(data.value),
      missingReason: null,
      sourceField: data.source_field,
      provenance: { concept: data.source_field, accessionNumber: data.accession_number, form: data.form, filedDate: data.filing_date, restated: false, derivation: null },
    };
  }

  async getCoverage(companyId: string, source: string): Promise<LineItemCoverage[]> {
    const { data, error } = await this.db.from("fundamental_coverage").select("*").eq("company_id", companyId).eq("source", source);
    if (error) fail("getCoverage", error);
    return data.map((r) => ({
      lineItem: r.line_item_code as LineItemCode,
      status: r.status as LineItemCoverage["status"],
      reason: r.reason,
      concepts: r.concepts,
      annualPeriods: r.annual_periods,
      quarterlyPeriods: r.quarterly_periods,
      latestPeriodEnd: r.latest_period_end,
    }));
  }

  async getFilings(companyId: string): Promise<FilingRecord[]> {
    const { data, error } = await this.db
      .from("sec_filings")
      .select("accession_number, form, filing_date, report_date, accepted_at, items, release_timing")
      .eq("company_id", companyId)
      .order("filing_date", { ascending: false })
      .limit(400);
    if (error) fail("getFilings", error);
    return data.map((r) => ({
      accessionNumber: r.accession_number,
      form: r.form,
      filingDate: r.filing_date,
      reportDate: r.report_date,
      acceptedAt: r.accepted_at,
      items: r.items,
      releaseTiming: r.release_timing as FilingRecord["releaseTiming"],
    }));
  }

  async listFundamentalSnapshots(companyIds: readonly string[]): Promise<Map<string, FundamentalSnapshot>> {
    const out = new Map<string, FundamentalSnapshot>();
    for (let i = 0; i < companyIds.length; i += 200) {
      const { data, error } = await this.db.from("company_fundamental_snapshots").select("*").in("company_id", companyIds.slice(i, i + 200));
      if (error) fail("listFundamentalSnapshots", error);
      for (const r of data) {
        out.set(r.company_id, {
          template: r.industry_template as FundamentalSnapshot["template"],
          asOfPeriodEnd: r.as_of_period_end,
          revenueTtm: numOrNull(r.revenue_ttm),
          netIncomeTtm: numOrNull(r.net_income_ttm),
          metrics: {
            gross_margin: numOrNull(r.gross_margin),
            operating_margin: numOrNull(r.operating_margin),
            net_margin: numOrNull(r.net_margin),
            fcf_margin: numOrNull(r.fcf_margin),
            roe: numOrNull(r.roe),
            roic: numOrNull(r.roic),
            revenue_growth: numOrNull(r.revenue_growth),
            net_income_growth: numOrNull(r.net_income_growth),
            eps_growth: numOrNull(r.eps_growth),
          },
        });
      }
    }
    return out;
  }

  async getCashDividendsPerShare(securityId: string, from: string, to: string, source: string): Promise<DividendsTtm | null> {
    // ¿Hay acciones corporativas sincronizadas para este valor? Si no, el dato es desconocido (null), no 0.
    const any = await this.db.from("corporate_actions").select("ex_date", { count: "exact", head: true }).eq("security_id", securityId).eq("source", source);
    if (any.error) fail("getCashDividendsPerShare.any", any.error);
    if (!any.count) return null;
    const { data, error } = await this.db
      .from("corporate_actions")
      .select("action_type, cash_amount, ex_date, provider_label")
      .eq("security_id", securityId)
      .eq("source", source)
      .in("action_type", ["cash_dividend", "special_dividend", "other"])
      .gte("ex_date", from)
      .lte("ex_date", to);
    if (error) fail("getCashDividendsPerShare", error);
    return {
      perShare: data.filter((r) => r.action_type === "cash_dividend").reduce((sum, r) => sum + num(r.cash_amount ?? 0), 0),
      foreignExcluded: data.filter((r) => r.action_type === "other" && r.provider_label === "foreign").length,
      specialExcluded: data.filter((r) => r.action_type === "special_dividend").length,
    };
  }
}
