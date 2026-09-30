import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CorporateAction } from "@/domain/corporate-actions";
import { actionType } from "@/domain/corporate-actions";
import type { EarningsEstimate, EarningsEvent } from "@/domain/earnings";
import type { FinancialStatementValue, LineItemCoverage, SharesOutstandingPoint } from "@/domain/fundamentals";
import type { IndustryTemplate } from "@/providers/sec/concepts";
import type { SecEntityProfile, SecFiling } from "@/providers/sec/parse";
import type { MarketSession } from "@/domain/market-calendar";
import type { DailyBar, VolumeBasis } from "@/domain/prices";
import type { ValuationValue } from "@/domain/valuation";
import type { AdjustmentFactor } from "@/lib/calculations/adjustments";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/data/supabase/database.types";
import { corporateActionToRow, rowToCorporateAction, toDailyBar } from "@/data/supabase/market-mappers";
import type {
  IdentifierRecord,
  PriceSeriesRecord,
  PriceSeriesSpec,
  QualityNote,
  QualityStatus,
  StoredDailyBars,
  StoredGroupIndex,
  StoredShareClass,
  StoredMarketSnapshot,
  SyncCursor,
  SyncRunFinish,
  SyncRunStart,
  SyncSecurity,
  SyncStore,
  WriteProvenance,
} from "./store";

type Db = SupabaseClient<Database>;

/** Cliente con service_role: SOLO para el CLI de sincronización (nunca en la app web). */
export function createServiceSupabase(url: string, serviceRoleKey: string): Db {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const CHUNK = 500;
const PAGE = 1000;

export class SyncStoreError extends Error {
  override name = "SyncStoreError";
}

type DbResult = { data: unknown; error: { message: string } | null };

/** Escrituras: solo importa el error. */
function check(operation: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new SyncStoreError(`${operation}: ${result.error.message}`);
}

/** Lecturas que siempre devuelven datos (listas, insert … single). */
function must<R extends DbResult>(operation: string, result: R): NonNullable<R["data"]> {
  check(operation, result);
  if (result.data === null || result.data === undefined) throw new SyncStoreError(`${operation}: no data returned`);
  return result.data as NonNullable<R["data"]>;
}

/** Lecturas opcionales (maybeSingle). */
function maybe<R extends DbResult>(operation: string, result: R): R["data"] {
  check(operation, result);
  return result.data;
}

async function upsertChunks<T extends object>(db: Db, table: keyof Database["public"]["Tables"], rows: readonly T[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // El tipo de fila se garantiza en cada llamador con TablesInsert<...>.
    const result = await db.from(table).upsert(chunk as never, { onConflict });
    check(`upsert ${table}`, result);
  }
  return rows.length;
}

export class SupabaseSyncStore implements SyncStore {
  private readonly datasetIds = new Map<string, string>();

  constructor(private readonly db: Db) {}

  async resolveDatasetId(key: string): Promise<string> {
    const cached = this.datasetIds.get(key);
    if (cached) return cached;
    const row = maybe("datasets", await this.db.from("datasets").select("id").eq("key", key).maybeSingle());
    if (!row) throw new SyncStoreError(`Dataset "${key}" not found (apply migrations)`);
    this.datasetIds.set(key, row.id);
    return row.id;
  }

  async findSecuritiesByTicker(tickers: readonly string[]): Promise<SyncSecurity[]> {
    const rows = must(
      "v_securities",
      await this.db
        .from("v_securities")
        .select("security_id, company_id, ticker, exchange_mic, currency, company_name, cik, share_class, is_primary, sector_id, industry_group_id, industry_id, sub_industry_id")
        .in("ticker", [...tickers]),
    );
    return this.toSyncSecurities(rows);
  }

  async listIndexSecurities(indexSlug: string): Promise<SyncSecurity[]> {
    const rows = must(
      "v_index_constituent_securities",
      await this.db
        .from("v_index_constituent_securities")
        .select("security_id, company_id, ticker, exchange_mic, currency, company_name, cik, share_class, is_primary, sector_id, industry_group_id, industry_id, sub_industry_id")
        .eq("index_slug", indexSlug)
        .order("ticker")
        .range(0, PAGE - 1),
    );
    return (await this.toSyncSecurities(rows)).map((s) => ({ ...s, groups: [...(s.groups ?? []), `index:${indexSlug}`] }));
  }

  private async toSyncSecurities(
    rows: readonly {
      security_id: string | null;
      company_id: string | null;
      ticker: string | null;
      exchange_mic: string | null;
      currency: string | null;
      company_name: string | null;
      cik: string | null;
      share_class: string | null;
      is_primary: boolean | null;
      sector_id: string | null;
      industry_group_id: string | null;
      industry_id: string | null;
      sub_industry_id: string | null;
    }[],
  ): Promise<SyncSecurity[]> {
    const companyIds = [...new Set(rows.map((r) => r.company_id as string))];
    const listings = new Map<string, number>();
    const secNames = new Map<string, string>();
    for (let i = 0; i < companyIds.length; i += 200) {
      const ids = companyIds.slice(i, i + 200);
      const chunk = must("securities", await this.db.from("securities").select("company_id").in("company_id", ids));
      for (const r of chunk) listings.set(r.company_id, (listings.get(r.company_id) ?? 0) + 1);
      const entities = must("sec_entities", await this.db.from("sec_entities").select("company_id, name").in("company_id", ids));
      for (const e of entities) secNames.set(e.company_id, e.name);
    }
    return rows.map((r) => ({
      securityId: r.security_id as string,
      companyId: r.company_id as string,
      ticker: r.ticker as string,
      exchangeMic: r.exchange_mic as string,
      currency: r.currency as string,
      companyName: r.company_name as string,
      cik: r.cik,
      isin: null,
      shareClass: r.share_class,
      isPrimary: r.is_primary ?? false,
      listingsOfIssuer: listings.get(r.company_id as string) ?? 1,
      alternateNames: secNames.has(r.company_id as string) ? [secNames.get(r.company_id as string) as string] : [],
      groups: [
        r.sector_id ? `sector:${r.sector_id}` : null,
        r.industry_group_id ? `industry_group:${r.industry_group_id}` : null,
        r.industry_id ? `industry:${r.industry_id}` : null,
        r.sub_industry_id ? `sub_industry:${r.sub_industry_id}` : null,
      ].filter((g): g is string => g !== null),
    }));
  }

  async upsertSecEntity(companyId: string, profile: SecEntityProfile, template: IndustryTemplate, prov: WriteProvenance): Promise<void> {
    check(
      "upsert sec_entities",
      await this.db.from("sec_entities").upsert(
        {
          company_id: companyId,
          cik: profile.cik,
          name: profile.name,
          sic: profile.sic,
          sic_description: profile.sicDescription,
          industry_template: template,
          fiscal_year_end: profile.fiscalYearEnd && /^[0-9]{4}$/.test(profile.fiscalYearEnd) ? profile.fiscalYearEnd : null,
          tickers: profile.tickers,
          exchanges: profile.exchanges,
          filer_category: profile.filerCategory,
          dataset_id: prov.datasetId,
          ingested_at: prov.ingestedAt,
        },
        { onConflict: "company_id" },
      ),
    );
  }

  async upsertSecFilings(companyId: string, filings: readonly SecFiling[], prov: WriteProvenance): Promise<number> {
    const rows: TablesInsert<"sec_filings">[] = filings.map((f) => ({
      accession_number: f.accessionNumber,
      company_id: companyId,
      form: f.form,
      filing_date: f.filingDate,
      report_date: f.reportDate,
      accepted_at: f.acceptedAt,
      items: f.items,
      primary_document: f.primaryDocument,
      release_timing: f.releaseTiming,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "sec_filings", rows, "accession_number");
  }

  /**
   * Escritura DIFERENCIAL: solo se escriben filas nuevas o cambiadas (valor, accession, fórmula,
   * reexpresión) y se borran las que ya no existen. Un sync diario sin filings nuevos no reescribe
   * ~500k filas (menos I/O y menos espacio muerto en Postgres).
   */
  async replaceStatementValues(companyId: string, sourceSecurityId: string, values: readonly FinancialStatementValue[], prov: WriteProvenance) {
    const keyOf = (item: string, type: string, end: string, origin: string) => `${item}|${type}|${end}|${origin}`;
    const keep = new Set(values.map((v) => keyOf(v.lineItem, v.periodType, v.fiscalPeriodEnd, v.origin)));
    const existing: {
      line_item_code: string;
      period_type: string;
      fiscal_period_end: string;
      value_origin: string;
      value: number | null;
      accession_number: string | null;
      derivation: string | null;
      restated: boolean;
      missing_reason: string | null;
      fiscal_year: number | null;
      fiscal_quarter: number | null;
      source_field: string;
    }[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = must(
        "financial_statement_values",
        await this.db
          .from("financial_statement_values")
          .select("line_item_code, period_type, fiscal_period_end, value_origin, value, accession_number, derivation, restated, missing_reason, fiscal_year, fiscal_quarter, source_field")
          .eq("company_id", companyId)
          .eq("source", prov.source)
          .order("line_item_code")
          .order("period_type")
          .order("fiscal_period_end")
          .order("value_origin")
          .range(from, from + PAGE - 1),
      );
      existing.push(...rows);
      if (rows.length < PAGE) break;
    }
    const current = new Map(existing.map((r) => [keyOf(r.line_item_code, r.period_type, r.fiscal_period_end, r.value_origin), r]));
    const changed = values.filter((v) => {
      const r = current.get(keyOf(v.lineItem, v.periodType, v.fiscalPeriodEnd, v.origin));
      return (
        !r ||
        (r.value === null ? v.value !== null : v.value === null || Math.abs(Number(r.value) - v.value) > Math.max(1e-9, Math.abs(v.value) * 1e-12)) ||
        r.accession_number !== (v.provenance?.accessionNumber ?? null) ||
        r.derivation !== (v.provenance?.derivation ?? null) ||
        r.restated !== (v.provenance?.restated ?? false) ||
        r.missing_reason !== v.missingReason ||
        r.fiscal_year !== (v.fiscalYear ?? null) ||
        r.fiscal_quarter !== (v.fiscalQuarter ?? null) ||
        r.source_field !== v.sourceField
      );
    });
    const written = changed.length > 0 ? await this.upsertStatementValues(companyId, sourceSecurityId, changed, prov) : 0;
    const stale = existing.filter((r) => !keep.has(keyOf(r.line_item_code, r.period_type, r.fiscal_period_end, r.value_origin)));
    const groups = new Map<string, string[]>();
    for (const r of stale) {
      const g = `${r.line_item_code}|${r.period_type}|${r.value_origin}`;
      groups.set(g, [...(groups.get(g) ?? []), r.fiscal_period_end]);
    }
    for (const [g, ends] of groups) {
      const [item, type, origin] = g.split("|") as [string, string, string];
      check(
        "delete stale financial_statement_values",
        await this.db
          .from("financial_statement_values")
          .delete()
          .eq("company_id", companyId)
          .eq("source", prov.source)
          .eq("line_item_code", item)
          .eq("period_type", type)
          .eq("value_origin", origin)
          .in("fiscal_period_end", ends),
      );
    }
    return { written, removed: stale.length };
  }

  async upsertFundamentalSnapshot(companyId: string, snapshot: FundamentalSnapshot, prov: WriteProvenance): Promise<void> {
    const m = snapshot.metrics;
    check(
      "upsert company_fundamental_snapshots",
      await this.db.from("company_fundamental_snapshots").upsert(
        {
          company_id: companyId,
          source: prov.source,
          industry_template: snapshot.template,
          as_of_period_end: snapshot.asOfPeriodEnd,
          revenue_ttm: snapshot.revenueTtm,
          net_income_ttm: snapshot.netIncomeTtm,
          gross_margin: m.gross_margin,
          operating_margin: m.operating_margin,
          net_margin: m.net_margin,
          fcf_margin: m.fcf_margin,
          roe: m.roe,
          roic: m.roic,
          revenue_growth: m.revenue_growth,
          net_income_growth: m.net_income_growth,
          eps_growth: m.eps_growth,
          dataset_id: prov.datasetId,
          computed_at: prov.ingestedAt,
        },
        { onConflict: "company_id" },
      ),
    );
  }

  async replaceCoverage(companyId: string, coverage: readonly LineItemCoverage[], prov: WriteProvenance): Promise<number> {
    check("delete fundamental_coverage", await this.db.from("fundamental_coverage").delete().eq("company_id", companyId).eq("source", prov.source));
    const rows: TablesInsert<"fundamental_coverage">[] = coverage.map((c) => ({
      company_id: companyId,
      source: prov.source,
      line_item_code: c.lineItem,
      status: c.status,
      reason: c.reason,
      concepts: c.concepts,
      annual_periods: c.annualPeriods,
      quarterly_periods: c.quarterlyPeriods,
      latest_period_end: c.latestPeriodEnd,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "fundamental_coverage", rows, "company_id,source,line_item_code");
  }

  async getActiveIdentifier(provider: string, securityId: string): Promise<IdentifierRecord | null> {
    const row = maybe(
      "security_identifiers",
      await this.db
        .from("security_identifiers")
        .select("id, security_id, provider, symbol, provider_exchange_code, source, verified_at")
        .eq("provider", provider)
        .eq("security_id", securityId)
        .is("valid_to", null)
        .maybeSingle(),
    );
    return row
      ? {
          id: row.id,
          securityId: row.security_id,
          provider: row.provider,
          symbol: row.symbol,
          exchangeCode: row.provider_exchange_code,
          source: row.source as IdentifierRecord["source"],
          verifiedAt: row.verified_at,
        }
      : null;
  }

  async insertIdentifier(input: Omit<IdentifierRecord, "id" | "verifiedAt">): Promise<IdentifierRecord> {
    const row = must(
      "insert security_identifiers",
      await this.db
        .from("security_identifiers")
        .insert({
          security_id: input.securityId,
          provider: input.provider,
          symbol: input.symbol,
          provider_exchange_code: input.exchangeCode,
          source: input.source,
        })
        .select("id")
        .single(),
    );
    return { ...input, id: row.id, verifiedAt: null };
  }

  async markIdentifierVerified(id: string, note: string, at: string): Promise<void> {
    check("verify identifier", await this.db.from("security_identifiers").update({ verified_at: at, verification_note: note }).eq("id", id));
  }

  private toSeries(r: Tables<"price_series">): PriceSeriesRecord {
    return {
      id: r.id,
      securityId: r.security_id,
      source: r.source,
      volumeBasis: r.volume_basis as VolumeBasis,
      feed: r.feed,
      firstDate: r.first_date,
      lastDate: r.last_date,
      barCount: r.bar_count,
      fullLoadedAt: r.full_loaded_at,
      lastIngestedAt: r.last_ingested_at,
      qualityStatus: r.quality_status as QualityStatus | null,
    };
  }

  async getPriceSeries(securityId: string): Promise<PriceSeriesRecord | null> {
    const row = maybe("price_series", await this.db.from("price_series").select("*").eq("security_id", securityId).maybeSingle());
    return row ? this.toSeries(row) : null;
  }

  async openPriceSeries(securityId: string, spec: PriceSeriesSpec) {
    const current = await this.getPriceSeries(securityId);
    if (current && current.source === spec.source) {
      if (current.feed !== spec.feed || current.volumeBasis !== spec.volumeBasis) {
        check(
          "update price_series",
          await this.db.from("price_series").update({ feed: spec.feed, volume_basis: spec.volumeBasis, dataset_id: spec.datasetId }).eq("id", current.id),
        );
      }
      return { series: { ...current, feed: spec.feed, volumeBasis: spec.volumeBasis }, switchedFrom: null, removedBars: 0 };
    }
    let removedBars = 0;
    if (current) {
      const removed = await this.db.from("daily_bars").delete({ count: "exact" }).eq("series_id", current.id);
      check("delete daily_bars (source switch)", removed);
      removedBars = removed.count ?? 0;
    }
    const row = must(
      "upsert price_series",
      await this.db
        .from("price_series")
        .upsert(
          {
            security_id: securityId,
            source: spec.source,
            dataset_id: spec.datasetId,
            volume_basis: spec.volumeBasis,
            feed: spec.feed,
            currency: spec.currency,
            first_date: null,
            last_date: null,
            bar_count: 0,
            full_loaded_at: null,
            last_ingested_at: null,
            quality_status: null,
            quality_notes: [],
            checked_at: null,
          },
          { onConflict: "security_id" },
        )
        .select("*")
        .single(),
    );
    return { series: this.toSeries(row), switchedFrom: current?.source ?? null, removedBars };
  }

  async upsertDailyBars(seriesId: number, bars: readonly DailyBar[]): Promise<number> {
    if (bars.length === 0) return 0;
    const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    const from = (sorted[0] as DailyBar).tradeDate;
    const to = (sorted.at(-1) as DailyBar).tradeDate;
    // Escritura diferencial: solo barras nuevas o corregidas por el proveedor.
    const existing = new Map<string, DailyBar>();
    for (let offset = 0; ; offset += PAGE) {
      const rows = must(
        "daily_bars",
        await this.db
          .from("daily_bars")
          .select("trade_date, open, high, low, close, volume, provider_adjusted_close")
          .eq("series_id", seriesId)
          .gte("trade_date", from)
          .lte("trade_date", to)
          .order("trade_date")
          .range(offset, offset + PAGE - 1),
      );
      for (const r of rows) existing.set(r.trade_date, toDailyBar(r));
      if (rows.length < PAGE) break;
    }
    const rows: TablesInsert<"daily_bars">[] = sorted.flatMap((b) => {
      const row = {
        series_id: seriesId,
        trade_date: b.tradeDate,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume === null ? null : Math.round(b.volume),
        provider_adjusted_close: b.providerAdjustedClose !== null && b.providerAdjustedClose > 0 ? b.providerAdjustedClose : null,
      };
      const e = existing.get(b.tradeDate);
      const same =
        e &&
        e.open === row.open &&
        e.high === row.high &&
        e.low === row.low &&
        e.close === row.close &&
        e.volume === row.volume &&
        e.providerAdjustedClose === row.provider_adjusted_close;
      return same ? [] : [row];
    });
    await upsertChunks(this.db, "daily_bars", rows, "series_id,trade_date");
    return rows.length;
  }

  async deleteBarsBefore(seriesId: number, date: string): Promise<number> {
    const result = await this.db.from("daily_bars").delete({ count: "exact" }).eq("series_id", seriesId).lt("trade_date", date);
    check("delete daily_bars before", result);
    return result.count ?? 0;
  }

  async finalizeSeriesLoad(seriesId: number, input: { ingestedAt: string; fullLoad: boolean }): Promise<PriceSeriesRecord> {
    const first = maybe("daily_bars first", await this.db.from("daily_bars").select("trade_date").eq("series_id", seriesId).order("trade_date").limit(1).maybeSingle());
    const last = maybe(
      "daily_bars last",
      await this.db.from("daily_bars").select("trade_date").eq("series_id", seriesId).order("trade_date", { ascending: false }).limit(1).maybeSingle(),
    );
    const count = await this.db.from("daily_bars").select("trade_date", { count: "exact", head: true }).eq("series_id", seriesId);
    check("count daily_bars", count);
    const patch: TablesUpdate<"price_series"> = {
      first_date: first?.trade_date ?? null,
      last_date: last?.trade_date ?? null,
      bar_count: count.count ?? 0,
      last_ingested_at: input.ingestedAt,
    };
    if (input.fullLoad) patch.full_loaded_at = input.ingestedAt;
    const row = must("update price_series", await this.db.from("price_series").update(patch).eq("id", seriesId).select("*").single());
    return this.toSeries(row);
  }

  async setSeriesQuality(seriesId: number, status: QualityStatus, notes: readonly QualityNote[], checkedAt: string): Promise<void> {
    check(
      "update price_series quality",
      await this.db
        .from("price_series")
        .update({ quality_status: status, quality_notes: notes as unknown as NonNullable<Json>, checked_at: checkedAt })
        .eq("id", seriesId),
    );
  }

  async getDailyBars(securityId: string): Promise<StoredDailyBars> {
    const series = await this.getPriceSeries(securityId);
    if (!series) return { bars: [], volumeBasis: null, source: null, seriesId: null };
    const bars: DailyBar[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = must(
        "daily_bars",
        await this.db
          .from("daily_bars")
          .select("trade_date, open, high, low, close, volume, provider_adjusted_close")
          .eq("series_id", series.id)
          .order("trade_date")
          .range(from, from + PAGE - 1),
      );
      for (const r of rows) bars.push(toDailyBar(r));
      if (rows.length < PAGE) break;
    }
    return { bars, volumeBasis: series.volumeBasis, source: series.source, seriesId: series.id };
  }

  async replaceMarketSessions(exchangeMic: string, sessions: readonly MarketSession[], source: string): Promise<number> {
    const rows: TablesInsert<"market_sessions">[] = sessions.map((s) => ({
      exchange_mic: exchangeMic,
      session_date: s.date,
      opens_at: s.opensAt,
      closes_at: s.closesAt,
      source,
    }));
    return upsertChunks(this.db, "market_sessions", rows, "exchange_mic,session_date");
  }

  async getMarketSessions(exchangeMic: string, from: string, to: string): Promise<MarketSession[]> {
    const out: MarketSession[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows = must(
        "market_sessions",
        await this.db
          .from("market_sessions")
          .select("session_date, opens_at, closes_at")
          .eq("exchange_mic", exchangeMic)
          .gte("session_date", from)
          .lte("session_date", to)
          .order("session_date")
          .range(offset, offset + PAGE - 1),
      );
      for (const r of rows) out.push({ date: r.session_date, opensAt: new Date(r.opens_at).toISOString(), closesAt: new Date(r.closes_at).toISOString() });
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async getLatestShares(securityId: string) {
    const row = maybe(
      "shares_outstanding",
      await this.db
        .from("shares_outstanding")
        .select("shares, as_of_date, source")
        .eq("security_id", securityId)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row ? { shares: Number(row.shares), asOfDate: row.as_of_date, source: row.source } : null;
  }

  async getLatestQuarterlyValue(companyId: string, source: string, lineItem: string) {
    const row = maybe(
      "financial_statement_values",
      await this.db
        .from("financial_statement_values")
        .select("value, fiscal_period_end")
        .eq("company_id", companyId)
        .eq("source", source)
        .eq("line_item_code", lineItem)
        .eq("period_type", "quarterly")
        .not("value", "is", null)
        .order("fiscal_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row && row.value !== null ? { value: Number(row.value), periodEnd: row.fiscal_period_end } : null;
  }

  async getLatestPeriodicFiling(companyId: string) {
    const row = maybe(
      "sec_filings",
      await this.db.from("sec_filings").select("accession_number, form, report_date").eq("company_id", companyId).in("form", ["10-Q", "10-K"]).order("filing_date", { ascending: false }).limit(1).maybeSingle(),
    );
    return row ? { accessionNumber: row.accession_number, form: row.form, reportDate: row.report_date } : null;
  }

  async upsertShareClass(r: StoredShareClass): Promise<void> {
    check(
      "upsert security_share_classes",
      await this.db.from("security_share_classes").upsert(
        {
          security_id: r.securityId,
          company_id: r.companyId,
          accession_number: r.accessionNumber,
          form: r.form,
          period_end: r.periodEnd,
          class_member: r.classMember,
          resolved_via: r.resolvedVia,
          shares: r.shares === null ? null : Math.round(r.shares),
          shares_as_of: r.sharesAsOf,
          check_status: r.checkStatus,
          check_rule: r.checkRule,
          reference_shares: r.referenceShares,
          reference_kind: r.referenceKind,
          reference_period_end: r.referencePeriodEnd,
          deviation: r.deviation,
          note: r.note,
          source: r.source,
          dataset_id: r.datasetId,
          computed_at: r.computedAt,
        },
        { onConflict: "security_id" },
      ),
    );
  }

  async getShareClass(securityId: string): Promise<StoredShareClass | null> {
    const r = maybe("security_share_classes", await this.db.from("security_share_classes").select("*").eq("security_id", securityId).maybeSingle());
    return r
      ? {
          securityId: r.security_id,
          companyId: r.company_id,
          accessionNumber: r.accession_number,
          form: r.form,
          periodEnd: r.period_end,
          classMember: r.class_member,
          resolvedVia: r.resolved_via as StoredShareClass["resolvedVia"],
          shares: r.shares === null ? null : Number(r.shares),
          sharesAsOf: r.shares_as_of,
          checkStatus: r.check_status as StoredShareClass["checkStatus"],
          checkRule: r.check_rule as StoredShareClass["checkRule"],
          referenceShares: r.reference_shares === null ? null : Number(r.reference_shares),
          referenceKind: r.reference_kind as StoredShareClass["referenceKind"],
          referencePeriodEnd: r.reference_period_end,
          deviation: r.deviation === null ? null : Number(r.deviation),
          note: r.note,
          source: r.source,
          datasetId: r.dataset_id,
          computedAt: r.computed_at,
        }
      : null;
  }

  async listShareClassSecurityIds(): Promise<Set<string>> {
    const rows = must("security_share_classes", await this.db.from("security_share_classes").select("security_id"));
    return new Set(rows.map((r) => r.security_id));
  }

  async getMarketCapStatuses(): Promise<Map<string, string>> {
    const rows = must("security_market_snapshots", await this.db.from("security_market_snapshots").select("security_id, market_cap_status").range(0, 1999));
    return new Map(rows.map((r) => [r.security_id, r.market_cap_status]));
  }

  async getSharesHistory(securityId: string) {
    const rows = must(
      "shares_outstanding",
      await this.db.from("shares_outstanding").select("as_of_date, shares").eq("security_id", securityId).eq("basis", "cover_page").order("as_of_date"),
    );
    return rows.map((r) => ({ asOfDate: r.as_of_date, shares: Number(r.shares) }));
  }

  async replaceGroupIndices(rows: readonly StoredGroupIndex[]): Promise<number> {
    const insert: TablesInsert<"group_index_series">[] = rows.map((r) => ({
      group_kind: r.groupKind,
      group_key: r.groupKey,
      method: r.method,
      exchange_mic: r.exchangeMic,
      start_date: r.startDate,
      end_date: r.endDate,
      // real[]: precisión de ~7 cifras, suficiente para niveles de índice.
      levels: r.levels.map((v) => Math.round(v * 1e4) / 1e4),
      members_total: r.membersTotal,
      members_last: r.membersLast,
      source: r.source,
      computed_at: r.computedAt,
    }));
    for (let i = 0; i < insert.length; i += 50) {
      check("upsert group_index_series", await this.db.from("group_index_series").upsert(insert.slice(i, i + 50), { onConflict: "group_kind,group_key,method" }));
    }
    // Series de grupos que ya no existen (p. ej. reclasificaciones): se borran.
    const existing = must("group_index_series", await this.db.from("group_index_series").select("group_kind, group_key, method"));
    const keep = new Set(rows.map((r) => `${r.groupKind}|${r.groupKey}|${r.method}`));
    for (const e of existing) {
      if (keep.has(`${e.group_kind}|${e.group_key}|${e.method}`)) continue;
      check("delete group_index_series", await this.db.from("group_index_series").delete().eq("group_kind", e.group_kind).eq("group_key", e.group_key).eq("method", e.method));
    }
    return rows.length;
  }

  async acquireLease(name: string, holder: string, ttlMs: number, now: Date): Promise<boolean> {
    const expires = new Date(now.getTime() + ttlMs).toISOString();
    // Solo se inserta si no existe o si ha caducado (dos pasos idempotentes; carrera acotada por la caducidad).
    const current = maybe("sync_leases", await this.db.from("sync_leases").select("holder, expires_at").eq("name", name).maybeSingle());
    if (current && Date.parse(current.expires_at) > now.getTime() && current.holder !== holder) return false;
    check("upsert sync_leases", await this.db.from("sync_leases").upsert({ name, holder, acquired_at: now.toISOString(), expires_at: expires }, { onConflict: "name" }));
    const after = maybe("sync_leases", await this.db.from("sync_leases").select("holder").eq("name", name).maybeSingle());
    return after?.holder === holder;
  }

  async pruneSyncRuns(before: string): Promise<number> {
    const result = await this.db.from("sync_runs").delete({ count: "exact" }).lt("finished_at", before);
    check("prune sync_runs", result);
    return result.count ?? 0;
  }

  async releaseLease(name: string, holder: string): Promise<void> {
    check("delete sync_leases", await this.db.from("sync_leases").delete().eq("name", name).eq("holder", holder));
  }

  async upsertMarketSnapshot(s: StoredMarketSnapshot): Promise<void> {
    const r = s.returns;
    check(
      "upsert security_market_snapshots",
      await this.db.from("security_market_snapshots").upsert(
        {
          security_id: s.securityId,
          series_id: s.seriesId,
          source: s.source,
          as_of_date: s.asOfDate,
          bar_count: s.barCount,
          first_date: s.firstDate,
          close: s.close,
          previous_close: s.previousClose,
          volume: s.volume === null ? null : Math.round(s.volume),
          return_1d: r["1D"],
          return_1w: r["1W"],
          return_1m: r["1M"],
          return_3m: r["3M"],
          return_6m: r["6M"],
          return_ytd: r.YTD,
          return_1y: r["1Y"],
          return_3y: r["3Y"],
          return_5y: r["5Y"],
          sma20: s.sma20,
          sma50: s.sma50,
          sma200: s.sma200,
          ema20: s.ema20,
          ema50: s.ema50,
          ema200: s.ema200,
          rsi14: s.rsi14,
          macd: s.macd,
          macd_signal: s.macdSignal,
          macd_histogram: s.macdHistogram,
          atr14: s.atr14,
          average_volume20: s.averageVolume20,
          relative_volume: s.relativeVolume,
          average_dollar_volume20: s.averageDollarVolume20,
          high_52w: s.high52w,
          low_52w: s.low52w,
          is_new_52w_high: s.isNew52wHigh,
          is_new_52w_low: s.isNew52wLow,
          market_cap: s.marketCap,
          market_cap_status: s.marketCapStatus,
          market_cap_reason: s.marketCapReason,
          market_cap_shares: s.marketCapShares,
          market_cap_shares_as_of: s.marketCapSharesAsOf,
          computed_at: s.computedAt,
        },
        { onConflict: "security_id" },
      ),
    );
  }

  async replaceCorporateActions(securityId: string, actions: readonly CorporateAction[], prov: WriteProvenance) {
    const existing = must("corporate_actions", await this.db.from("corporate_actions").select("*").eq("security_id", securityId).eq("source", prov.source));
    // Escritura diferencial: solo acciones nuevas o con algún campo cambiado.
    const FIELDS = ["support_status", "split_to", "split_from", "cash_amount", "provider_adjusted_amount", "currency", "declaration_date", "record_date", "payment_date", "frequency", "provider_label", "unsupported_reason"] as const;
    const norm = (v: unknown) => (v === undefined || v === null ? null : typeof v === "number" ? v : String(v).trim());
    const byKey = new Map(existing.map((r) => [`${r.action_type}:${r.ex_date}`, r as Record<string, unknown>]));
    const rows = actions
      .map((a) => corporateActionToRow(securityId, a, prov))
      .filter((row) => {
        const current = byKey.get(`${row.action_type}:${row.ex_date}`);
        const next = row as Record<string, unknown>;
        return !current || FIELDS.some((f) => {
          const a = norm(current[f]);
          const b = norm(next[f]);
          return typeof a === "number" || typeof b === "number" ? Number(a) !== Number(b) : a !== b;
        });
      });
    const written = await upsertChunks(this.db, "corporate_actions", rows, "security_id,source,action_type,ex_date");
    const keep = new Set(actions.map((a) => `${actionType(a)}:${a.exDate}`));
    const stale = existing.filter((r) => !keep.has(`${r.action_type}:${r.ex_date}`));
    if (stale.length > 0) {
      check("delete corporate_actions", await this.db.from("corporate_actions").delete().in("id", stale.map((r) => r.id)));
    }
    return { written, removed: stale.map((r) => `${r.action_type}:${r.ex_date}`) };
  }

  async getCorporateActions(securityId: string, source?: string): Promise<CorporateAction[]> {
    let query = this.db.from("corporate_actions").select("*").eq("security_id", securityId);
    if (source) query = query.eq("source", source);
    const rows = must("corporate_actions", await query.order("ex_date"));
    return rows.map(rowToCorporateAction);
  }

  async replaceAdjustmentFactors(securityId: string, factors: readonly AdjustmentFactor[], inputSource: string, computedAt: string) {
    check("delete adjustment_factors", await this.db.from("adjustment_factors").delete().eq("security_id", securityId));
    const rows: TablesInsert<"adjustment_factors">[] = factors.map((f) => ({
      security_id: securityId,
      ex_date: f.exDate,
      factor_kind: f.kind,
      price_factor: f.priceFactor,
      volume_factor: f.volumeFactor,
      reference_close: f.referenceClose,
      reference_date: f.referenceDate,
      method: f.kind === "split" ? "split_ratio" : "crsp_prev_close",
      input_source: inputSource,
      computed_at: computedAt,
    }));
    return upsertChunks(this.db, "adjustment_factors", rows, "security_id,ex_date,factor_kind");
  }

  async upsertShares(securityId: string, points: readonly SharesOutstandingPoint[], prov: WriteProvenance) {
    const rows: TablesInsert<"shares_outstanding">[] = points.map((p) => ({
      security_id: securityId,
      as_of_date: p.asOfDate,
      basis: p.basis,
      shares: p.shares,
      source_field: p.sourceField,
      source: prov.source,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "shares_outstanding", rows, "security_id,source,basis,as_of_date");
  }

  async upsertStatementValues(companyId: string, sourceSecurityId: string, values: readonly FinancialStatementValue[], prov: WriteProvenance) {
    const rows: TablesInsert<"financial_statement_values">[] = values.map((v) => ({
      company_id: companyId,
      line_item_code: v.lineItem,
      period_type: v.periodType,
      fiscal_period_end: v.fiscalPeriodEnd,
      filing_date: v.filingDate,
      currency: v.currency && /^[A-Z]{3}$/.test(v.currency) ? v.currency : null,
      value: v.value,
      value_origin: v.origin,
      missing_reason: v.missingReason,
      source_field: v.sourceField,
      period_start: v.periodStart ?? null,
      fiscal_year: v.fiscalYear ?? null,
      fiscal_quarter: v.fiscalQuarter ?? null,
      accession_number: v.provenance?.accessionNumber ?? null,
      form: v.provenance?.form ?? null,
      restated: v.provenance?.restated ?? false,
      derivation: v.provenance?.derivation ?? null,
      source: prov.source,
      source_security_id: sourceSecurityId,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "financial_statement_values", rows, "company_id,source,line_item_code,period_type,fiscal_period_end,value_origin");
  }

  async upsertEarningsEvents(companyId: string, sourceSecurityId: string, events: readonly EarningsEvent[], prov: WriteProvenance) {
    const rows: TablesInsert<"earnings_events">[] = events.map((e) => ({
      company_id: companyId,
      fiscal_period_end: e.fiscalPeriodEnd,
      report_date: e.reportDate,
      report_timing: e.timing,
      provider_eps_actual: e.providerEpsActual,
      provider_eps_estimate: e.providerEpsEstimate,
      provider_eps_surprise: e.providerEpsSurprise,
      provider_eps_surprise_percent: e.providerEpsSurprisePercent,
      eps_basis: e.epsBasis,
      currency: e.currency && /^[A-Z]{3}$/.test(e.currency) ? e.currency : null,
      source: prov.source,
      source_security_id: sourceSecurityId,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "earnings_events", rows, "company_id,source,fiscal_period_end");
  }

  async upsertEarningsEstimates(
    companyId: string,
    sourceSecurityId: string,
    asOf: string | null,
    estimates: readonly EarningsEstimate[],
    prov: WriteProvenance,
  ) {
    const rows: TablesInsert<"earnings_estimates">[] = estimates.map((e) => ({
      company_id: companyId,
      period_code: e.periodCode,
      period_end: e.periodEnd,
      as_of_date: asOf,
      eps_avg: e.epsAvg,
      eps_low: e.epsLow,
      eps_high: e.epsHigh,
      eps_year_ago: e.epsYearAgo,
      eps_analysts: e.epsAnalysts,
      revenue_avg: e.revenueAvg,
      revenue_low: e.revenueLow,
      revenue_high: e.revenueHigh,
      revenue_analysts: e.revenueAnalysts,
      source: prov.source,
      source_security_id: sourceSecurityId,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "earnings_estimates", rows, "company_id,source,period_end,period_code");
  }

  async upsertValuations(securityId: string, asOf: string, values: readonly ValuationValue[], prov: WriteProvenance) {
    const rows: TablesInsert<"valuation_snapshots">[] = values.map((v) => ({
      security_id: securityId,
      as_of_date: asOf,
      metric: v.metric,
      value_origin: v.origin,
      value: v.value,
      method: v.method,
      source: prov.source,
      dataset_id: prov.datasetId,
      ingested_at: prov.ingestedAt,
    }));
    return upsertChunks(this.db, "valuation_snapshots", rows, "security_id,as_of_date,metric,value_origin,source");
  }

  async getCursor(provider: string, jobType: string, securityId: string): Promise<SyncCursor | null> {
    const row = maybe(
      "sync_cursors",
      await this.db.from("sync_cursors").select("*").eq("provider", provider).eq("job_type", jobType).eq("security_id", securityId).maybeSingle(),
    );
    return row
      ? {
          provider: row.provider,
          jobType: row.job_type,
          securityId: row.security_id,
          lastValue: row.last_value,
          fullRefreshRequired: row.full_refresh_required,
          lastSuccessAt: row.last_success_at,
          lastRunId: row.last_run_id,
        }
      : null;
  }

  async saveCursor(cursor: SyncCursor): Promise<void> {
    check(
      "upsert sync_cursors",
      await this.db.from("sync_cursors").upsert(
        {
          provider: cursor.provider,
          job_type: cursor.jobType,
          security_id: cursor.securityId,
          last_value: cursor.lastValue,
          full_refresh_required: cursor.fullRefreshRequired,
          last_success_at: cursor.lastSuccessAt,
          last_run_id: cursor.lastRunId,
        },
        { onConflict: "provider,job_type,security_id" },
      ),
    );
  }

  async startRun(input: SyncRunStart): Promise<string> {
    const row = must(
      "insert sync_runs",
      await this.db
        .from("sync_runs")
        .insert({
          provider: input.provider,
          job_type: input.jobType,
          scope: input.scope,
          status: "running",
          started_at: input.startedAt,
          params: input.params as NonNullable<Json>,
        })
        .select("id")
        .single(),
    );
    return row.id;
  }

  async finishRun(id: string, result: SyncRunFinish): Promise<void> {
    check(
      "update sync_runs",
      await this.db
        .from("sync_runs")
        .update({
          status: result.status,
          finished_at: result.finishedAt,
          records_read: result.recordsRead,
          records_written: result.recordsWritten,
          requests_made: result.requestsMade,
          credits_used: result.creditsUsed,
          credits_estimated: result.creditsEstimated,
          errors: result.errors as unknown as NonNullable<Json>,
          warnings: result.warnings as unknown as NonNullable<Json>,
        })
        .eq("id", id),
    );
  }
}
