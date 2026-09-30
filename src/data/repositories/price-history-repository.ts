import type { DailyBar, VolumeBasis } from "@/domain/prices";
import type { ValuationMetric } from "@/domain/valuation";
import type { AdjustmentFactor } from "@/lib/calculations/adjustments";

/**
 * Histórico de precios SINCRONIZADO (Fase 2B) leído de NUESTRA base de datos.
 * La UI nunca consulta al proveedor: los jobs escriben y este repositorio lee.
 */
export interface StoredPriceHistory {
  securityId: string;
  /** Barras SIN ajustar (fuente de verdad), orden cronológico. */
  bars: DailyBar[];
  volumeBasis: VolumeBasis;
  /** Factores calculados por MarketRadar a partir de las acciones corporativas. */
  factors: AdjustmentFactor[];
  /** Proveedor de la serie (`price_series.source`; una sola fuente por serie) y dataset de procedencia. */
  source: string;
  /** Feed del proveedor (Alpaca: "sip"). */
  feed: string | null;
  datasetKey: string | null;
  datasetName: string | null;
  /** Última descarga de la serie. */
  lastIngestedAt: string;
  /** Control de calidad del último sync (PASS / WARNING / MISSING / FAIL) y sus motivos. */
  qualityStatus: "PASS" | "WARNING" | "MISSING" | "FAIL" | null;
  qualityNotes: { kind: string; message: string }[];
}

export interface SharesOutstandingRef {
  shares: number;
  asOfDate: string;
  source: string;
}

export interface ProviderValuationRef {
  value: number;
  asOfDate: string;
  source: string;
}

export interface PriceHistoryRepository {
  /** null ⇒ el valor no tiene datos sincronizados (la UI sigue en DEMO). */
  getPriceHistory(securityId: string): Promise<StoredPriceHistory | null>;
  getLatestSharesOutstanding(securityId: string): Promise<SharesOutstandingRef | null>;
  /** Último valor PUBLICADO POR EL PROVEEDOR de una métrica de valoración (p. ej. market_cap). */
  getProviderValuation(securityId: string, metric: ValuationMetric): Promise<ProviderValuationRef | null>;
}
