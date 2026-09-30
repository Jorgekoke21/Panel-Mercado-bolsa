/**
 * News Engine (Fase 4) — gratuito, sin claves.
 *
 *   news [--sources gdelt,sec-8k,…] [--force] [--dry-run] [--lookback 48] [--topics markets,energy]
 *       Ingesta: fuentes que tocan según su frecuencia (o todas con --force) → pipeline determinista.
 *   news-report
 *       Métricas: artículos, deduplicación, eventos, tipos, países, sectores, empresas, fuentes, almacenamiento.
 *   news-rebuild [--days 7]
 *       Reensambla los eventos desde los artículos guardados (tras cambiar reglas/grafo), sin red.
 *   news-prune
 *       Retención (artículos 21/120 días, eventos 120/365 días, caché de IA caducada).
 */
import { nodeLabel } from "@/knowledge/graph";
import { assembleEvent } from "@/news/assemble";
import { deserializeSeed, serializeSeed, type SerializedSeed } from "@/news/cluster";
import { MemoryNewsStore } from "@/news/memory-store";
import type { EventType, RawArticle } from "@/domain/news";
import { processArticle } from "@/news/process";
import { OFFICIAL_FEEDS } from "@/providers/news/official-feeds";
import { loadNewsContext, pruneNews, runNewsJob } from "@/sync/news-job";
import { SupabaseNewsStore } from "@/sync/news-store";
import { argValue, type CommandDeps } from "./shared";

export const NEWS_COMMANDS = ["news", "news-report", "news-rebuild", "news-prune"] as const;

const DEFAULT_UA = "MarketRadar personal research (non-commercial)";

export async function runNewsCommand(command: string, args: readonly string[], deps: CommandDeps): Promise<void> {
  const { db, log, env } = deps;
  const now = new Date();
  if (command === "news") {
    const t0 = Date.now();
    const ctx = await loadNewsContext(db);
    log(`universe: ${ctx.universe.companies.length} issuers · graph: ${ctx.graph.relations.length} relations${ctx.graph.unresolved.length ? ` (unresolved: ${ctx.graph.unresolved.join(",")})` : ""}`);
    const dryRun = args.includes("--dry-run");
    const store = dryRun ? new MemoryNewsStore() : new SupabaseNewsStore(db);
    const result = await runNewsJob(db, store, ctx, {
      now,
      userAgent: env.SEC_USER_AGENT ?? DEFAULT_UA,
      only: argValue(args, "--sources")?.split(",").map((s) => s.trim()).filter(Boolean),
      force: args.includes("--force"),
      dryRun,
      initialLookbackHours: Number(argValue(args, "--lookback") ?? 48),
      gdeltTopicsOnly: argValue(args, "--topics")?.split(","),
      log,
    });
    for (const s of result.sources) log(`  ${s.status.padEnd(7)} ${s.id.padEnd(14)} fetched ${String(s.fetched).padStart(4)} · requests ${s.requests}${s.message ? ` · ${s.message}` : ""}`);
    const m = result.metrics;
    log(`articles: fetched ${m.fetched} · duplicate URL ${m.duplicateUrl} · syndicated ${m.syndicated} · stale ${m.stale} · filtered ${m.filtered} · inserted ${m.inserted}`);
    log(`events: created ${m.eventsCreated} · updated ${m.eventsUpdated} · articles merged into existing events ${m.mergedIntoExisting}`);
    log(`entities: ${m.entityLinks} links (${m.directLinks} direct, ${m.inferredLinks} inferred) · impacts ${m.impacts} · relevant articles without specific entity ${m.unresolvedArticles}`);
    log(`filtered reasons: ${JSON.stringify(m.filteredReasons)}`);
    log(`by type: ${JSON.stringify(m.byType)}`);
    if (store instanceof MemoryNewsStore && args.includes("--show")) {
      const label = (n: string) => ctx.graph.label(n as never);
      const events = [...store.events.entries()].sort((a, b) => b[1].event.importance - a[1].event.importance).slice(0, Number(argValue(args, "--show") ?? 40));
      for (const [, { event: e }] of events) {
        log(`\n[${e.importance.toFixed(2)} | conf ${e.confidence.score.toFixed(2)} | ${e.type}${e.secondaryTypes.length ? `+${e.secondaryTypes.join("+")}` : ""} | src ${e.independentSources}${e.hasOfficialSource ? " official" : ""} | art ${e.articleCount} | ${e.languages.join(",")}] ${e.title}`);
        log(`   DIRECT: ${e.links.filter((l) => l.relation === "DIRECT").map((l) => `${label(l.node)}(${l.method} ${l.confidence})`).join(", ")}`);
        log(`   INFERRED: ${e.links.filter((l) => l.relation === "INFERRED").map((l) => label(l.node)).join(", ")}`);
        log(`   IMPACTS: ${e.impacts.slice(0, 6).map((i) => `${i.channel}:${label(i.target)} ${i.direction.replace("potential_", "")} ${i.confidence}`).join(" | ")}`);
        if (e.moves.length) log(`   MOVES: ${e.moves.map((m) => `${label(m.node)} ${m.move}`).join(", ")}`);
      }
    }
    log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s${dryRun ? " (dry run: nothing written)" : ""}`);
    return;
  }
  if (command === "news-report") {
    const count = async (table: "news_articles" | "news_events" | "news_event_entities" | "news_event_impacts") => {
      const r = await db.from(table).select("*", { count: "exact", head: true });
      return r.count ?? 0;
    };
    log(`articles ${await count("news_articles")} · events ${await count("news_events")} · entity links ${await count("news_event_entities")} · impacts ${await count("news_event_impacts")}`);
    const states = await db.from("news_source_state").select("source_id, last_success_at, last_fetched, last_inserted, last_requests, last_error").order("source_id");
    for (const s of states.data ?? []) log(`  ${s.source_id.padEnd(14)} last ok ${s.last_success_at ?? "never"} · fetched ${s.last_fetched} · inserted ${s.last_inserted} · requests ${s.last_requests}${s.last_error ? ` · ${s.last_error.slice(0, 100)}` : ""}`);
    const events = await db.from("news_events").select("id, event_type, title, importance, confidence, independent_sources, article_count, has_official_source, last_seen_at").order("importance", { ascending: false }).limit(25);
    log("top events:");
    for (const e of events.data ?? []) log(`  ${Number(e.importance).toFixed(2)} ${Number(e.confidence).toFixed(2)} ${e.event_type.padEnd(26)} src ${e.independent_sources}${e.has_official_source ? "*" : " "} art ${String(e.article_count).padStart(3)}  ${e.title.slice(0, 110)}`);
    const byType = await db.from("news_events").select("event_type");
    const types: Record<string, number> = {};
    for (const r of byType.data ?? []) types[r.event_type] = (types[r.event_type] ?? 0) + 1;
    log(`events by type: ${JSON.stringify(types)}`);
    const nodes = await db.from("news_event_entities").select("node, relation").eq("relation", "DIRECT").limit(20_000);
    const counts: Record<string, number> = {};
    for (const n of nodes.data ?? []) if (/^(country|commodity|factor|sector|industry|subIndustry|external):/.test(n.node)) counts[n.node] = (counts[n.node] ?? 0) + 1;
    log(`top direct nodes: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${nodeLabel(k)}=${v}`).join(", ")}`);
    const runs = await db.from("sync_runs").select("started_at, status, records_read, records_written, requests_made").eq("job_type", "news_ingest").order("started_at", { ascending: false }).limit(5);
    for (const r of runs.data ?? []) log(`  run ${r.started_at} ${r.status} read ${r.records_read} written ${r.records_written} requests ${r.requests_made}`);
    return;
  }
  if (command === "news-rebuild") {
    const days = Number(argValue(args, "--days") ?? 7);
    const ctx = await loadNewsContext(db);
    const store = new SupabaseNewsStore(db);
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    if (args.includes("--reprocess")) {
      // Reaplica las reglas actuales (clasificación, entidades, relevancia) a los artículos guardados, sin red.
      const scopes = new Map<string, "macro" | "regulator">([...OFFICIAL_FEEDS.map((f) => [f.id, f.relevanceScope] as const), ["sec-8k", "regulator"]]);
      const rows = await db.from("news_articles").select("id, url, title, snippet, source_id, publisher, tier, language, published_at, time_basis, hints, publisher_country, author").gte("published_at", since).limit(20_000);
      if (rows.error) throw new Error(rows.error.message);
      let updated = 0;
      let dropped = 0;
      for (const r of rows.data ?? []) {
        const raw: RawArticle = { sourceId: r.source_id, url: r.url, title: r.title, publishedAt: r.published_at, timeBasis: r.time_basis as RawArticle["timeBasis"], language: r.language, publisher: r.publisher, author: r.author, snippet: r.snippet, publisherCountry: r.publisher_country, hints: (r.hints as RawArticle["hints"]) ?? undefined };
        // "stale" se evalúa respecto a la fecha de ingesta original, no a hoy.
        const p = processArticle(raw, ctx.gazetteer, { now: new Date(r.published_at), sourceTier: r.tier === 1 ? 1 : undefined, relevanceScope: scopes.get(r.source_id) ?? "media" });
        if (!p.signals.relevant) {
          await db.from("news_articles").delete().eq("id", r.id);
          dropped++;
          continue;
        }
        const { type, ...signals } = p.signals;
        Reflect.deleteProperty(signals, "tokens");
        Reflect.deleteProperty(signals, "relevant");
        await db.from("news_articles").update({ event_type: type, signals: signals as never, publisher_key: p.publisherKey, tier: p.tier }).eq("id", r.id);
        updated++;
      }
      log(`reprocessed ${updated} articles · ${dropped} no longer relevant (deleted)`);
    }
    const events = await db.from("news_events").select("id, event_type, secondary_types, first_seen_at, last_seen_at, article_count, seed").gte("last_seen_at", since).limit(10_000);
    if (events.error) throw new Error(events.error.message);
    const ids = (events.data ?? []).map((e) => e.id);
    const articles = await store.loadEventArticles(ids);
    let rebuilt = 0;
    let removed = 0;
    for (const e of events.data ?? []) {
      const list = articles.get(e.id) ?? [];
      if (list.length === 0) {
        await db.from("news_events").delete().eq("id", e.id);
        removed++;
        continue;
      }
      const assembled = assembleEvent(list, { graph: ctx.graph, now, companyWeight: ctx.companyWeight });
      const seed = deserializeSeed({ id: e.id, type: e.event_type as EventType, secondaryTypes: e.secondary_types as EventType[], firstSeenAt: e.first_seen_at, lastSeenAt: e.last_seen_at, articleCount: e.article_count }, e.seed as unknown as SerializedSeed);
      await store.saveEvent(e.id, assembled, serializeSeed(seed));
      await store.replaceEventLinks(e.id, assembled.links);
      await store.replaceEventImpacts(e.id, assembled.impacts);
      rebuilt++;
    }
    log(`rebuilt ${rebuilt} events (${removed} empty removed)`);
    return;
  }
  if (command === "news-prune") {
    const startedAt = new Date().toISOString();
    const out = await pruneNews(db, now, log);
    await db.from("sync_runs").insert({ provider: "marketradar", job_type: "news_prune", scope: "retention", status: "succeeded", started_at: startedAt, finished_at: new Date().toISOString(), records_read: 0, records_written: 0, metrics: out, params: {} });
  }
}
