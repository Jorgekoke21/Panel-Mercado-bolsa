import type { PriceHistoryRepository, ProviderValuationRef, SharesOutstandingRef, StoredPriceHistory } from "@/data/repositories/price-history-repository";
import type { ValuationMetric } from "@/domain/valuation";

/** Implementación en memoria (tests). Sin datos ⇒ todos los valores siguen en DEMO. */
export class MemoryPriceHistoryRepository implements PriceHistoryRepository {
  constructor(
    private readonly histories: ReadonlyMap<string, StoredPriceHistory> = new Map(),
    private readonly shares: ReadonlyMap<string, SharesOutstandingRef> = new Map(),
    /** Clave: `${securityId}:${metric}`. */
    private readonly valuations: ReadonlyMap<string, ProviderValuationRef> = new Map(),
  ) {}

  async getProviderValuation(securityId: string, metric: ValuationMetric) {
    return this.valuations.get(`${securityId}:${metric}`) ?? null;
  }

  async getPriceHistory(securityId: string) {
    return this.histories.get(securityId) ?? null;
  }

  async getLatestSharesOutstanding(securityId: string) {
    return this.shares.get(securityId) ?? null;
  }
}
