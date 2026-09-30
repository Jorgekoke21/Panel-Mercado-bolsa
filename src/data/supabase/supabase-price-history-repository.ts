import "server-only";
import { DataAccessError } from "@/data/errors";
import type { PriceHistoryRepository, ProviderValuationRef, SharesOutstandingRef, StoredPriceHistory } from "@/data/repositories/price-history-repository";
import type { ValuationMetric } from "@/domain/valuation";
import type { DailyBar, VolumeBasis } from "@/domain/prices";
import { num, rowToAdjustmentFactor, toDailyBar } from "./market-mappers";
import type { MarketRadarSupabase } from "./server-client";

const PAGE = 1000; // max_rows de PostgREST

function fail(operation: string, error: { message: string }): never {
  throw new DataAccessError(`Database query failed (${operation})`, operation, { cause: error });
}

/** Lectura de precios sincronizados (clave anon + RLS de solo lectura). */
export class SupabasePriceHistoryRepository implements PriceHistoryRepository {
  constructor(private readonly db: MarketRadarSupabase) {}

  async getPriceHistory(securityId: string): Promise<StoredPriceHistory | null> {
    const series = await this.db
      .from("price_series")
      .select("id, source, volume_basis, feed, last_ingested_at, quality_status, quality_notes, datasets(key, name)")
      .eq("security_id", securityId)
      .maybeSingle();
    if (series.error) fail("getPriceHistory.series", series.error);
    if (!series.data || !series.data.last_ingested_at) return null;

    const bars: DailyBar[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.db
        .from("daily_bars")
        .select("trade_date, open, high, low, close, volume, provider_adjusted_close")
        .eq("series_id", series.data.id)
        .order("trade_date")
        .range(from, from + PAGE - 1);
      if (page.error) fail("getPriceHistory.bars", page.error);
      bars.push(...page.data.map(toDailyBar));
      if (page.data.length < PAGE) break;
    }
    if (bars.length === 0) return null;

    const factors = await this.db.from("adjustment_factors").select("*").eq("security_id", securityId).order("ex_date");
    if (factors.error) fail("getPriceHistory.factors", factors.error);

    const dataset = series.data.datasets;
    return {
      securityId,
      bars,
      volumeBasis: series.data.volume_basis as VolumeBasis,
      factors: factors.data.map(rowToAdjustmentFactor),
      source: series.data.source,
      feed: series.data.feed,
      datasetKey: dataset?.key ?? null,
      datasetName: dataset?.name ?? null,
      lastIngestedAt: series.data.last_ingested_at,
      qualityStatus: (series.data.quality_status as StoredPriceHistory["qualityStatus"]) ?? null,
      qualityNotes: Array.isArray(series.data.quality_notes) ? (series.data.quality_notes as unknown as { kind: string; message: string }[]) : [],
    };
  }

  async getLatestSharesOutstanding(securityId: string): Promise<SharesOutstandingRef | null> {
    const { data, error } = await this.db
      .from("shares_outstanding")
      .select("shares, as_of_date, source")
      .eq("security_id", securityId)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("getLatestSharesOutstanding", error);
    return data ? { shares: num(data.shares), asOfDate: data.as_of_date, source: data.source } : null;
  }

  async getProviderValuation(securityId: string, metric: ValuationMetric): Promise<ProviderValuationRef | null> {
    const { data, error } = await this.db
      .from("valuation_snapshots")
      .select("value, as_of_date, source")
      .eq("security_id", securityId)
      .eq("metric", metric)
      .eq("value_origin", "provider")
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("getProviderValuation", error);
    return data ? { value: num(data.value), asOfDate: data.as_of_date, source: data.source } : null;
  }
}
