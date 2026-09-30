import type { SharesOutstandingRef, StoredPriceHistory } from "@/data/repositories/price-history-repository";
import type { SecurityMarketSnapshot } from "@/domain/market-data";
import { DEFAULT_RETURN_BASIS, RETURN_BASIS_MODE, type ReturnBasis, type VolumeBasis } from "@/domain/prices";
import type { Provenance } from "@/domain/provenance";
import type { SecuritySummary } from "@/domain/reference";
import { adjustBars } from "@/lib/calculations/adjustments";
import { ema } from "@/lib/calculations/indicators";
import { isLikelyMultiClass, type MarketCapCheck, verifyMarketCap } from "@/lib/calculations/market-cap";
import { computeIndicators, toSecurityMarketSnapshot } from "@/lib/calculations/market-snapshot";
import type { Repositories } from "./market-rows";

/**
 * Datos de mercado REALES de una ficha (Fase 2B.1). Solo existen para los valores con precios
 * sincronizados; el resto devuelve `demo` y la página mantiene el comportamiento de Fase 1.
 * Nunca se mezclan: o toda la cabecera es real o toda es DEMO.
 */

/** Etiquetas legibles de proveedores (la procedencia técnica viaja en `source`). */
const SOURCE_LABELS: Readonly<Record<string, string>> = { eodhd: "EODHD", alpaca: "Alpaca (SIP)" };

export interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface ChartOverlay {
  id: string;
  label: string;
  points: { time: string; value: number }[];
}

export interface CompanyChartData {
  bars: ChartBar[];
  overlays: ChartOverlay[];
  basis: ReturnBasis;
  currency: string;
  /** Base del volumen almacenado: raw (MarketRadar lo ajusta por splits) o ya ajustado por el proveedor. */
  volumeBasis: VolumeBasis;
}

export interface RealMarketData {
  kind: "real";
  snapshot: SecurityMarketSnapshot;
  provenance: Provenance;
  chart: CompanyChartData;
  shares: SharesOutstandingRef | null;
  /** Verificación de la capitalización calculada (solo VERIFIED llega a snapshot.marketCap). */
  marketCap: MarketCapCheck;
  /** Nº de barras almacenadas y primera sesión (para mostrar la cobertura). */
  firstSession: string;
  /** Control de calidad de la serie (último sync). */
  quality: { status: StoredPriceHistory["qualityStatus"]; notes: StoredPriceHistory["qualityNotes"] };
  feed: string | null;
}

export type CompanyMarketData = RealMarketData | { kind: "demo" };

const EMA_OVERLAYS = [20, 50, 200] as const;
const round = (value: number) => Math.round(value * 1e4) / 1e4;

export async function getCompanyMarketData(
  repos: Repositories,
  security: SecuritySummary,
  options: { listingsOfIssuer: number } = { listingsOfIssuer: 1 },
): Promise<CompanyMarketData> {
  const history = await repos.priceHistory.getPriceHistory(security.securityId);
  const last = history?.bars.at(-1);
  const first = history?.bars[0];
  if (!history || !last || !first) return { kind: "demo" };

  const basis = DEFAULT_RETURN_BASIS;
  const adjusted = adjustBars(history.bars, history.factors, { mode: RETURN_BASIS_MODE[basis], volumeBasis: history.volumeBasis });
  const [shares, providerMarketCap, dilutedShares, basicShares] = await Promise.all([
    repos.priceHistory.getLatestSharesOutstanding(security.securityId),
    repos.priceHistory.getProviderValuation(security.securityId, "market_cap"),
    // Referencias oficiales independientes: acciones medias diluidas y básicas del último trimestre (SEC).
    repos.fundamentals.getLatestValue(security.companyId, "sec", "weighted_average_shares_diluted", "quarterly"),
    repos.fundamentals.getLatestValue(security.companyId, "sec", "weighted_average_shares_basic", "quarterly"),
  ]);
  const indicators = computeIndicators(adjusted);
  if (!indicators) return { kind: "demo" };
  const marketCap = verifyMarketCap({
    price: indicators.close,
    priceDate: last.tradeDate,
    shares: shares ? { value: shares.shares, asOfDate: shares.asOfDate } : null,
    providerMarketCap: providerMarketCap ? { value: providerMarketCap.value, asOfDate: providerMarketCap.asOfDate } : null,
    referenceShares: dilutedShares?.value ? { value: dilutedShares.value, asOfDate: dilutedShares.fiscalPeriodEnd } : null,
    alternateReferenceShares: basicShares?.value ? { value: basicShares.value, asOfDate: basicShares.fiscalPeriodEnd } : null,
    splits: history.factors.filter((f) => f.kind === "split").map((f) => ({ exDate: f.exDate, shareFactor: f.volumeFactor })),
    isMultiClass: isLikelyMultiClass({ ticker: security.ticker, shareClass: security.shareClass, listingsOfIssuer: options.listingsOfIssuer }),
  });
  // Misma verificación que listas/heatmap: si el sync materializó la instantánea de esta sesión, su estado
  // (incluida la verificación por clase de la portada XBRL) es el que manda.
  const stored = (await repos.marketData.getSnapshots([{ securityId: security.securityId, ticker: security.ticker, currency: security.currency }])).data.get(security.securityId);
  if (stored?.asOfDate && stored.asOfDate === last.tradeDate) {
    marketCap.status = stored.marketCapStatus;
    marketCap.reason = (stored.marketCapReason ?? marketCap.reason) as typeof marketCap.reason;
    if (stored.marketCapStatus === "VERIFIED") marketCap.calculated = stored.marketCap;
  }
  // Nunca se publica una capitalización no verificada.
  const snapshot = toSecurityMarketSnapshot(security.securityId, security.currency, indicators, { value: marketCap.calculated, status: marketCap.status, reason: marketCap.reason });

  const closes = adjusted.map((b) => b.close);
  const overlays: ChartOverlay[] = EMA_OVERLAYS.map((period) => {
    const values = ema(closes, period);
    const points: ChartOverlay["points"] = [];
    values.forEach((value, i) => {
      const bar = adjusted[i];
      if (value !== null && bar) points.push({ time: bar.tradeDate, value: round(value) });
    });
    return { id: `ema${period}`, label: `EMA ${period}`, points };
  });

  return {
    kind: "real",
    snapshot,
    shares,
    marketCap,
    firstSession: first.tradeDate,
    provenance: {
      source: history.source,
      sourceLabel: SOURCE_LABELS[history.source] ?? history.source,
      asOf: last.tradeDate,
      isDelayed: true,
      isDemo: false,
      frequency: "eod",
      dataset: history.datasetKey ?? undefined,
      ingestedAt: history.lastIngestedAt,
    },
    quality: { status: history.qualityStatus, notes: history.qualityNotes },
    feed: history.feed,
    chart: {
      basis,
      volumeBasis: history.volumeBasis,
      currency: security.currency,
      bars: adjusted.map((b) => ({
        time: b.tradeDate,
        open: round(b.open),
        high: round(b.high),
        low: round(b.low),
        close: round(b.close),
        volume: b.volume,
      })),
      overlays,
    },
  };
}
