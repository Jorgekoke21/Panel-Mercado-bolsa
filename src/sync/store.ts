import type { CorporateAction } from "@/domain/corporate-actions";
import type { EarningsEstimate, EarningsEvent } from "@/domain/earnings";
import type { FinancialStatementValue, LineItemCoverage, SharesOutstandingPoint } from "@/domain/fundamentals";
import type { MarketSession } from "@/domain/market-calendar";
import type { DailyBar, VolumeBasis } from "@/domain/prices";
import type { ValuationValue } from "@/domain/valuation";
import type { AdjustmentFactor } from "@/lib/calculations/adjustments";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";
import type { IndustryTemplate } from "@/providers/sec/concepts";
import type { SecEntityProfile, SecFiling } from "@/providers/sec/parse";

/**
 * Persistencia de los jobs de sincronización (puerto). Implementaciones:
 *   * SupabaseSyncStore: escribe con service_role (solo CLI de sync).
 *   * MemorySyncStore: tests (misma semántica de claves naturales que la base de datos).
 *
 * Todas las escrituras son UPSERT sobre la clave natural ⇒ ejecutar un job dos veces no duplica.
 */

export interface SyncSecurity {
  securityId: string;
  companyId: string;
  ticker: string;
  exchangeMic: string;
  currency: string;
  companyName: string;
  cik: string | null;
  isin: string | null;
  shareClass: string | null;
  isPrimary: boolean;
  /** Nº de valores del mismo emisor en el universo (≥ 2 ⇒ multiclase). */
  listingsOfIssuer: number;
  /** Otros nombres oficiales del emisor (p. ej. nombre registrado en la SEC) para verificar identidades. */
  alternateNames?: string[];
  /** Grupos para índices sintéticos: "sector:<id>", "industry_group:<id>", "industry:<id>", "sub_industry:<id>", "index:<slug>". */
  groups?: string[];
}

/** Fila de security_share_classes (acciones por clase desde la portada XBRL del filing). */
export interface StoredShareClass {
  securityId: string;
  companyId: string;
  accessionNumber: string;
  form: string | null;
  periodEnd: string | null;
  classMember: string | null;
  resolvedVia: "symbol_dimension" | "security_title" | "single_class" | null;
  shares: number | null;
  sharesAsOf: string | null;
  checkStatus: "consistent" | "inconsistent" | "no_reference" | "unresolved";
  checkRule: "class_weighted_average" | "all_classes_total" | "listed_class_total" | null;
  referenceShares: number | null;
  referenceKind: "basic" | "diluted" | null;
  referencePeriodEnd: string | null;
  deviation: number | null;
  note: string | null;
  source: string;
  datasetId: string;
  computedAt: string;
}

/** Fila de group_index_series (índice sintético de MarketRadar, no oficial). */
export interface StoredGroupIndex {
  groupKind: "index" | "sector" | "industry_group" | "industry" | "sub_industry";
  groupKey: string;
  method: "equal_weight" | "cap_weight";
  exchangeMic: string;
  startDate: string;
  endDate: string;
  levels: number[];
  membersTotal: number;
  membersLast: number;
  source: string;
  computedAt: string;
}

export interface IdentifierRecord {
  id: string;
  securityId: string;
  provider: string;
  symbol: string;
  exchangeCode: string | null;
  source: "rule" | "manual" | "provider";
  verifiedAt: string | null;
}

/** Procedencia que acompaña a cada escritura. */
export interface WriteProvenance {
  source: string;
  datasetId: string;
  ingestedAt: string;
}

export interface SyncCursor {
  provider: string;
  jobType: string;
  securityId: string;
  lastValue: string | null;
  fullRefreshRequired: boolean;
  lastSuccessAt: string | null;
  lastRunId: string | null;
}

export type SyncRunStatus = "running" | "succeeded" | "partial" | "failed";

export interface SyncIssue {
  security: string | null;
  kind: string;
  message: string;
}

export interface SyncRunStart {
  provider: string;
  jobType: string;
  scope: string;
  params: Record<string, unknown>;
  startedAt: string;
}

export interface SyncRunFinish {
  status: Exclude<SyncRunStatus, "running">;
  finishedAt: string;
  recordsRead: number;
  recordsWritten: number;
  requestsMade: number | null;
  creditsUsed: number | null;
  creditsEstimated: number | null;
  errors: SyncIssue[];
  warnings: SyncIssue[];
}

export interface StoredDailyBars {
  bars: DailyBar[];
  /** null si no hay serie. */
  volumeBasis: VolumeBasis | null;
  source: string | null;
  seriesId: number | null;
}

export type QualityStatus = "PASS" | "WARNING" | "MISSING" | "FAIL";

/** Una serie de precios por security, de UNA sola fuente (tabla price_series). */
export interface PriceSeriesRecord {
  id: number;
  securityId: string;
  source: string;
  volumeBasis: VolumeBasis;
  feed: string | null;
  firstDate: string | null;
  lastDate: string | null;
  barCount: number;
  fullLoadedAt: string | null;
  lastIngestedAt: string | null;
  qualityStatus: QualityStatus | null;
}

export interface PriceSeriesSpec {
  source: string;
  datasetId: string;
  volumeBasis: VolumeBasis;
  feed: string | null;
  currency: string;
}

export interface QualityNote {
  severity: "info" | "warning" | "fail";
  kind: string;
  message: string;
}

/** Fila de security_market_snapshots (valores ya calculados por MarketRadar). */
export interface StoredMarketSnapshot {
  securityId: string;
  seriesId: number;
  source: string;
  asOfDate: string;
  barCount: number;
  firstDate: string;
  close: number;
  previousClose: number | null;
  volume: number | null;
  returns: Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y", number | null>;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  averageVolume20: number | null;
  relativeVolume: number | null;
  averageDollarVolume20: number | null;
  high52w: number | null;
  low52w: number | null;
  isNew52wHigh: boolean;
  isNew52wLow: boolean;
  marketCap: number | null;
  marketCapStatus: "VERIFIED" | "UNVERIFIED" | "MISSING";
  marketCapReason: string;
  marketCapShares: number | null;
  marketCapSharesAsOf: string | null;
  computedAt: string;
}

export interface SyncStore {
  resolveDatasetId(key: string): Promise<string>;
  findSecuritiesByTicker(tickers: readonly string[]): Promise<SyncSecurity[]>;
  /** Valores actuales de un índice (p. ej. "sp500"), ordenados por ticker. */
  listIndexSecurities(indexSlug: string): Promise<SyncSecurity[]>;

  upsertSecEntity(companyId: string, profile: SecEntityProfile, template: IndustryTemplate, prov: WriteProvenance): Promise<void>;
  upsertSecFilings(companyId: string, filings: readonly SecFiling[], prov: WriteProvenance): Promise<number>;
  /** Sustituye los valores de (emisor, fuente): upsert + borrado de claves que ya no existen. */
  replaceStatementValues(
    companyId: string,
    sourceSecurityId: string,
    values: readonly FinancialStatementValue[],
    prov: WriteProvenance,
  ): Promise<{ written: number; removed: number }>;
  replaceCoverage(companyId: string, coverage: readonly LineItemCoverage[], prov: WriteProvenance): Promise<number>;
  upsertFundamentalSnapshot(companyId: string, snapshot: FundamentalSnapshot, prov: WriteProvenance): Promise<void>;

  getActiveIdentifier(provider: string, securityId: string): Promise<IdentifierRecord | null>;
  insertIdentifier(input: Omit<IdentifierRecord, "id" | "verifiedAt">): Promise<IdentifierRecord>;
  markIdentifierVerified(id: string, note: string, at: string): Promise<void>;

  getPriceSeries(securityId: string): Promise<PriceSeriesRecord | null>;
  /**
   * Abre la serie de la security para `spec.source`. Si existía con OTRA fuente, borra todas sus
   * barras y la reasigna (una serie nunca mezcla fuentes). Devuelve la fuente anterior y las barras borradas.
   */
  openPriceSeries(securityId: string, spec: PriceSeriesSpec): Promise<{ series: PriceSeriesRecord; switchedFrom: string | null; removedBars: number }>;
  /** Upsert por (serie, fecha). Devuelve cuántas barras son nuevas o han cambiado. */
  upsertDailyBars(seriesId: number, bars: readonly DailyBar[]): Promise<number>;
  /** Carga completa: borra barras anteriores a la primera sesión recibida (histórico recortado o relleno descartado). */
  deleteBarsBefore(seriesId: number, date: string): Promise<number>;
  /** Recalcula primera/última fecha y nº de barras tras una descarga. */
  finalizeSeriesLoad(seriesId: number, input: { ingestedAt: string; fullLoad: boolean }): Promise<PriceSeriesRecord>;
  setSeriesQuality(seriesId: number, status: QualityStatus, notes: readonly QualityNote[], checkedAt: string): Promise<void>;
  getDailyBars(securityId: string): Promise<StoredDailyBars>;

  replaceMarketSessions(exchangeMic: string, sessions: readonly MarketSession[], source: string): Promise<number>;
  getMarketSessions(exchangeMic: string, from: string, to: string): Promise<MarketSession[]>;

  /** Acciones en circulación más recientes de la security (cualquier fuente/base). */
  getLatestShares(securityId: string): Promise<{ shares: number; asOfDate: string; source: string } | null>;
  /** Último valor trimestral reportado de una partida del emisor (p. ej. acciones medias diluidas). */
  getLatestQuarterlyValue(companyId: string, source: string, lineItem: string): Promise<{ value: number; periodEnd: string } | null>;
  upsertMarketSnapshot(snapshot: StoredMarketSnapshot): Promise<void>;
  /** Último 10-Q/10-K (original) del emisor. */
  getLatestPeriodicFiling(companyId: string): Promise<{ accessionNumber: string; form: string; reportDate: string | null } | null>;
  upsertShareClass(record: StoredShareClass): Promise<void>;
  getShareClass(securityId: string): Promise<StoredShareClass | null>;
  /** Securities con registro de clase y estado actual de su capitalización (para elegir a quién refrescar). */
  listShareClassSecurityIds(): Promise<Set<string>>;
  getMarketCapStatuses(): Promise<Map<string, string>>;
  /** Histórico de acciones de portada (SEC) de una security, orden cronológico. */
  getSharesHistory(securityId: string): Promise<{ asOfDate: string; shares: number }[]>;
  /** Sustituye todas las series sintéticas de grupo (derivadas, reconstruibles). */
  replaceGroupIndices(rows: readonly StoredGroupIndex[]): Promise<number>;
  /** Bloqueo con caducidad: true si se adquiere (o estaba caducado). */
  acquireLease(name: string, holder: string, ttlMs: number, now: Date): Promise<boolean>;
  releaseLease(name: string, holder: string): Promise<void>;
  /** Borra ejecuciones terminadas anteriores a `before` (retención de la observabilidad). */
  pruneSyncRuns(before: string): Promise<number>;

  /** Sustituye el conjunto de acciones de (valor, fuente): upsert + borrado de las que ya no existen. */
  replaceCorporateActions(
    securityId: string,
    actions: readonly CorporateAction[],
    prov: WriteProvenance,
  ): Promise<{ written: number; removed: string[] }>;
  /** Acciones corporativas de un valor; con `source`, solo las de ese proveedor. */
  getCorporateActions(securityId: string, source?: string): Promise<CorporateAction[]>;
  replaceAdjustmentFactors(securityId: string, factors: readonly AdjustmentFactor[], inputSource: string, computedAt: string): Promise<number>;

  upsertShares(securityId: string, points: readonly SharesOutstandingPoint[], prov: WriteProvenance): Promise<number>;
  upsertStatementValues(companyId: string, sourceSecurityId: string, values: readonly FinancialStatementValue[], prov: WriteProvenance): Promise<number>;
  upsertEarningsEvents(companyId: string, sourceSecurityId: string, events: readonly EarningsEvent[], prov: WriteProvenance): Promise<number>;
  upsertEarningsEstimates(
    companyId: string,
    sourceSecurityId: string,
    asOf: string | null,
    estimates: readonly EarningsEstimate[],
    prov: WriteProvenance,
  ): Promise<number>;
  upsertValuations(securityId: string, asOf: string, values: readonly ValuationValue[], prov: WriteProvenance): Promise<number>;

  getCursor(provider: string, jobType: string, securityId: string): Promise<SyncCursor | null>;
  saveCursor(cursor: SyncCursor): Promise<void>;

  startRun(input: SyncRunStart): Promise<string>;
  finishRun(id: string, result: SyncRunFinish): Promise<void>;
}
