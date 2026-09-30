import "server-only";
import { DataAccessError } from "@/data/errors";
import type { MarketDataRepository, MarketDataStatusSummary, SecurityRef } from "@/data/repositories/market-data-repository";
import type { BenchmarkDefinition, BenchmarkQuote, SecurityMarketSnapshot } from "@/domain/market-data";
import type { Provenance, WithProvenance } from "@/domain/provenance";
import type { Tables } from "./database.types";
import { num, numOrNull } from "./market-mappers";
import type { MarketRadarSupabase } from "./server-client";

/** Etiquetas legibles de proveedores de precios. */
export const PRICE_SOURCE_LABELS: Readonly<Record<string, string>> = { alpaca: "Alpaca (SIP)", eodhd: "EODHD" };

const CHUNK = 150; // ids por consulta (longitud de URL de PostgREST)

type SnapshotRow = Tables<"security_market_snapshots">;

export function rowToSnapshot(r: SnapshotRow, currency: string): SecurityMarketSnapshot {
  return {
    securityId: r.security_id,
    currency,
    asOfDate: r.as_of_date,
    price: num(r.close),
    previousClose: numOrNull(r.previous_close),
    returns: {
      "1D": numOrNull(r.return_1d),
      "1W": numOrNull(r.return_1w),
      "1M": numOrNull(r.return_1m),
      "3M": numOrNull(r.return_3m),
      "6M": numOrNull(r.return_6m),
      YTD: numOrNull(r.return_ytd),
      "1Y": numOrNull(r.return_1y),
      "3Y": numOrNull(r.return_3y),
      "5Y": numOrNull(r.return_5y),
    },
    marketCap: r.market_cap_status === "VERIFIED" ? numOrNull(r.market_cap) : null,
    marketCapStatus: r.market_cap_status as SecurityMarketSnapshot["marketCapStatus"],
    marketCapReason: r.market_cap_reason,
    volume: numOrNull(r.volume),
    averageVolume20: numOrNull(r.average_volume20),
    relativeVolume: numOrNull(r.relative_volume),
    averageDollarVolume20: numOrNull(r.average_dollar_volume20),
    rsi14: numOrNull(r.rsi14),
    sma20: numOrNull(r.sma20),
    sma50: numOrNull(r.sma50),
    sma200: numOrNull(r.sma200),
    ema20: numOrNull(r.ema20),
    ema50: numOrNull(r.ema50),
    ema200: numOrNull(r.ema200),
    macd: numOrNull(r.macd),
    macdSignal: numOrNull(r.macd_signal),
    macdHistogram: numOrNull(r.macd_histogram),
    atr14: numOrNull(r.atr14),
    high52w: numOrNull(r.high_52w),
    low52w: numOrNull(r.low_52w),
    isNew52wHigh: r.is_new_52w_high,
    isNew52wLow: r.is_new_52w_low,
  };
}

/**
 * Datos de mercado REALES para listas, heatmaps, rankings y agregados: lee las instantáneas que
 * materializa el job de sync (`security_market_snapshots`, una fila por security).
 *
 *   * Solo entran instantáneas de la sesión más reciente del conjunto: una serie desfasada no se
 *     mezcla con las demás (queda como sin dato y el panel pasa a PARTIAL).
 *   * Si NINGUNA security tiene datos reales, devuelve null y el llamador decide (DEMO explícito).
 */
export class SupabaseMarketDataRepository {
  constructor(private readonly db: MarketRadarSupabase) {}

  getStatus(): Promise<MarketDataStatusSummary> {
    return readMarketStatus(this.db);
  }

  async getRealSnapshots(securities: readonly SecurityRef[]): Promise<WithProvenance<Map<string, SecurityMarketSnapshot>> | null> {
    const rows: SnapshotRow[] = [];
    const ids = securities.map((s) => s.securityId);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await this.db.from("security_market_snapshots").select("*").in("security_id", ids.slice(i, i + CHUNK));
      if (error) throw new DataAccessError("Database query failed (getRealSnapshots)", "getRealSnapshots", { cause: error });
      rows.push(...data);
    }
    if (rows.length === 0) return null;
    const asOf = rows.reduce((max, r) => (r.as_of_date > max ? r.as_of_date : max), "");
    const currency = new Map(securities.map((s) => [s.securityId, s.currency]));
    const current = rows.filter((r) => r.as_of_date === asOf);
    const sources = [...new Set(current.map((r) => r.source))];
    const computedAt = current.reduce((max, r) => (r.computed_at > max ? r.computed_at : max), "");
    const provenance: Provenance = {
      source: sources.join("+"),
      sourceLabel: `${sources.map((s) => PRICE_SOURCE_LABELS[s] ?? s).join(" + ")} · indicators by MarketRadar`,
      asOf,
      isDelayed: true,
      isDemo: false,
      frequency: "eod",
      ingestedAt: computedAt || undefined,
      coverage: { covered: current.length, total: securities.length },
    };
    return {
      data: new Map(current.map((r) => [r.security_id, rowToSnapshot(r, currency.get(r.security_id) ?? "USD")])),
      provenance,
    };
  }
}

export async function readMarketStatus(db: MarketRadarSupabase): Promise<MarketDataStatusSummary> {
  const latest = await db.from("security_market_snapshots").select("as_of_date, source").order("as_of_date", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new DataAccessError("Database query failed (market status)", "marketStatus", { cause: latest.error });
  if (!latest.data) return { realSecurities: 0, asOf: null, sourceLabel: null };
  const count = await db.from("security_market_snapshots").select("security_id", { count: "exact", head: true }).eq("as_of_date", latest.data.as_of_date);
  if (count.error) throw new DataAccessError("Database query failed (market status)", "marketStatus", { cause: count.error });
  return { realSecurities: count.count ?? 0, asOf: latest.data.as_of_date, sourceLabel: PRICE_SOURCE_LABELS[latest.data.source] ?? latest.data.source };
}

/**
 * Repositorio de la app: datos reales si existen; DEMO completo (y etiquetado) solo si no hay
 * ninguno. Nunca rellena con valores simulados a las securities que faltan.
 * Los benchmarks (índices, VIX, DXY, materias primas, tipos) no tienen fuente gratuita: siguen DEMO.
 */
export class RealFirstMarketDataRepository implements MarketDataRepository {
  constructor(
    private readonly real: SupabaseMarketDataRepository,
    private readonly demo: MarketDataRepository,
  ) {}

  async getSnapshots(securities: readonly SecurityRef[]) {
    return (await this.real.getRealSnapshots(securities)) ?? this.demo.getSnapshots(securities);
  }

  async getBenchmarkQuotes(benchmarks: readonly BenchmarkDefinition[]): Promise<WithProvenance<BenchmarkQuote[]>> {
    return this.demo.getBenchmarkQuotes(benchmarks);
  }

  getStatus(): Promise<MarketDataStatusSummary> {
    return this.real.getStatus();
  }
}
