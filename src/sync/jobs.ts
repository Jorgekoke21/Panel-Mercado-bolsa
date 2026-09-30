import { INCREMENTAL_OVERLAP_DAYS, priceHistoryStart } from "@/config/pilot";
import { lastFinalSession } from "@/domain/market-calendar";
import { adjustBars, computeAdjustmentFactors, type FactorComputation } from "@/lib/calculations/adjustments";
import { isLikelyMultiClass, verifyMarketCap } from "@/lib/calculations/market-cap";
import { computeIndicators } from "@/lib/calculations/market-snapshot";
import { assessSeriesQuality } from "@/lib/calculations/price-quality";
import { GroupIndexAccumulator, sharesOn } from "@/lib/calculations/synthetic-index";
import { deriveFinancials, describeFcfDivergence } from "@/lib/calculations/derived-financials";
import { isProviderError } from "@/providers/errors";
import type { DailyBar } from "@/domain/prices";
import type { ProviderAdapter, ProviderCapability, ProviderDailyBars, ProviderSymbol } from "@/providers/ports";
import type { SymbologyRule } from "@/providers/symbology";
import type {
  IdentifierRecord,
  PriceSeriesRecord,
  QualityNote,
  QualityStatus,
  StoredGroupIndex,
  SyncIssue,
  SyncRunFinish,
  SyncSecurity,
  SyncStore,
  WriteProvenance,
} from "./store";

/**
 * Jobs de sincronización (idempotentes). Flujo:
 *   proveedor (puertos) → dominio canónico → SyncStore (upsert por clave natural) → sync_runs.
 *
 * Reglas:
 *   * Un error de un valor no aborta el job: se registra en sync_runs.errors y el estado queda
 *     `partial`. Nunca se escribe un valor "por defecto" en lugar del dato que falló.
 *   * No se escribe nada de un valor cuyo identificador no esté verificado contra el perfil del
 *     proveedor (evita guardar datos de otra empresa bajo nuestro ticker).
 */

export interface SyncContext {
  adapter: ProviderAdapter & { readonly requestCount?: number };
  store: SyncStore;
  now: () => Date;
  log: (line: string) => void;
  scope: string;
}

export interface SyncTarget {
  security: SyncSecurity;
  identifier: IdentifierRecord;
  symbol: ProviderSymbol;
}

export interface JobReport extends SyncRunFinish {
  runId: string;
  jobType: string;
  provider: string;
}

export const MARKETRADAR_SOURCE = "marketradar";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

class RunTracker {
  recordsRead = 0;
  recordsWritten = 0;
  readonly errors: SyncIssue[] = [];
  readonly warnings: SyncIssue[] = [];
  readonly succeeded = new Set<string>();

  error(security: string | null, kind: string, message: string) {
    this.errors.push({ security, kind, message });
  }

  warn(security: string | null, kind: string, message: string) {
    this.warnings.push({ security, kind, message });
  }
}

/** Errores propios del sync (además de los ProviderErrorKind del proveedor). */
const SYNC_ERROR_KINDS: Readonly<Record<string, string>> = {
  SyncStoreError: "database",
  IdentityMismatch: "identity_mismatch",
  IdentifierUnverified: "identifier_unverified",
  NoData: "no_data",
};

function describeError(error: unknown): { kind: string; message: string } {
  if (isProviderError(error)) return { kind: error.kind, message: error.message };
  if (error instanceof Error) return { kind: SYNC_ERROR_KINDS[error.name] ?? "unexpected", message: error.message };
  return { kind: "unexpected", message: String(error) };
}

async function measureUsage(ctx: SyncContext): Promise<{ requests: number; date: string | null } | null> {
  if (!ctx.adapter.getUsage) return null;
  try {
    const usage = await ctx.adapter.getUsage();
    return usage ? { requests: usage.requestsToday, date: usage.date } : null;
  } catch {
    // La medición de créditos es telemetría: si falla, credits_used queda null (no se inventa).
    return null;
  }
}

/** Envuelve un job: sync_runs (inicio/fin), créditos medidos y estado final. */
async function runJob(
  ctx: SyncContext,
  options: { jobType: string; provider: string; estimatedCredits: number | null; params: Record<string, unknown>; measureCredits: boolean },
  targets: readonly SyncTarget[],
  body: (tracker: RunTracker) => Promise<void>,
): Promise<JobReport> {
  const tracker = new RunTracker();
  const before = options.measureCredits ? await measureUsage(ctx) : null;
  const requestsBefore = ctx.adapter.requestCount ?? null;
  const runId = await ctx.store.startRun({
    provider: options.provider,
    jobType: options.jobType,
    scope: ctx.scope,
    params: options.params,
    startedAt: ctx.now().toISOString(),
  });
  ctx.log(`▶ ${options.jobType} (${targets.length} securities) run=${runId}`);
  try {
    await body(tracker);
  } catch (error) {
    const { kind, message } = describeError(error);
    tracker.error(null, kind, message);
  }
  const after = options.measureCredits ? await measureUsage(ctx) : null;
  const requestsAfter = ctx.adapter.requestCount ?? null;
  const creditsUsed = before && after && before.date === after.date ? after.requests - before.requests : null;

  const status: SyncRunFinish["status"] =
    tracker.errors.length === 0 ? "succeeded" : tracker.succeeded.size > 0 ? "partial" : "failed";
  const result: SyncRunFinish = {
    status,
    finishedAt: ctx.now().toISOString(),
    recordsRead: tracker.recordsRead,
    recordsWritten: tracker.recordsWritten,
    requestsMade: options.measureCredits && requestsBefore !== null && requestsAfter !== null ? requestsAfter - requestsBefore : null,
    creditsUsed,
    creditsEstimated: options.estimatedCredits,
    errors: tracker.errors,
    warnings: tracker.warnings,
  };
  await ctx.store.finishRun(runId, result);
  ctx.log(
    `  ${status} · read ${result.recordsRead} · written ${result.recordsWritten} · credits ${creditsUsed ?? "n/a"} (est. ${options.estimatedCredits ?? "n/a"}) · errors ${tracker.errors.length} · warnings ${tracker.warnings.length}`,
  );
  for (const e of tracker.errors) ctx.log(`  ✗ ${e.security ?? "-"} [${e.kind}] ${e.message}`);
  return { ...result, runId, jobType: options.jobType, provider: options.provider };
}

/** Ejecuta `fn` por valor; un fallo se registra y no detiene a los demás. */
async function forEachTarget(targets: readonly SyncTarget[], tracker: RunTracker, fn: (t: SyncTarget) => Promise<void>) {
  for (const target of targets) {
    try {
      await fn(target);
      tracker.succeeded.add(target.security.ticker);
    } catch (error) {
      const { kind, message } = describeError(error);
      tracker.error(target.security.ticker, kind, message);
    }
  }
}

function requireVerified(target: SyncTarget) {
  if (!target.identifier.verifiedAt) {
    const error = new Error(`Identifier ${target.symbol.symbol} is not verified against the provider profile; run the fundamentals job first`);
    error.name = "IdentifierUnverified";
    throw error;
  }
}

async function provenance(ctx: SyncContext, capability: ProviderCapability): Promise<WriteProvenance> {
  const key = ctx.adapter.datasets[capability];
  if (!key) throw new Error(`Adapter ${ctx.adapter.id} declares no dataset for ${capability}`);
  return { source: ctx.adapter.id, datasetId: await ctx.store.resolveDatasetId(key), ingestedAt: ctx.now().toISOString() };
}

// --- 1. Identificadores -------------------------------------------------------------------------

/**
 * Resuelve el identificador de proveedor de cada ticker. Si no existe en security_identifiers,
 * lo PROPONE con la regla de simbología (source = 'rule', sin verificar). No llama al proveedor.
 */
export async function resolveTargets(
  ctx: SyncContext,
  rule: SymbologyRule,
  tickers: readonly string[],
): Promise<{ targets: SyncTarget[]; unresolved: SyncIssue[] }> {
  const securities = await ctx.store.findSecuritiesByTicker(tickers);
  const unresolved: SyncIssue[] = [];
  for (const ticker of tickers) {
    if (!securities.some((s) => s.ticker === ticker)) unresolved.push({ security: ticker, kind: "not_found", message: "Ticker not in the MarketRadar universe" });
  }
  const targets: SyncTarget[] = [];
  for (const security of securities) {
    let identifier = await ctx.store.getActiveIdentifier(rule.provider, security.securityId);
    if (!identifier) {
      const proposed = rule.toProviderSymbol({ ticker: security.ticker, exchangeMic: security.exchangeMic });
      if (!proposed) {
        unresolved.push({ security: security.ticker, kind: "not_covered", message: `${rule.provider} does not cover ${security.exchangeMic}` });
        continue;
      }
      identifier = await ctx.store.insertIdentifier({
        securityId: security.securityId,
        provider: rule.provider,
        symbol: proposed.symbol,
        exchangeCode: proposed.exchangeCode,
        source: "rule",
      });
      ctx.log(`  + identifier ${security.ticker} → ${identifier.symbol} (rule, unverified)`);
    }
    targets.push({ security, identifier, symbol: { provider: identifier.provider, symbol: identifier.symbol } });
  }
  targets.sort((a, b) => tickers.indexOf(a.security.ticker) - tickers.indexOf(b.security.ticker));
  return { targets, unresolved };
}

const normalizeCik = (cik: string | null) => (cik && /^\d{1,10}$/.test(cik.trim()) ? cik.trim().padStart(10, "0") : null);

// --- 2. Perfil (verificación) + fundamentales + earnings + valoración ---------------------------------

export async function syncFundamentals(ctx: SyncContext, targets: readonly SyncTarget[]): Promise<JobReport> {
  const { adapter } = ctx;
  const perCall = adapter.costModel.creditsPerCall.fundamentals ?? null;
  return runJob(
    ctx,
    { jobType: "fundamentals", provider: adapter.id, estimatedCredits: perCall === null ? null : perCall * targets.length, params: { tickers: targets.map((t) => t.security.ticker) }, measureCredits: true },
    targets,
    async (tracker) => {
      if (!adapter.profile || !adapter.fundamentals || !adapter.earnings || !adapter.valuation) {
        throw new Error(`${adapter.id} lacks profile/fundamentals/earnings/valuation capabilities`);
      }
      const [prov, profileSource, fundamentalsSource, earningsSource, valuationSource] = [
        await provenance(ctx, "fundamentals"),
        adapter.profile,
        adapter.fundamentals,
        adapter.earnings,
        adapter.valuation,
      ];
      await forEachTarget(targets, tracker, async (t) => {
        const ticker = t.security.ticker;
        // Verificación de identidad: CIK del proveedor = CIK del seed.
        const profile = await profileSource.getProfile(t.symbol);
        const ours = normalizeCik(t.security.cik);
        const theirs = normalizeCik(profile.cik);
        if (ours && theirs && ours !== theirs) {
          const error = new Error(`Provider CIK ${theirs} ≠ MarketRadar CIK ${ours} for ${t.symbol.symbol} ("${profile.name}")`);
          error.name = "IdentityMismatch";
          throw error;
        }
        if (!ours || !theirs) {
          tracker.warn(ticker, "unverifiable", `No common identifier to verify ${t.symbol.symbol} (CIK ours=${ours ?? "none"}, provider=${theirs ?? "none"})`);
          requireVerified(t);
        } else if (!t.identifier.verifiedAt) {
          const at = ctx.now().toISOString();
          await ctx.store.markIdentifierVerified(t.identifier.id, `CIK ${ours} matches provider profile "${profile.name}"`, at);
          t.identifier.verifiedAt = at;
          ctx.log(`  ✓ ${ticker} → ${t.symbol.symbol} verified (CIK ${ours})`);
        }

        const fundamentals = await fundamentalsSource.getFundamentals(t.symbol);
        const earnings = await earningsSource.getEarnings(t.symbol);
        const valuation = await valuationSource.getValuation(t.symbol);
        tracker.recordsRead +=
          fundamentals.statements.length + fundamentals.shares.length + earnings.events.length + earnings.estimates.length + valuation.values.length;
        for (const w of fundamentals.warnings) tracker.warn(ticker, "normalization", w);

        // Derivados de MarketRadar (conviven con los del proveedor; ninguno sobrescribe al otro).
        const derived = deriveFinancials(fundamentals.statements);
        for (const d of derived.fcfDivergences) tracker.warn(ticker, "fcf_divergence", describeFcfDivergence(d));
        const missing = new Map<string, number>();
        for (const v of derived.values) if (v.missingReason) missing.set(`${v.lineItem}:${v.missingReason}`, (missing.get(`${v.lineItem}:${v.missingReason}`) ?? 0) + 1);
        for (const [key, count] of missing) {
          const [item, reason] = key.split(":");
          tracker.warn(ticker, "calculation_missing", `${item} calculated = NULL for ${count} periods (${reason})`);
        }

        tracker.recordsWritten += await ctx.store.upsertStatementValues(
          t.security.companyId,
          t.security.securityId,
          [...fundamentals.statements, ...derived.values],
          prov,
        );
        tracker.recordsWritten += await ctx.store.upsertShares(t.security.securityId, fundamentals.shares, prov);
        tracker.recordsWritten += await ctx.store.upsertEarningsEvents(t.security.companyId, t.security.securityId, earnings.events, prov);
        tracker.recordsWritten += await ctx.store.upsertEarningsEstimates(t.security.companyId, t.security.securityId, earnings.asOf, earnings.estimates, prov);
        if (valuation.asOf) {
          tracker.recordsWritten += await ctx.store.upsertValuations(t.security.securityId, valuation.asOf, valuation.values, prov);
        } else if (valuation.values.length > 0) {
          tracker.warn(ticker, "no_as_of", "Provider valuation has no as-of date; not stored");
        }
      });
    },
  );
}

// --- 3. Calendario de sesiones -----------------------------------------------------------------------

export const CALENDAR_MIC = "XNYS";

/** Calendario oficial (festivos, medias sesiones) desde el inicio del histórico hasta dentro de 60 días. */
export async function syncMarketCalendar(ctx: SyncContext, mic = CALENDAR_MIC): Promise<JobReport> {
  const { adapter } = ctx;
  const from = priceHistoryStart(ctx.now());
  const to = addDays(isoDay(ctx.now()), 60);
  return runJob(ctx, { jobType: "market_calendar", provider: adapter.id, estimatedCredits: 0, params: { mic, from, to }, measureCredits: true }, [], async (tracker) => {
    if (!adapter.calendar) throw new Error(`${adapter.id} lacks calendar`);
    // Al día si ya cubre el inicio del histórico y al menos 30 días por delante (evita reescrituras diarias).
    const [head, tail] = await Promise.all([
      ctx.store.getMarketSessions(mic, from, addDays(from, 10)),
      ctx.store.getMarketSessions(mic, addDays(isoDay(ctx.now()), 30), to),
    ]);
    if (head.length > 0 && tail.length > 0) {
      tracker.succeeded.add(mic);
      ctx.log(`  calendar ${mic}: up to date (through ${tail.at(-1)?.date})`);
      return;
    }
    const sessions = await adapter.calendar.getSessions(mic, { from, to });
    tracker.recordsRead += sessions.length;
    if (sessions.length === 0) throw Object.assign(new Error("Provider returned an empty calendar"), { name: "NoData" });
    tracker.recordsWritten += await ctx.store.replaceMarketSessions(mic, sessions, adapter.id);
    tracker.succeeded.add(mic);
    ctx.log(`  calendar ${mic}: ${sessions.length} sessions ${sessions[0]?.date}…${sessions.at(-1)?.date}`);
  });
}

/** Última sesión con barra diaria definitiva según el calendario almacenado (null si no hay calendario). */
export async function lastFinalSessionDate(ctx: SyncContext, mic = CALENDAR_MIC): Promise<string | null> {
  const today = isoDay(ctx.now());
  const sessions = await ctx.store.getMarketSessions(mic, addDays(today, -15), today);
  return lastFinalSession(sessions, ctx.now())?.date ?? null;
}

// --- 4. Precios diarios ------------------------------------------------------------------------------

export const PRICES_JOB = "daily_prices";
/** Símbolos por petición: cargas completas (~1.900 barras/símbolo) y actualizaciones incrementales. */
export const FULL_BATCH = 40;
export const INCREMENTAL_BATCH = 200;

interface PricePlan {
  target: SyncTarget;
  series: PriceSeriesRecord;
  from: string;
  incremental: boolean;
}

export async function syncDailyPrices(ctx: SyncContext, targets: readonly SyncTarget[]): Promise<JobReport> {
  const { adapter } = ctx;
  const perCall = adapter.costModel.creditsPerCall.price_history ?? null;
  const finalSession = await lastFinalSessionDate(ctx);
  // Sin calendario (p. ej. EODHD) el proveedor solo devuelve sesiones cerradas: hasta hoy.
  const to = finalSession ?? isoDay(ctx.now());
  return runJob(
    ctx,
    { jobType: PRICES_JOB, provider: adapter.id, estimatedCredits: perCall === null ? null : perCall * targets.length, params: { to, calendar: finalSession !== null }, measureCredits: true },
    targets,
    async (tracker) => {
      const source = adapter.priceHistory;
      if (!source) throw new Error(`${adapter.id} lacks price_history`);
      const prov = await provenance(ctx, "price_history");

      // 1) Plan por security: serie de una sola fuente + rango (completo o incremental con solape).
      const plans: PricePlan[] = [];
      await forEachTarget(targets, tracker, async (t) => {
        requireVerified(t);
        const cursor = await ctx.store.getCursor(adapter.id, PRICES_JOB, t.security.securityId);
        // La base del volumen la declara el puerto (Alpaca: raw; EODHD: ajustado por splits).
        const volumeBasis = source.volumeBasis ?? "split_adjusted";
        const opened = await ctx.store.openPriceSeries(t.security.securityId, {
          source: adapter.id,
          datasetId: prov.datasetId,
          volumeBasis,
          feed: source.feed ?? null,
          currency: t.security.currency,
        });
        if (opened.switchedFrom) {
          tracker.warn(t.security.ticker, "price_source_switched", `Replaced ${opened.removedBars} bars from ${opened.switchedFrom} with ${adapter.id}`);
        }
        const incremental = !!cursor?.lastValue && !cursor.fullRefreshRequired && !opened.switchedFrom && opened.series.barCount > 0;
        const from = incremental ? addDays(cursor?.lastValue as string, -INCREMENTAL_OVERLAP_DAYS) : priceHistoryStart(ctx.now());
        plans.push({ target: t, series: opened.series, from, incremental });
      });

      // 2) Descarga por lotes (mismo `from`); si un lote falla, se reintenta símbolo a símbolo.
      const groups = new Map<string, PricePlan[]>();
      for (const p of plans) groups.set(p.from, [...(groups.get(p.from) ?? []), p]);
      for (const [from, group] of groups) {
        const size = group[0]?.incremental ? INCREMENTAL_BATCH : FULL_BATCH;
        for (let i = 0; i < group.length; i += size) {
          const chunk = group.slice(i, i + size);
          let fetched: Map<string, ProviderDailyBars> | null = null;
          if (source.getDailyBarsBatch && chunk.length > 1) {
            try {
              fetched = await source.getDailyBarsBatch(chunk.map((p) => p.target.symbol), { from, to });
            } catch (error) {
              tracker.warn(null, "batch_fallback", `Batch of ${chunk.length} failed (${describeError(error).message}); retrying one by one`);
            }
          }
          await forEachTarget(
            chunk.map((p) => p.target),
            tracker,
            async (t) => {
              const plan = chunk.find((p) => p.target === t) as PricePlan;
              const series = fetched?.get(t.symbol.symbol) ?? (await source.getDailyBars(t.symbol, { from, to }));
              await writeSeries(ctx, tracker, plan, series, prov.ingestedAt, to);
            },
          );
        }
      }
    },
  );
}

/**
 * Barras iniciales sin negociación (volumen 0) antes de la primera sesión con volumen: relleno del
 * proveedor antes de la cotización real (p. ej. DOW antes del 2-abr-2019, precio congelado). No son
 * sesiones de la security y solo se descartan en cargas completas.
 */
export function dropLeadingPlaceholders(bars: readonly DailyBar[]): { bars: DailyBar[]; dropped: number } {
  const first = bars.findIndex((b) => b.volume === null || b.volume > 0);
  if (first <= 0) return { bars: [...bars], dropped: 0 };
  return { bars: bars.slice(first), dropped: first };
}

async function writeSeries(ctx: SyncContext, tracker: RunTracker, plan: PricePlan, fetched: ProviderDailyBars, ingestedAt: string, to: string) {
  const { target: t, incremental, from } = plan;
  const ticker = t.security.ticker;
  let series = fetched;
  if (!incremental) {
    const trimmed = dropLeadingPlaceholders(fetched.bars);
    if (trimmed.dropped > 0) {
      tracker.warn(ticker, "placeholder_bars_dropped", `${trimmed.dropped} leading zero-volume bars before the first trade dropped (${fetched.bars[0]?.tradeDate}…${fetched.bars[trimmed.dropped - 1]?.tradeDate})`);
      series = { ...fetched, bars: trimmed.bars };
    }
  }
  tracker.recordsRead += series.bars.length;
  for (const issue of series.issues) tracker.warn(ticker, "bar_rejected", issue);
  if (series.bars.length === 0 && !incremental) {
    throw Object.assign(new Error(`Provider returned no bars for ${from}…${to}`), { name: "NoData" });
  }
  tracker.recordsWritten += await ctx.store.upsertDailyBars(plan.series.id, series.bars);
  const firstBar = series.bars[0]?.tradeDate;
  if (!incremental && firstBar) {
    const removed = await ctx.store.deleteBarsBefore(plan.series.id, firstBar);
    if (removed > 0) tracker.warn(ticker, "bars_removed", `${removed} stored bars before ${firstBar} removed (no longer part of the provider series)`);
  }
  // Retención continua (PRICE_HISTORY_YEARS): al cambiar de año se podan las barras anteriores a la ventana.
  const historyStart = priceHistoryStart(ctx.now());
  if (incremental && plan.series.firstDate && plan.series.firstDate < historyStart) {
    const pruned = await ctx.store.deleteBarsBefore(plan.series.id, historyStart);
    if (pruned > 0) ctx.log(`  ${ticker}: pruned ${pruned} bars before ${historyStart} (retention)`);
  }
  const updated = await ctx.store.finalizeSeriesLoad(plan.series.id, { ingestedAt, fullLoad: !incremental });
  await ctx.store.saveCursor({
    provider: ctx.adapter.id,
    jobType: PRICES_JOB,
    securityId: t.security.securityId,
    lastValue: updated.lastDate,
    fullRefreshRequired: false,
    lastSuccessAt: ctx.now().toISOString(),
    lastRunId: null,
  });
  ctx.log(`  ${ticker}: ${series.bars.length} bars ${incremental ? "(incremental)" : "(full)"} ${from}…${updated.lastDate ?? "-"} · stored ${updated.barCount}`);
}

// --- 5. Acciones corporativas --------------------------------------------------------------------------

export async function syncCorporateActions(ctx: SyncContext, targets: readonly SyncTarget[]): Promise<JobReport> {
  const { adapter } = ctx;
  const perCall = adapter.costModel.creditsPerCall.corporate_actions ?? null;
  return runJob(
    ctx,
    { jobType: "corporate_actions", provider: adapter.id, estimatedCredits: perCall === null ? null : perCall * 2 * targets.length, params: {}, measureCredits: true },
    targets,
    async (tracker) => {
      const source = adapter.corporateActions;
      if (!source) throw new Error(`${adapter.id} lacks corporate_actions`);
      const prov = await provenance(ctx, "corporate_actions");
      if (source.prefetch) {
        const verified = targets.filter((t) => t.identifier.verifiedAt);
        for (let i = 0; i < verified.length; i += INCREMENTAL_BATCH) {
          try {
            await source.prefetch(verified.slice(i, i + INCREMENTAL_BATCH).map((t) => t.symbol));
          } catch (error) {
            tracker.warn(null, "batch_fallback", `Corporate actions batch failed (${describeError(error).message}); retrying one by one`);
          }
        }
      }
      await forEachTarget(targets, tracker, async (t) => {
        requireVerified(t);
        const ticker = t.security.ticker;
        const splits = await source.getSplits(t.symbol);
        const dividends = await source.getDividends(t.symbol, t.security.currency);
        const actions = [...splits.actions, ...dividends.actions];
        tracker.recordsRead += actions.length;
        for (const issue of [...splits.issues, ...dividends.issues]) tracker.warn(ticker, "action_rejected", issue);
        for (const a of actions) {
          if (a.kind === "unsupported") tracker.warn(ticker, "unsupported_action", `${a.type} ${a.exDate}: ${a.reason}`);
        }

        const { written, removed } = await ctx.store.replaceCorporateActions(t.security.securityId, actions, prov);
        tracker.recordsWritten += written;
        for (const r of removed) tracker.warn(ticker, "action_removed", `No longer reported by the provider: ${r}`);

        // Volumen ajustado por el proveedor (EODHD): un split posterior a la última carga completa lo deja desfasado.
        const series = await ctx.store.getPriceSeries(t.security.securityId);
        if (series?.volumeBasis !== "split_adjusted" || series.source !== adapter.id) return;
        const loadedOn = series.fullLoadedAt?.slice(0, 10) ?? null;
        const late = splits.actions.find((s) => loadedOn !== null && s.exDate > loadedOn && series.firstDate !== null && s.exDate > series.firstDate);
        if (!late) return;
        const cursor = await ctx.store.getCursor(adapter.id, PRICES_JOB, t.security.securityId);
        if (cursor && !cursor.fullRefreshRequired) {
          await ctx.store.saveCursor({ ...cursor, fullRefreshRequired: true });
          tracker.warn(ticker, "full_refresh_scheduled", `Split ${late.exDate} after the last full load (${loadedOn}); next price sync reloads full history`);
        }
      });
    },
  );
}

// --- 6. Factores de ajuste (cálculo interno, sin proveedor) ------------------------------------------

export async function computeFactors(ctx: SyncContext, targets: readonly SyncTarget[]): Promise<JobReport> {
  return runJob(
    ctx,
    { jobType: "adjustment_factors", provider: MARKETRADAR_SOURCE, estimatedCredits: 0, params: {}, measureCredits: false },
    targets,
    async (tracker) => {
      await forEachTarget(targets, tracker, async (t) => {
        const ticker = t.security.ticker;
        const stored = await ctx.store.getDailyBars(t.security.securityId);
        // Solo las acciones corporativas de la MISMA fuente que los precios (sin duplicar dividendos).
        const actions = await ctx.store.getCorporateActions(t.security.securityId, stored.source ?? undefined);
        tracker.recordsRead += stored.bars.length + actions.length;
        if (stored.bars.length === 0) throw Object.assign(new Error("No stored prices; run the price sync first"), { name: "NoData" });
        const { factors, skipped } = computeAdjustmentFactors(stored.bars, actions);
        const firstDate = stored.bars[0]?.tradeDate ?? "";
        for (const s of relevantSkips(skipped, firstDate)) tracker.warn(ticker, "factor_skipped", `${s.kind} ${s.exDate}: ${s.reason}`);
        tracker.recordsWritten += await ctx.store.replaceAdjustmentFactors(t.security.securityId, factors, stored.source ?? "unknown", ctx.now().toISOString());
      });
    },
  );
}

/**
 * Eventos anteriores al histórico o con fecha ex futura no afectan a ninguna barra: no son incidencias.
 * Los no soportados ya se informan como acción `unsupported` (no se duplican).
 */
function relevantSkips(skipped: FactorComputation["skipped"], firstDate: string) {
  return skipped.filter(
    (s) => !(s.exDate <= firstDate && s.reason.startsWith("No session")) && !s.reason.startsWith("Ex-date after the last stored session") && !s.reason.startsWith("Unsupported:"),
  );
}

// --- 7. Análisis de la serie: factores + calidad + indicadores + capitalización ----------------------------

export interface SeriesOutcome {
  ticker: string;
  status: QualityStatus;
  notes: QualityNote[];
  asOfDate: string | null;
  bars: number;
}

/**
 * Una sola lectura por security: recalcula los factores (misma fuente que los precios), evalúa la
 * calidad de la serie (PASS/WARNING/MISSING/FAIL) y materializa la instantánea de mercado.
 * Las securities sin serie o con error quedan como MISSING/FAIL con motivo.
 */
export async function analyzePriceSeries(
  ctx: SyncContext,
  targets: readonly SyncTarget[],
  outcomes: SeriesOutcome[] = [],
  /** Si se pasa, acumula cada serie en los índices sintéticos de sus grupos (solo con el universo completo). */
  groupIndex?: GroupIndexAccumulator,
): Promise<JobReport> {
  const today = isoDay(ctx.now());
  const requestedFrom = priceHistoryStart(ctx.now());
  const sessions = await ctx.store.getMarketSessions(CALENDAR_MIC, requestedFrom, today);
  const expectedLast = lastFinalSession(sessions, ctx.now())?.date ?? null;
  return runJob(
    ctx,
    { jobType: "price_analysis", provider: MARKETRADAR_SOURCE, estimatedCredits: 0, params: { expectedLast }, measureCredits: false },
    targets,
    async (tracker) => {
      await forEachTarget(targets, tracker, async (t) => {
        const ticker = t.security.ticker;
        const stored = await ctx.store.getDailyBars(t.security.securityId);
        if (stored.seriesId === null || stored.bars.length === 0) {
          groupIndex?.touch(t.security.groups ?? []);
          outcomes.push({ ticker, status: "MISSING", notes: [{ severity: "fail", kind: "no_series", message: "No price series stored" }], asOfDate: null, bars: 0 });
          if (stored.seriesId !== null) await ctx.store.setSeriesQuality(stored.seriesId, "MISSING", [{ severity: "fail", kind: "no_bars", message: "No bars stored" }], ctx.now().toISOString());
          return;
        }
        const actions = await ctx.store.getCorporateActions(t.security.securityId, stored.source ?? undefined);
        tracker.recordsRead += stored.bars.length + actions.length;
        const { factors, skipped } = computeAdjustmentFactors(stored.bars, actions);
        const firstDate = stored.bars[0]?.tradeDate ?? "";
        await ctx.store.replaceAdjustmentFactors(t.security.securityId, factors, stored.source ?? "unknown", ctx.now().toISOString());

        const quality = assessSeriesQuality({
          bars: stored.bars,
          sessions,
          expectedLastSession: expectedLast,
          requestedFrom,
          actions,
          rejectedBars: [],
          skippedFactors: relevantSkips(skipped, firstDate),
        });
        await ctx.store.setSeriesQuality(stored.seriesId, quality.status, quality.notes, ctx.now().toISOString());
        for (const n of quality.notes) if (n.severity !== "info") tracker.warn(ticker, n.kind, n.message);

        const adjusted = adjustBars(stored.bars, factors, { mode: "split", volumeBasis: stored.volumeBasis ?? "raw" });
        const ind = computeIndicators(adjusted);
        if (!ind) throw Object.assign(new Error("No bars to analyse"), { name: "NoData" });

        const [shares, diluted, basic, shareClass] = await Promise.all([
          ctx.store.getLatestShares(t.security.securityId),
          ctx.store.getLatestQuarterlyValue(t.security.companyId, "sec", "weighted_average_shares_diluted"),
          ctx.store.getLatestQuarterlyValue(t.security.companyId, "sec", "weighted_average_shares_basic"),
          ctx.store.getShareClass(t.security.securityId),
        ]);
        // Solo splits aplicados (los contradichos por los precios no cuentan).
        const splits = factors.filter((f) => f.kind === "split").map((f) => ({ exDate: f.exDate, shareFactor: f.volumeFactor }));
        const cap = verifyMarketCap({
          price: ind.close,
          priceDate: ind.asOfDate,
          shares: shares ? { value: shares.shares, asOfDate: shares.asOfDate } : null,
          providerMarketCap: null,
          referenceShares: diluted ? { value: diluted.value, asOfDate: diluted.periodEnd } : null,
          alternateReferenceShares: basic ? { value: basic.value, asOfDate: basic.periodEnd } : null,
          splits,
          isMultiClass: isLikelyMultiClass({ ticker, shareClass: t.security.shareClass, listingsOfIssuer: t.security.listingsOfIssuer }),
          // Acciones por clase de la portada XBRL (si existen): resuelven el alcance de los multiclase.
          shareClass: shareClass ? { status: shareClass.checkStatus, shares: shareClass.shares, asOfDate: shareClass.sharesAsOf, note: shareClass.note } : null,
        });
        await ctx.store.upsertMarketSnapshot({
          securityId: t.security.securityId,
          seriesId: stored.seriesId,
          source: stored.source ?? "unknown",
          asOfDate: ind.asOfDate,
          barCount: ind.barCount,
          firstDate: ind.firstDate,
          close: ind.close,
          previousClose: ind.previousClose,
          volume: ind.volume,
          returns: ind.returns,
          sma20: ind.sma20,
          sma50: ind.sma50,
          sma200: ind.sma200,
          ema20: ind.ema20,
          ema50: ind.ema50,
          ema200: ind.ema200,
          rsi14: ind.rsi14,
          macd: ind.macd,
          macdSignal: ind.macdSignal,
          macdHistogram: ind.macdHistogram,
          atr14: ind.atr14,
          averageVolume20: ind.averageVolume20,
          relativeVolume: ind.relativeVolume,
          averageDollarVolume20: ind.averageDollarVolume20,
          high52w: ind.high52w,
          low52w: ind.low52w,
          isNew52wHigh: ind.isNew52wHigh,
          isNew52wLow: ind.isNew52wLow,
          marketCap: cap.status === "VERIFIED" ? cap.calculated : null,
          marketCapStatus: cap.status,
          marketCapReason: cap.reason,
          marketCapShares: shareClass ? shareClass.shares : (shares?.shares ?? null),
          marketCapSharesAsOf: shareClass ? shareClass.sharesAsOf : (shares?.asOfDate ?? null),
          computedAt: ctx.now().toISOString(),
        });
        tracker.recordsWritten++;
        outcomes.push({ ticker, status: quality.status, notes: quality.notes, asOfDate: ind.asOfDate, bars: ind.barCount });

        if (groupIndex) {
          // Capitalización histórica (precio sin ajustar × acciones vigentes) solo para miembros con cap. actual VERIFICADA.
          const verified = cap.status === "VERIFIED";
          const history = verified ? await ctx.store.getSharesHistory(t.security.securityId) : [];
          groupIndex.add({
            groups: t.security.groups ?? [],
            capWeighted: verified && history.length > 0,
            bars: adjusted.map((b, i) => {
              const raw = stored.bars[i] as DailyBar;
              const s = verified ? sharesOn(b.tradeDate, history, splits) : null;
              return { date: b.tradeDate, adjClose: b.close, marketCap: s !== null ? raw.close * s : null };
            }),
          });
        }
      });
    },
  );
}

// --- 7b. Índices sintéticos por grupo ---------------------------------------------------------------------

const GROUP_KINDS = ["index", "sector", "industry_group", "industry", "sub_industry"] as const;

/** Sesiones del calendario desde el inicio del histórico (para alinear los índices sintéticos). */
export async function groupIndexSessions(ctx: SyncContext): Promise<string[]> {
  const sessions = await ctx.store.getMarketSessions(CALENDAR_MIC, priceHistoryStart(ctx.now()), isoDay(ctx.now()));
  const last = lastFinalSession(sessions, ctx.now())?.date;
  return sessions.filter((s) => !last || s.date <= last).map((s) => s.date);
}

/** Persiste los índices sintéticos equal/cap weight de todos los grupos acumulados. */
export async function persistGroupIndices(ctx: SyncContext, acc: GroupIndexAccumulator): Promise<JobReport> {
  return runJob(ctx, { jobType: "group_indices", provider: MARKETRADAR_SOURCE, estimatedCredits: 0, params: {}, measureCredits: false }, [], async (tracker) => {
    const rows: StoredGroupIndex[] = [];
    const computedAt = ctx.now().toISOString();
    for (const key of acc.keys()) {
      const [kind, groupKey] = key.split(/:(.*)/s) as [string, string];
      if (!(GROUP_KINDS as readonly string[]).includes(kind)) continue;
      const built = acc.build(key);
      if (!built) {
        tracker.warn(key, "empty_group", "No member has price data");
        continue;
      }
      const base = { groupKind: kind as StoredGroupIndex["groupKind"], groupKey, exchangeMic: CALENDAR_MIC, startDate: built.startDate, membersTotal: built.totalMembers, source: MARKETRADAR_SOURCE, computedAt };
      const endDate = acc.sessionAt(built.startDate, built.equal.length - 1);
      rows.push({ ...base, method: "equal_weight", endDate, levels: built.equal, membersLast: built.equalMembers });
      if (built.cap) rows.push({ ...base, method: "cap_weight", endDate, levels: built.cap, membersLast: built.capMembers });
      else tracker.warn(key, "no_cap_weight", "No member with a verified market cap: cap-weighted series not built");
    }
    tracker.recordsRead = acc.keys().length;
    tracker.recordsWritten = await ctx.store.replaceGroupIndices(rows);
    if (acc.excludedReturns > 0) tracker.warn(null, "excluded_returns", `${acc.excludedReturns} split-like daily returns excluded from group indices`);
    tracker.succeeded.add("group_indices");
    ctx.log(`  group indices: ${rows.length} series (${acc.keys().length} groups)`);
  });
}

// --- 8. Verificación de identidad sin CIK (proveedores de precios) --------------------------------------

/**
 * Verifica los identificadores con un comprobador del proveedor (p. ej. catálogo de activos de Alpaca:
 * activo, bolsa y nombre). `verify` devuelve el motivo del rechazo o null si verifica. Los ya
 * verificados no se vuelven a consultar.
 */
export async function verifyIdentifiers(
  ctx: SyncContext,
  targets: readonly SyncTarget[],
  verify: (target: SyncTarget) => Promise<string | null | { rejection: string | null; warnings: string[] }>,
): Promise<JobReport> {
  return runJob(
    ctx,
    { jobType: "identifier_verification", provider: ctx.adapter.id, estimatedCredits: 0, params: {}, measureCredits: false },
    targets,
    async (tracker) => {
      await forEachTarget(targets, tracker, async (t) => {
        if (t.identifier.verifiedAt) return;
        tracker.recordsRead++;
        const result = await verify(t);
        const rejection = typeof result === "object" && result !== null ? result.rejection : result;
        const warnings = typeof result === "object" && result !== null ? result.warnings : [];
        if (rejection) throw Object.assign(new Error(`${t.symbol.symbol}: ${rejection}`), { name: "IdentityMismatch" });
        for (const w of warnings) tracker.warn(t.security.ticker, "identity_note", w);
        const at = ctx.now().toISOString();
        const note = `${ctx.adapter.label} asset catalogue: active US listing, name matches${warnings.length ? ` (${warnings.join("; ")})` : ""}`;
        await ctx.store.markIdentifierVerified(t.identifier.id, note, at);
        t.identifier.verifiedAt = at;
        tracker.recordsWritten++;
      });
    },
  );
}
