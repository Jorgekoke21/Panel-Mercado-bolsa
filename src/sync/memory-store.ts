import type { CorporateAction } from "@/domain/corporate-actions";
import { actionType } from "@/domain/corporate-actions";
import type { EarningsEstimate, EarningsEvent } from "@/domain/earnings";
import type { FinancialStatementValue, LineItemCoverage, SharesOutstandingPoint } from "@/domain/fundamentals";
import type { IndustryTemplate } from "@/providers/sec/concepts";
import type { SecEntityProfile, SecFiling } from "@/providers/sec/parse";
import type { MarketSession } from "@/domain/market-calendar";
import type { DailyBar } from "@/domain/prices";
import type { ValuationValue } from "@/domain/valuation";
import type { AdjustmentFactor } from "@/lib/calculations/adjustments";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";
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

/**
 * SyncStore en memoria para tests. Cada tabla es un Map indexado por la MISMA clave natural que
 * la clave primaria/única de la base de datos, así que reproduce la semántica de upsert.
 */
export class MemorySyncStore implements SyncStore {
  readonly identifiers = new Map<string, IdentifierRecord>();
  /** Clave `${seriesId}:${fecha}` (misma PK que daily_bars). */
  readonly dailyPrices = new Map<string, DailyBar & { seriesId: number }>();
  readonly corporateActions = new Map<string, CorporateAction & { securityId: string; source: string }>();
  readonly factors = new Map<string, AdjustmentFactor & { securityId: string }>();
  readonly shares = new Map<string, SharesOutstandingPoint>();
  readonly statements = new Map<string, FinancialStatementValue>();
  readonly earningsEvents = new Map<string, EarningsEvent>();
  readonly earningsEstimates = new Map<string, EarningsEstimate>();
  readonly valuations = new Map<string, ValuationValue>();
  readonly cursors = new Map<string, SyncCursor>();
  readonly runs = new Map<string, SyncRunStart & Omit<Partial<SyncRunFinish>, "status"> & { status: string }>();
  private seq = 0;

  constructor(
    private readonly securities: readonly SyncSecurity[],
    private readonly datasets: Readonly<Record<string, string>> = {},
  ) {}

  async resolveDatasetId(key: string) {
    return this.datasets[key] ?? `dataset:${key}`;
  }

  readonly secEntities = new Map<string, { profile: SecEntityProfile; template: IndustryTemplate }>();
  readonly secFilings = new Map<string, SecFiling & { companyId: string }>();
  readonly coverage = new Map<string, LineItemCoverage>();

  async listIndexSecurities() {
    return [...this.securities].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async upsertSecEntity(companyId: string, profile: SecEntityProfile, template: IndustryTemplate) {
    this.secEntities.set(companyId, { profile, template });
  }

  async upsertSecFilings(companyId: string, filings: readonly SecFiling[]) {
    for (const f of filings) this.secFilings.set(f.accessionNumber, { ...f, companyId });
    return filings.length;
  }

  async replaceStatementValues(companyId: string, _src: string, values: readonly FinancialStatementValue[], prov: WriteProvenance) {
    const prefix = `${companyId}:${prov.source}:`;
    const keyOf = (v: FinancialStatementValue) => `${prefix}${v.lineItem}:${v.periodType}:${v.fiscalPeriodEnd}:${v.origin}`;
    const keep = new Set(values.map(keyOf));
    let removed = 0;
    for (const key of [...this.statements.keys()]) {
      if (key.startsWith(prefix) && !keep.has(key)) {
        this.statements.delete(key);
        removed++;
      }
    }
    for (const v of values) this.statements.set(keyOf(v), v);
    return { written: values.length, removed };
  }

  readonly snapshots = new Map<string, FundamentalSnapshot>();

  async upsertFundamentalSnapshot(companyId: string, snapshot: FundamentalSnapshot) {
    this.snapshots.set(companyId, snapshot);
  }

  async replaceCoverage(companyId: string, coverage: readonly LineItemCoverage[], prov: WriteProvenance) {
    for (const key of [...this.coverage.keys()]) if (key.startsWith(`${companyId}:${prov.source}:`)) this.coverage.delete(key);
    for (const c of coverage) this.coverage.set(`${companyId}:${prov.source}:${c.lineItem}`, c);
    return coverage.length;
  }

  async findSecuritiesByTicker(tickers: readonly string[]) {
    return this.securities.filter((s) => tickers.includes(s.ticker));
  }

  async getActiveIdentifier(provider: string, securityId: string) {
    return this.identifiers.get(`${provider}:${securityId}`) ?? null;
  }

  async insertIdentifier(input: Omit<IdentifierRecord, "id" | "verifiedAt">) {
    const key = `${input.provider}:${input.securityId}`;
    if (this.identifiers.has(key)) throw new Error(`duplicate identifier ${key}`);
    const record: IdentifierRecord = { ...input, id: `id-${++this.seq}`, verifiedAt: null };
    this.identifiers.set(key, record);
    return record;
  }

  async markIdentifierVerified(id: string, _note: string, at: string) {
    for (const record of this.identifiers.values()) if (record.id === id) record.verifiedAt = at;
  }

  readonly series = new Map<string, PriceSeriesRecord & { notes: QualityNote[] }>();
  readonly sessions = new Map<string, MarketSession[]>();
  readonly marketSnapshots = new Map<string, StoredMarketSnapshot>();
  /** Filas de financial_statement_values leídas por getLatestQuarterlyValue (clave companyId:source:lineItem). */
  readonly latestQuarterly = new Map<string, { value: number; periodEnd: string }>();
  private seriesSeq = 0;

  private seriesById(id: number) {
    for (const s of this.series.values()) if (s.id === id) return s;
    throw new Error(`unknown series ${id}`);
  }

  async getPriceSeries(securityId: string): Promise<PriceSeriesRecord | null> {
    const s = this.series.get(securityId);
    if (!s) return null;
    return {
      id: s.id,
      securityId: s.securityId,
      source: s.source,
      volumeBasis: s.volumeBasis,
      feed: s.feed,
      firstDate: s.firstDate,
      lastDate: s.lastDate,
      barCount: s.barCount,
      fullLoadedAt: s.fullLoadedAt,
      lastIngestedAt: s.lastIngestedAt,
      qualityStatus: s.qualityStatus,
    };
  }

  async openPriceSeries(securityId: string, spec: PriceSeriesSpec) {
    const current = this.series.get(securityId);
    if (current && current.source === spec.source) {
      current.feed = spec.feed;
      current.volumeBasis = spec.volumeBasis;
      return { series: (await this.getPriceSeries(securityId)) as PriceSeriesRecord, switchedFrom: null, removedBars: 0 };
    }
    let removedBars = 0;
    if (current) {
      for (const key of [...this.dailyPrices.keys()]) {
        if (key.startsWith(`${current.id}:`)) {
          this.dailyPrices.delete(key);
          removedBars++;
        }
      }
    }
    const id = current?.id ?? ++this.seriesSeq;
    this.series.set(securityId, {
      id,
      securityId,
      source: spec.source,
      volumeBasis: spec.volumeBasis,
      feed: spec.feed,
      firstDate: null,
      lastDate: null,
      barCount: 0,
      fullLoadedAt: null,
      lastIngestedAt: null,
      qualityStatus: null,
      notes: [],
    });
    return { series: (await this.getPriceSeries(securityId)) as PriceSeriesRecord, switchedFrom: current?.source ?? null, removedBars };
  }

  async upsertDailyBars(seriesId: number, bars: readonly DailyBar[]) {
    let written = 0;
    for (const b of bars) {
      const key = `${seriesId}:${b.tradeDate}`;
      const row = { ...b, volume: b.volume === null ? null : Math.round(b.volume), seriesId };
      const e = this.dailyPrices.get(key);
      if (e && e.open === row.open && e.high === row.high && e.low === row.low && e.close === row.close && e.volume === row.volume && e.providerAdjustedClose === row.providerAdjustedClose) continue;
      this.dailyPrices.set(key, row);
      written++;
    }
    return written;
  }

  async deleteBarsBefore(seriesId: number, date: string) {
    let removed = 0;
    for (const [key, row] of this.dailyPrices) {
      if (row.seriesId === seriesId && row.tradeDate < date) {
        this.dailyPrices.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private barsOf(seriesId: number) {
    return [...this.dailyPrices.values()].filter((r) => r.seriesId === seriesId).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  }

  async finalizeSeriesLoad(seriesId: number, input: { ingestedAt: string; fullLoad: boolean }) {
    const s = this.seriesById(seriesId);
    const rows = this.barsOf(seriesId);
    s.firstDate = rows[0]?.tradeDate ?? null;
    s.lastDate = rows.at(-1)?.tradeDate ?? null;
    s.barCount = rows.length;
    s.lastIngestedAt = input.ingestedAt;
    if (input.fullLoad) s.fullLoadedAt = input.ingestedAt;
    return (await this.getPriceSeries(s.securityId)) as PriceSeriesRecord;
  }

  async setSeriesQuality(seriesId: number, status: QualityStatus, notes: readonly QualityNote[]) {
    const s = this.seriesById(seriesId);
    s.qualityStatus = status;
    s.notes = [...notes];
  }

  async getDailyBars(securityId: string): Promise<StoredDailyBars> {
    const s = this.series.get(securityId);
    if (!s) return { bars: [], volumeBasis: null, source: null, seriesId: null };
    return {
      bars: this.barsOf(s.id).map(({ tradeDate, open, high, low, close, volume, providerAdjustedClose }) => ({ tradeDate, open, high, low, close, volume, providerAdjustedClose })),
      volumeBasis: s.volumeBasis,
      source: s.source,
      seriesId: s.id,
    };
  }

  async replaceMarketSessions(exchangeMic: string, sessions: readonly MarketSession[]) {
    const byDate = new Map((this.sessions.get(exchangeMic) ?? []).map((s) => [s.date, s]));
    for (const s of sessions) byDate.set(s.date, s);
    this.sessions.set(exchangeMic, [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
    return sessions.length;
  }

  async getMarketSessions(exchangeMic: string, from: string, to: string) {
    return (this.sessions.get(exchangeMic) ?? []).filter((s) => s.date >= from && s.date <= to);
  }

  async getLatestShares(securityId: string) {
    let best: { shares: number; asOfDate: string; source: string } | null = null;
    for (const [key, p] of this.shares) {
      if (!key.startsWith(`${securityId}:`)) continue;
      if (!best || p.asOfDate > best.asOfDate) best = { shares: p.shares, asOfDate: p.asOfDate, source: key.split(":")[1] as string };
    }
    return best;
  }

  async getLatestQuarterlyValue(companyId: string, source: string, lineItem: string) {
    return this.latestQuarterly.get(`${companyId}:${source}:${lineItem}`) ?? null;
  }

  readonly groupIndices = new Map<string, StoredGroupIndex>();
  readonly leases = new Map<string, { holder: string; expiresAt: number }>();

  readonly shareClasses = new Map<string, StoredShareClass>();
  readonly periodicFilings = new Map<string, { accessionNumber: string; form: string; reportDate: string | null }>();

  async getLatestPeriodicFiling(companyId: string) {
    return this.periodicFilings.get(companyId) ?? null;
  }

  async upsertShareClass(record: StoredShareClass) {
    this.shareClasses.set(record.securityId, record);
  }

  async getShareClass(securityId: string) {
    return this.shareClasses.get(securityId) ?? null;
  }

  async listShareClassSecurityIds() {
    return new Set(this.shareClasses.keys());
  }

  async getMarketCapStatuses() {
    return new Map([...this.marketSnapshots.values()].map((s) => [s.securityId, s.marketCapStatus as string]));
  }

  async getSharesHistory(securityId: string) {
    return [...this.shares.entries()]
      .filter(([key, p]) => key.startsWith(`${securityId}:`) && p.basis === "cover_page")
      .map(([, p]) => ({ asOfDate: p.asOfDate, shares: p.shares }))
      .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  }

  async replaceGroupIndices(rows: readonly StoredGroupIndex[]) {
    this.groupIndices.clear();
    for (const r of rows) this.groupIndices.set(`${r.groupKind}:${r.groupKey}:${r.method}`, r);
    return rows.length;
  }

  async acquireLease(name: string, holder: string, ttlMs: number, now: Date) {
    const current = this.leases.get(name);
    if (current && current.expiresAt > now.getTime() && current.holder !== holder) return false;
    this.leases.set(name, { holder, expiresAt: now.getTime() + ttlMs });
    return true;
  }

  async pruneSyncRuns(before: string) {
    let removed = 0;
    for (const [id, run] of this.runs) {
      if (run.finishedAt && run.finishedAt < before) {
        this.runs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async releaseLease(name: string, holder: string) {
    if (this.leases.get(name)?.holder === holder) this.leases.delete(name);
  }

  async upsertMarketSnapshot(snapshot: StoredMarketSnapshot) {
    this.marketSnapshots.set(snapshot.securityId, snapshot);
  }

  async replaceCorporateActions(securityId: string, actions: readonly CorporateAction[], prov: WriteProvenance) {
    const keyOf = (a: CorporateAction) => `${securityId}:${prov.source}:${actionType(a)}:${a.exDate}`;
    const keep = new Set(actions.map(keyOf));
    const removed: string[] = [];
    for (const [key, row] of this.corporateActions) {
      if (row.securityId === securityId && row.source === prov.source && !keep.has(key)) {
        this.corporateActions.delete(key);
        removed.push(`${actionType(row)}:${row.exDate}`);
      }
    }
    for (const a of actions) this.corporateActions.set(keyOf(a), { ...a, securityId, source: prov.source });
    return { written: actions.length, removed };
  }

  async getCorporateActions(securityId: string, source?: string) {
    return [...this.corporateActions.values()]
      .filter((a) => a.securityId === securityId && (!source || a.source === source))
      .sort((a, b) => a.exDate.localeCompare(b.exDate));
  }

  async replaceAdjustmentFactors(securityId: string, factors: readonly AdjustmentFactor[]) {
    for (const [key, f] of this.factors) if (f.securityId === securityId) this.factors.delete(key);
    for (const f of factors) this.factors.set(`${securityId}:${f.exDate}:${f.kind}`, { ...f, securityId });
    return factors.length;
  }

  async upsertShares(securityId: string, points: readonly SharesOutstandingPoint[], prov: WriteProvenance) {
    for (const p of points) this.shares.set(`${securityId}:${prov.source}:${p.basis}:${p.asOfDate}`, p);
    return points.length;
  }

  async upsertStatementValues(companyId: string, _src: string, values: readonly FinancialStatementValue[], prov: WriteProvenance) {
    for (const v of values) this.statements.set(`${companyId}:${prov.source}:${v.lineItem}:${v.periodType}:${v.fiscalPeriodEnd}:${v.origin}`, v);
    return values.length;
  }

  async upsertEarningsEvents(companyId: string, _src: string, events: readonly EarningsEvent[], prov: WriteProvenance) {
    for (const e of events) this.earningsEvents.set(`${companyId}:${prov.source}:${e.fiscalPeriodEnd}`, e);
    return events.length;
  }

  async upsertEarningsEstimates(companyId: string, _src: string, _asOf: string | null, estimates: readonly EarningsEstimate[], prov: WriteProvenance) {
    for (const e of estimates) this.earningsEstimates.set(`${companyId}:${prov.source}:${e.periodEnd}:${e.periodCode}`, e);
    return estimates.length;
  }

  async upsertValuations(securityId: string, asOf: string, values: readonly ValuationValue[], prov: WriteProvenance) {
    for (const v of values) this.valuations.set(`${securityId}:${asOf}:${v.metric}:${v.origin}:${prov.source}`, v);
    return values.length;
  }

  async getCursor(provider: string, jobType: string, securityId: string) {
    return this.cursors.get(`${provider}:${jobType}:${securityId}`) ?? null;
  }

  async saveCursor(cursor: SyncCursor) {
    this.cursors.set(`${cursor.provider}:${cursor.jobType}:${cursor.securityId}`, { ...cursor });
  }

  async startRun(input: SyncRunStart) {
    const id = `run-${++this.seq}`;
    this.runs.set(id, { ...input, status: "running" });
    return id;
  }

  async finishRun(id: string, result: SyncRunFinish) {
    const run = this.runs.get(id);
    if (run) this.runs.set(id, { ...run, ...result });
  }
}
