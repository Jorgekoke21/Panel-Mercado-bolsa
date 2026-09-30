/**
 * Sync automático (lo lanza un programador cada hora; no depende de una hora fija).
 *
 *   auto [--force] [--dry-run]
 *       1. bloqueo con caducidad (dos ejecuciones nunca se solapan)
 *       2. calendario oficial ⇒ última sesión DEFINITIVA (cierre + 4 h 20 min; medias sesiones incluidas)
 *       3. planAutoSync: ¿hay sesión nueva? ¿índices por detrás? ¿SEC con más de 7 días?
 *       4. SEC (si toca) → precios + acciones + análisis + índices sintéticos (si toca)
 *       Fines de semana y festivos: no hay sesión nueva ⇒ ninguna llamada a proveedores de precios.
 *       Noticias: en cada ejecución (24/7); cada fuente respeta su propia frecuencia; retención diaria.
 *       Cada ejecución deja una línea en data/logs/sync-auto.log (y sus jobs en sync_runs).
 *   status
 *       frescura de los datos: última sesión definitiva, instantáneas, índices, SEC, próximas ejecuciones.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { type AutoSyncPlan, planAutoSync } from "@/sync/auto-plan";
import { CALENDAR_MIC, syncMarketCalendar } from "@/sync/jobs";
import { runPricePipeline } from "./alpaca-commands";
import { AlpacaAdapter } from "@/providers/alpaca/adapter";
import { AlpacaClient } from "@/providers/alpaca/client";
import { requireSyncSecret } from "@/config/sync-env";
import { runSecSync, runShareClassSync } from "./sec-commands";
import type { CommandDeps } from "./shared";
import { loadNewsContext, pruneNews, runNewsJob } from "@/sync/news-job";
import { SupabaseNewsStore } from "@/sync/news-store";

export const AUTO_COMMANDS = ["auto", "status"] as const;

const INDEX = "sp500";
const LEASE = "market-data-auto";
const LEASE_TTL_MS = 2 * 3_600_000;
const LOG_FILE = resolve(process.cwd(), "data/logs/sync-auto.log");
/** Refresco semanal de la SEC: cachés de más de 6 días se vuelven a descargar. */
const SEC_CACHE_MAX_AGE_HOURS = 6 * 24;
/** Retención del registro de ejecuciones (observabilidad) en la base de datos. */
const SYNC_RUN_RETENTION_DAYS = 180;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000));

function fileLog(line: string) {
  try {
    mkdirSync(resolve(LOG_FILE, ".."), { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // El log en archivo es auxiliar: sync_runs es la fuente de observabilidad.
  }
}

async function readState(deps: CommandDeps, now: Date) {
  const { db, store } = deps;
  const today = isoDay(now);
  const sessions = await store.getMarketSessions(CALENDAR_MIC, addDays(today, -20), addDays(today, 20));
  const latest = await db.from("security_market_snapshots").select("as_of_date").order("as_of_date", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error(`snapshots: ${latest.error.message}`);
  const snapshotsAsOf = latest.data?.as_of_date ?? null;
  let lagging = 0;
  if (snapshotsAsOf) {
    const universe = (await store.listIndexSecurities(INDEX)).length;
    const current = await db.from("security_market_snapshots").select("security_id", { count: "exact", head: true }).eq("as_of_date", snapshotsAsOf);
    if (current.error) throw new Error(`snapshots: ${current.error.message}`);
    lagging = Math.max(0, universe - (current.count ?? 0));
  }
  const groups = await db.from("group_index_series").select("end_date").eq("group_kind", "index").eq("group_key", INDEX).eq("method", "equal_weight").maybeSingle();
  if (groups.error) throw new Error(`group indices: ${groups.error.message}`);
  const lastRun = async (provider: string, jobType: string) => {
    const r = await db.from("sync_runs").select("finished_at").eq("provider", provider).eq("job_type", jobType).in("status", ["succeeded", "partial"]).order("finished_at", { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw new Error(`sync_runs: ${r.error.message}`);
    return r.data?.finished_at ?? null;
  };
  return {
    sessions,
    snapshotsAsOf,
    laggingSecurities: lagging,
    groupIndicesAsOf: groups.data?.end_date ?? null,
    lastSecSuccessAt: await lastRun("sec", "sec_fundamentals"),
    lastPriceRunAt: await lastRun("marketradar", "price_analysis"),
  };
}

function describe(plan: AutoSyncPlan): string {
  return `prices=${plan.prices} sec=${plan.sec} target=${plan.targetSession ?? "-"} next=${plan.nextFinalAt ?? "-"} · ${plan.reasons.join("; ")}`;
}

const NEWS_PRUNE_EVERY_HOURS = 20;

async function runNewsStep(deps: CommandDeps, now: Date): Promise<void> {
  const t0 = Date.now();
  try {
    const ctx = await loadNewsContext(deps.db);
    const result = await runNewsJob(deps.db, new SupabaseNewsStore(deps.db), ctx, { now, userAgent: deps.env.SEC_USER_AGENT ?? "MarketRadar personal research (non-commercial)", log: () => undefined });
    const m = result.metrics;
    const polled = result.sources.filter((x) => x.status !== "skipped").length;
    deps.log(`News: ${polled} sources polled · ${m.fetched} articles · ${m.inserted} new · events +${m.eventsCreated}/~${m.eventsUpdated}`);
    fileLog(`news · ${((Date.now() - t0) / 1000).toFixed(0)} s · sources ${polled} · fetched ${m.fetched} · inserted ${m.inserted} · events +${m.eventsCreated} ~${m.eventsUpdated} · errors ${result.sources.filter((x) => x.status === "error").map((x) => x.id).join(",") || "none"}`);
    const last = await deps.db.from("sync_runs").select("started_at").eq("job_type", "news_prune").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!last.data || now.getTime() - Date.parse(last.data.started_at) > NEWS_PRUNE_EVERY_HOURS * 3_600_000) {
      const startedAt = new Date().toISOString();
      const out = await pruneNews(deps.db, now, deps.log);
      await deps.db.from("sync_runs").insert({ provider: "marketradar", job_type: "news_prune", scope: "retention", status: "succeeded", started_at: startedAt, finished_at: new Date().toISOString(), records_read: 0, records_written: 0, metrics: out, params: {} });
    }
  } catch (error) {
    deps.log(`News step failed: ${error instanceof Error ? error.message : String(error)}`);
    fileLog(`news error · ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runAutoCommand(command: string, args: string[], deps: CommandDeps): Promise<void> {
  const { store, log } = deps;
  const now = new Date();

  if (command === "status") {
    const news = await deps.db.from("sync_runs").select("started_at, status, records_written").eq("job_type", "news_ingest").order("started_at", { ascending: false }).limit(1).maybeSingle();
    log(`Last news run      : ${news.data ? `${news.data.started_at} (${news.data.status}, ${news.data.records_written} new articles)` : "never"}`);
    const state = await readState(deps, now);
    const plan = planAutoSync({ now, ...state });
    log(`Last final session : ${plan.targetSession ?? "unknown (no calendar)"}`);
    log(`Next final session : ${plan.nextFinalAt ?? "-"}`);
    log(`Snapshots as of    : ${state.snapshotsAsOf ?? "none"} (${state.laggingSecurities} securities behind)`);
    log(`Synthetic indices  : ${state.groupIndicesAsOf ?? "none"}`);
    log(`Last price run     : ${state.lastPriceRunAt ?? "never"}`);
    log(`Last SEC sync      : ${state.lastSecSuccessAt ?? "never"}`);
    log(`Plan               : ${describe(plan)}`);
    return;
  }
  if (command !== "auto") throw new Error(`Unknown command: ${command}`);

  const holder = `${hostname()}:${process.pid}`;
  if (!(await store.acquireLease(LEASE, holder, LEASE_TTL_MS, now))) {
    log("Another sync holds the lease; exiting.");
    fileLog("skip · lease held by another run");
    return;
  }
  const started = Date.now();
  try {
    // Calendario: solo se refresca (y se registra) si no cubre al menos 30 días por delante.
    const ahead = await store.getMarketSessions(CALENDAR_MIC, addDays(isoDay(now), 30), addDays(isoDay(now), 60));
    if (ahead.length === 0) {
      const adapter = new AlpacaAdapter(new AlpacaClient({ keyId: requireSyncSecret(deps.env, "ALPACA_API_KEY_ID"), secretKey: requireSyncSecret(deps.env, "ALPACA_API_SECRET_KEY") }));
      await syncMarketCalendar({ adapter, store, now: () => new Date(), log, scope: "auto" });
    }

    // Noticias (24/7, independiente del calendario de mercado): cada fuente respeta su frecuencia de consulta.
    // Un fallo de noticias nunca bloquea los datos de mercado (y viceversa).
    if (!args.includes("--no-news") && !args.includes("--dry-run")) await runNewsStep(deps, now);

    const state = await readState(deps, now);
    const plan = planAutoSync({ now, ...state, force: args.includes("--force") });
    log(`Plan: ${describe(plan)}`);
    if (args.includes("--dry-run") || (!plan.prices && !plan.sec)) {
      fileLog(`noop · ${describe(plan)}`);
      return;
    }
    const securities = await store.listIndexSecurities(INDEX);
    let secStatus = "skipped";
    if (plan.sec) {
      const report = await runSecSync(deps, securities, { scope: `auto:index:${INDEX}`, maxAgeHours: SEC_CACHE_MAX_AGE_HOURS });
      // Acciones por clase del último 10-Q/10-K (solo descarga filings nuevos: caché por accession).
      const classes = await runShareClassSync(deps, securities, `auto:index:${INDEX}`);
      secStatus = `${report.status}/classes ${classes.status}`;
    }
    let priceSummary = "skipped";
    if (plan.prices) {
      const result = await runPricePipeline(deps, { tickers: securities.map((s) => s.ticker), scope: `auto:index:${INDEX}`, groupIndices: true, indexSlug: INDEX });
      priceSummary = `PASS ${result.counts.PASS} WARNING ${result.counts.WARNING} MISSING ${result.counts.MISSING} FAIL ${result.counts.FAIL} · ${result.requests} requests`;
      if (result.failed) process.exitCode = 1;
    }
    const pruned = await store.pruneSyncRuns(new Date(now.getTime() - SYNC_RUN_RETENTION_DAYS * 86_400_000).toISOString());
    if (pruned > 0) log(`  pruned ${pruned} sync_runs older than ${SYNC_RUN_RETENTION_DAYS} days`);
    fileLog(`run · ${((Date.now() - started) / 1000).toFixed(0)} s · sec=${secStatus} · prices: ${priceSummary} · ${describe(plan)}`);
  } catch (error) {
    fileLog(`error · ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    throw error;
  } finally {
    await store.releaseLease(LEASE, holder);
  }
}
