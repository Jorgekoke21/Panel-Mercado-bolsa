import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/data/supabase/database.types";
import { SupabaseReferenceRepository } from "@/data/supabase/supabase-reference-repository";
import { buildRelationGraph, type RelationGraph } from "@/knowledge/graph";
import { buildUniverse, type Universe } from "@/knowledge/universe";
import { COMPANY_ALIAS_OVERRIDES, AMBIGUOUS_WORDS } from "@/news/aliases";
import { buildGazetteer, generatedAliases, type Gazetteer } from "@/news/entities";
import { type NewsStore, type PipelineMetrics, runNewsPipeline, type SourceBatch } from "@/news/pipeline";
import { fold } from "@/news/text";
import { GdeltSource } from "@/providers/news/gdelt";
import { NewsHttpClient } from "@/providers/news/http";
import { OFFICIAL_FEEDS, OfficialFeedSource } from "@/providers/news/official-feeds";
import type { NewsSource } from "@/providers/news/ports";
import { PUBLISHER_FEEDS, PublisherFeedSource, YahooTickerFeedSource } from "@/providers/news/publisher-feeds";
import { SecCurrentFilingsSource } from "@/providers/news/sec-current";
import type { MarketRadarSupabase } from "@/data/supabase/server-client";

type JsonValue = NonNullable<Json>;
type Db = SupabaseClient<Database>;

/**
 * Job de ingesta de noticias (CLI `npm run sync -- news`). Lee el universo de NUESTRA base, consulta
 * las fuentes que tocan según su frecuencia, ejecuta el pipeline determinista y registra métricas.
 * Coste: 0 € (todas las fuentes son gratuitas y sin clave).
 */
export interface NewsContextData {
  universe: Universe;
  gazetteer: Gazetteer;
  graph: RelationGraph;
  /** Peso de mercado (percentil de capitalización verificada) por emisor. */
  companyWeight: (companyId: string) => number;
  /** Emisores ordenados por capitalización (para la rotación de GDELT). */
  companiesByCap: string[];
}

export async function loadNewsContext(db: Db): Promise<NewsContextData> {
  const reference = new SupabaseReferenceRepository(db as unknown as MarketRadarSupabase);
  const securities = await reference.listSecurities();
  const ciks = await db.from("companies").select("id, cik");
  if (ciks.error) throw new Error(`companies: ${ciks.error.message}`);
  const universe = buildUniverse(securities, new Map((ciks.data ?? []).filter((c) => c.cik).map((c) => [c.id, c.cik as string])));
  const caps = await db.from("security_market_snapshots").select("security_id, market_cap").not("market_cap", "is", null);
  if (caps.error) throw new Error(`snapshots: ${caps.error.message}`);
  const capBySecurity = new Map((caps.data ?? []).map((r) => [r.security_id, Number(r.market_cap)]));
  const capByCompany = new Map<string, number>();
  for (const c of universe.companies) {
    const total = Object.values(c.securityIds).reduce((s, id) => s + (capBySecurity.get(id) ?? 0), 0);
    capByCompany.set(c.companyId, total);
  }
  const ranked = [...capByCompany.entries()].sort((a, b) => b[1] - a[1]);
  const percentile = new Map(ranked.map(([id], i) => [id, ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1]));
  return {
    universe,
    gazetteer: buildGazetteer(universe),
    graph: buildRelationGraph(universe),
    companyWeight: (id) => percentile.get(id) ?? 0,
    companiesByCap: ranked.map(([id]) => id),
  };
}

/** Nombre de búsqueda de una empresa para GDELT (alias de prensa no ambiguo). */
export function searchName(universe: Universe, companyId: string): string | null {
  const c = universe.byCompanyId.get(companyId);
  if (!c) return null;
  const override = c.tickers.map((t) => COMPANY_ALIAS_OVERRIDES[t]).find(Boolean);
  const candidates = [...(override?.add ?? []), ...generatedAliases(c.name).reverse()];
  const blocked = new Set((override?.block ?? []).map(fold));
  return candidates.find((n) => n.length >= 4 && !AMBIGUOUS_WORDS.has(fold(n)) && !blocked.has(fold(n)) && !/[()]/.test(n)) ?? null;
}

export interface NewsJobOptions {
  now: Date;
  userAgent: string;
  /** Ids de fuentes (gdelt, sec-8k, fed-monetary…). Por defecto, todas. */
  only?: readonly string[];
  /** Ignora la frecuencia de consulta de cada fuente. */
  force?: boolean;
  /** Ventana máxima hacia atrás en la primera ejecución (horas). */
  initialLookbackHours?: number;
  log: (line: string) => void;
  dryRun?: boolean;
  gdeltTopicsOnly?: readonly string[];
}

export function buildSources(ctx: NewsContextData, options: Pick<NewsJobOptions, "userAgent" | "gdeltTopicsOnly">): NewsSource[] {
  const http = new NewsHttpClient({ provider: "official-feeds", userAgent: options.userAgent, minIntervalMs: 300 });
  // Algunos editores rechazan agentes sin aspecto de navegador: se declara como lector RSS.
  const mediaHttp = new NewsHttpClient({ provider: "publisher-feeds", userAgent: "Mozilla/5.0 (compatible; MarketRadar RSS reader; personal research)", minIntervalMs: 500 });
  const names = ctx.companiesByCap.map((id) => searchName(ctx.universe, id)).filter((n): n is string => !!n);
  const ciks = new Map(ctx.universe.companies.filter((c) => c.cik).map((c) => [c.cik as string, c.name]));
  return [
    new SecCurrentFilingsSource({ userAgent: options.userAgent, universeCiks: ciks }),
    ...OFFICIAL_FEEDS.map((def) => new OfficialFeedSource(def, http)),
    ...PUBLISHER_FEEDS.map((def) => new PublisherFeedSource(def, mediaHttp)),
    new YahooTickerFeedSource(ctx.companiesByCap.map((id) => ctx.universe.byCompanyId.get(id)?.primaryTicker).filter((t): t is string => !!t), mediaHttp),
    new GdeltSource({ userAgent: options.userAgent, companyNames: names, onlyTopics: options.gdeltTopicsOnly }),
  ];
}

interface SourceStateRow {
  source_id: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  cursor: Json;
}

export interface NewsJobResult {
  metrics: PipelineMetrics;
  sources: { id: string; status: "ok" | "skipped" | "error"; fetched: number; requests: number; message?: string }[];
  runId: string | null;
}

export async function runNewsJob(db: Db, store: NewsStore, ctx: NewsContextData, options: NewsJobOptions): Promise<NewsJobResult> {
  const startedAt = new Date().toISOString();
  const run = options.dryRun
    ? null
    : await db.from("sync_runs").insert({ provider: "marketradar", job_type: "news_ingest", scope: options.only?.join(",") || "all", status: "running", started_at: startedAt, params: { force: !!options.force, only: options.only ? [...options.only] : null } }).select("id").single();
  if (run?.error) throw new Error(`sync_runs: ${run.error.message}`);

  const stateRows = await db.from("news_source_state").select("source_id, last_success_at, last_attempt_at, cursor");
  if (stateRows.error) throw new Error(`news_source_state: ${stateRows.error.message}`);
  const state = new Map((stateRows.data as SourceStateRow[]).map((r) => [r.source_id, r]));

  const sources = buildSources(ctx, options).filter((s) => !options.only?.length || options.only.includes(s.id));
  const batches: SourceBatch[] = [];
  const report: NewsJobResult["sources"] = [];
  const pendingState: Database["public"]["Tables"]["news_source_state"]["Insert"][] = [];
  const lookbackMs = (options.initialLookbackHours ?? 48) * 3_600_000;
  for (const source of sources) {
    const st = state.get(source.id);
    const lastSuccess = st?.last_success_at ? Date.parse(st.last_success_at) : null;
    if (!options.force && lastSuccess && options.now.getTime() - lastSuccess < source.pollMinutes * 60_000 * 0.9) {
      report.push({ id: source.id, status: "skipped", fetched: 0, requests: 0, message: `polled ${Math.round((options.now.getTime() - lastSuccess) / 60_000)} min ago` });
      continue;
    }
    // Ventana con solape de 2 h sobre el último éxito (las fuentes publican con retraso).
    const since = new Date(lastSuccess ? Math.max(lastSuccess - 2 * 3_600_000, options.now.getTime() - lookbackMs) : options.now.getTime() - lookbackMs);
    options.log(`· ${source.id} since ${since.toISOString()}`);
    try {
      const result = await source.fetch({ now: options.now, since, cursor: (st?.cursor as Record<string, unknown>) ?? {}, log: options.log });
      batches.push({ sourceId: source.id, tier: source.tier, relevanceScope: source.relevanceScope, articles: result.articles });
      report.push({ id: source.id, status: "ok", fetched: result.articles.length, requests: result.requests, message: result.warnings.length ? result.warnings.slice(0, 3).join(" | ") : undefined });
      // El éxito se registra DESPUÉS de persistir los artículos (si el pipeline falla, la próxima ejecución repite la ventana).
      pendingState.push({ source_id: source.id, label: source.label, kind: source.kind, tier: source.tier ?? null, license_terms: source.license.terms, last_attempt_at: options.now.toISOString(), last_success_at: options.now.toISOString(), last_error: result.warnings.length ? result.warnings.slice(0, 3).join(" | ").slice(0, 500) : null, last_fetched: result.articles.length, last_requests: result.requests, cursor: (result.cursor ?? st?.cursor ?? {}) as JsonValue, updated_at: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.push({ id: source.id, status: "error", fetched: 0, requests: 0, message });
      options.log(`  ✗ ${source.id}: ${message}`);
      if (!options.dryRun) {
        await db.from("news_source_state").upsert({ source_id: source.id, label: source.label, kind: source.kind, tier: source.tier ?? null, license_terms: source.license.terms, last_attempt_at: options.now.toISOString(), last_error: message.slice(0, 500), updated_at: new Date().toISOString() }, { onConflict: "source_id" });
      }
    }
  }

  let metrics: PipelineMetrics;
  try {
    ({ metrics } = await runNewsPipeline(batches, { gazetteer: ctx.gazetteer, graph: ctx.graph, store, now: options.now, companyWeight: ctx.companyWeight }));
  } catch (error) {
    // La ejecución nunca queda "running": se cierra como fallida con el error (sin secretos).
    if (run?.data) await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), errors: [{ kind: "pipeline", message: error instanceof Error ? error.message : String(error) }] as unknown as JsonValue }).eq("id", run.data.id);
    throw error;
  }
  if (!options.dryRun) {
    for (const row of pendingState) {
      const u = await db.from("news_source_state").upsert({ ...row, last_inserted: metrics.bySource[row.source_id]?.inserted ?? 0 }, { onConflict: "source_id" });
      if (u.error) throw new Error(`news_source_state: ${u.error.message}`);
    }
  }
  const errors = report.filter((r) => r.status === "error");
  if (run?.data) {
    const f = await db
      .from("sync_runs")
      .update({
        status: errors.length === 0 ? "succeeded" : errors.length < report.filter((r) => r.status !== "skipped").length ? "partial" : "failed",
        finished_at: new Date().toISOString(),
        records_read: metrics.fetched,
        records_written: metrics.inserted,
        requests_made: report.reduce((s, r) => s + r.requests, 0),
        errors: errors.map((e) => ({ kind: "source", message: `${e.id}: ${e.message}` })) as unknown as JsonValue,
        warnings: report.filter((r) => r.message && r.status === "ok").map((r) => ({ kind: "source", message: `${r.id}: ${r.message}` })) as unknown as JsonValue,
        metrics: { ...metrics, sources: report } as unknown as JsonValue,
      })
      .eq("id", run.data.id);
    if (f.error) throw new Error(`sync_runs: ${f.error.message}`);
  }
  return { metrics, sources: report, runId: run?.data?.id ?? null };
}

/**
 * Retención (plan Free de Supabase: espacio limitado):
 *   * artículos > 21 días: se borran salvo los 5 mejores de cada evento que se conserva;
 *   * artículos > 120 días: todos;
 *   * eventos sin actividad en 120 días con importancia < 0.6, y todos a los 365 días (en cascada: entidades e impactos);
 *   * ai_outputs caducados.
 */
export async function pruneNews(db: Db, now: Date, log: (l: string) => void): Promise<Record<string, number>> {
  const day = 86_400_000;
  const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const out: Record<string, number> = {};
  const oldEvents = await db.from("news_events").delete({ count: "exact" }).lt("last_seen_at", iso(120 * day)).lt("importance", 0.6);
  out.eventsLowImportance = oldEvents.count ?? 0;
  const veryOld = await db.from("news_events").delete({ count: "exact" }).lt("last_seen_at", iso(365 * day));
  out.eventsExpired = veryOld.count ?? 0;
  const ancient = await db.from("news_articles").delete({ count: "exact" }).lt("published_at", iso(120 * day));
  out.articlesExpired = ancient.count ?? 0;
  // Artículos antiguos no representativos: se conservan los 5 de mejor tier por evento.
  const candidates = await db.from("news_articles").select("id, event_id, tier, published_at").lt("published_at", iso(21 * day)).order("event_id").limit(20_000);
  if (candidates.error) throw new Error(candidates.error.message);
  const byEvent = new Map<string, { id: number; tier: number; published_at: string }[]>();
  const orphan: number[] = [];
  for (const r of candidates.data ?? []) {
    if (!r.event_id) {
      orphan.push(r.id);
      continue;
    }
    const list = byEvent.get(r.event_id) ?? [];
    list.push(r);
    byEvent.set(r.event_id, list);
  }
  const representatives = await db.from("news_events").select("representative_article_id").in("id", [...byEvent.keys()].slice(0, 5000));
  const keepRep = new Set((representatives.data ?? []).map((r) => r.representative_article_id).filter((x): x is number => x !== null));
  const toDelete = [...orphan];
  for (const list of byEvent.values()) {
    list.sort((a, b) => a.tier - b.tier || a.published_at.localeCompare(b.published_at));
    toDelete.push(...list.slice(5).map((a) => a.id).filter((id) => !keepRep.has(id)));
  }
  for (let i = 0; i < toDelete.length; i += 500) await db.from("news_articles").delete().in("id", toDelete.slice(i, i + 500));
  out.articlesPruned = toDelete.length;
  const ai = await db.from("ai_outputs").delete({ count: "exact" }).lt("expires_at", now.toISOString());
  out.aiExpired = ai.count ?? 0;
  log(`prune: ${JSON.stringify(out)}`);
  return out;
}
