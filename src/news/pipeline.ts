import { randomUUID } from "node:crypto";
import type { EntityLink, ImpactHypothesis, ProcessedArticle, RawArticle, SourceTier } from "@/domain/news";
import type { RelationGraph } from "@/knowledge/graph";
import { type AssembledEvent, assembleEvent, type EventArticle } from "./assemble";
import { clusterArticles, type EventSeed, type SerializedSeed, serializeSeed } from "./cluster";
import type { Gazetteer } from "./entities";
import { processArticle } from "./process";

/**
 * Pipeline del News Engine:
 *
 *   fuentes ─► procesado (URL canónica, señales) ─► dedup exacta (URL) ─► sindicación (titular 48 h)
 *          ─► filtro de relevancia ─► clustering con eventos activos ─► ensamblado del evento
 *          ─► entidades DIRECT/INFERRED + impactos + confianza ─► almacenamiento
 *
 * Todo es determinista y sin coste. La IA (si se activa) trabaja DESPUÉS, solo sobre eventos
 * seleccionados (src/intelligence/enrichment.ts).
 */
export interface StoredArticleRef {
  id: number;
  eventId: string | null;
}

export interface NewsStore {
  existingUrlHashes(hashes: readonly string[]): Promise<Set<string>>;
  /** Artículos con el mismo titular normalizado desde `since` (republicaciones). */
  findByTitleHash(hashes: readonly string[], since: Date): Promise<Map<string, StoredArticleRef>>;
  addSyndication(articleId: number, publisherKey: string, count: number): Promise<void>;
  /** Eventos activos (último artículo ≥ since) con su firma para el clustering. */
  loadActiveSeeds(since: Date): Promise<EventSeed[]>;
  /** `syndication`: editores que republicaron el mismo titular en este lote. */
  insertArticles(rows: readonly { article: ProcessedArticle; eventId: string; syndication: string[] }[]): Promise<number[]>;
  loadEventArticles(eventIds: readonly string[]): Promise<Map<string, EventArticle[]>>;
  saveEvent(id: string, event: AssembledEvent, seed: SerializedSeed, isNew: boolean): Promise<void>;
  replaceEventLinks(eventId: string, links: readonly EntityLink[]): Promise<void>;
  replaceEventImpacts(eventId: string, impacts: readonly ImpactHypothesis[]): Promise<void>;
}

export interface SourceBatch {
  sourceId: string;
  tier?: SourceTier;
  relevanceScope: "macro" | "regulator" | "media";
  articles: RawArticle[];
}

export interface PipelineMetrics {
  fetched: number;
  duplicateUrl: number;
  syndicated: number;
  stale: number;
  filtered: number;
  filteredReasons: Record<string, number>;
  inserted: number;
  eventsCreated: number;
  eventsUpdated: number;
  mergedIntoExisting: number;
  entityLinks: number;
  directLinks: number;
  inferredLinks: number;
  impacts: number;
  unresolvedArticles: number;
  bySource: Record<string, { fetched: number; inserted: number }>;
  byType: Record<string, number>;
  byCountry: Record<string, number>;
  bySector: Record<string, number>;
  byCompany: Record<string, number>;
}

export interface PipelineContext {
  gazetteer: Gazetteer;
  graph: RelationGraph;
  store: NewsStore;
  now: Date;
  companyWeight?: (companyId: string) => number;
  newId?: () => string;
}

const ACTIVE_WINDOW_MS = 72 * 3_600_000;
const SYNDICATION_WINDOW_MS = 48 * 3_600_000;

function emptyMetrics(): PipelineMetrics {
  return {
    fetched: 0, duplicateUrl: 0, syndicated: 0, stale: 0, filtered: 0, filteredReasons: {}, inserted: 0, eventsCreated: 0, eventsUpdated: 0,
    mergedIntoExisting: 0, entityLinks: 0, directLinks: 0, inferredLinks: 0, impacts: 0, unresolvedArticles: 0, bySource: {}, byType: {},
    byCountry: {}, bySector: {}, byCompany: {},
  };
}

const bump = (map: Record<string, number>, key: string, n = 1) => {
  map[key] = (map[key] ?? 0) + n;
};

export async function runNewsPipeline(batches: readonly SourceBatch[], ctx: PipelineContext): Promise<{ metrics: PipelineMetrics; touchedEvents: string[] }> {
  const metrics = emptyMetrics();
  const newId = ctx.newId ?? randomUUID;

  // 1) Procesado.
  const processed: ProcessedArticle[] = [];
  for (const batch of batches) {
    const src = (metrics.bySource[batch.sourceId] ??= { fetched: 0, inserted: 0 });
    for (const raw of batch.articles) {
      metrics.fetched++;
      src.fetched++;
      processed.push(processArticle(raw, ctx.gazetteer, { now: ctx.now, sourceTier: batch.tier, relevanceScope: batch.relevanceScope }));
    }
  }

  // 2) Deduplicación exacta por URL canónica (en el lote y contra la base).
  const byUrl = new Map<string, ProcessedArticle>();
  for (const a of processed) {
    const cur = byUrl.get(a.urlHash);
    if (!cur) byUrl.set(a.urlHash, a);
    else {
      metrics.duplicateUrl++;
      // Si dos fuentes traen la misma URL, se queda la que aporta más metadatos (tier menor, pistas).
      if (a.tier < cur.tier || (!!a.hints && !cur.hints)) byUrl.set(a.urlHash, a);
    }
  }
  const existing = await ctx.store.existingUrlHashes([...byUrl.keys()]);
  const fresh = [...byUrl.values()].filter((a) => {
    if (existing.has(a.urlHash)) {
      metrics.duplicateUrl++;
      return false;
    }
    return true;
  });

  // 3) Sindicación: mismo titular normalizado (48 h) ⇒ se suma a la fila existente.
  const stored = await ctx.store.findByTitleHash([...new Set(fresh.map((a) => a.titleHash))], new Date(ctx.now.getTime() - SYNDICATION_WINDOW_MS));
  const byTitle = new Map<string, ProcessedArticle[]>();
  for (const a of fresh) {
    const list = byTitle.get(a.titleHash) ?? [];
    list.push(a);
    byTitle.set(a.titleHash, list);
  }
  const candidates: { article: ProcessedArticle; syndication: string[] }[] = [];
  for (const [hash, list] of byTitle) {
    list.sort((x, y) => x.tier - y.tier || Date.parse(x.publishedAt) - Date.parse(y.publishedAt) || x.canonicalUrl.localeCompare(y.canonicalUrl));
    const already = stored.get(hash);
    if (already) {
      metrics.syndicated += list.length;
      for (const a of list) await ctx.store.addSyndication(already.id, a.publisherKey, 1);
      continue;
    }
    const [first, ...rest] = list;
    if (!first) continue;
    metrics.syndicated += rest.length;
    candidates.push({ article: first, syndication: rest.map((r) => r.publisherKey) });
  }

  // 4) Relevancia.
  const relevant: { article: ProcessedArticle; syndication: string[] }[] = [];
  for (const c of candidates) {
    if (c.article.stale) metrics.stale++;
    if (!c.article.signals.relevant) {
      metrics.filtered++;
      bump(metrics.filteredReasons, c.article.signals.relevanceReason);
      continue;
    }
    if (!c.article.signals.links.some((l) => l.relation === "DIRECT" && !l.node.startsWith("country:") && !l.node.startsWith("factor:") && !l.node.startsWith("index:"))) metrics.unresolvedArticles++;
    relevant.push(c);
  }

  // 5) Clustering contra los eventos activos.
  const seeds = await ctx.store.loadActiveSeeds(new Date(ctx.now.getTime() - ACTIVE_WINDOW_MS));
  const clusters = clusterArticles(
    relevant.map((r) => r.article),
    seeds,
  );
  const idMap = new Map<string, string>();
  for (const [seedId, seed] of clusters.seeds) idMap.set(seedId, seed.isNew ? newId() : seedId);
  const rows = relevant.map((r, i) => ({ article: r.article, syndication: r.syndication, eventId: idMap.get(clusters.assignments.get(i) ?? "") as string }));
  metrics.mergedIntoExisting = rows.filter((r, i) => !clusters.seeds.get(clusters.assignments.get(i) ?? "")?.isNew).length;
  const ids = await ctx.store.insertArticles(rows);
  metrics.inserted = ids.length;
  for (const r of rows) {
    const src = metrics.bySource[r.article.sourceId];
    if (src) src.inserted++;
  }

  // 6) Ensamblado de los eventos tocados.
  const touched = [...new Set(rows.map((r) => r.eventId))];
  const articlesByEvent = await ctx.store.loadEventArticles(touched);
  for (const [seedId, seed] of clusters.seeds) {
    const id = idMap.get(seedId) as string;
    if (!touched.includes(id)) continue;
    const articles = articlesByEvent.get(id) ?? [];
    if (articles.length === 0) continue;
    const event = assembleEvent(articles, { graph: ctx.graph, now: ctx.now, companyWeight: ctx.companyWeight });
    await ctx.store.saveEvent(id, event, serializeSeed(seed), seed.isNew);
    await ctx.store.replaceEventLinks(id, event.links);
    await ctx.store.replaceEventImpacts(id, event.impacts);
    if (seed.isNew) metrics.eventsCreated++;
    else metrics.eventsUpdated++;
    metrics.entityLinks += event.links.length;
    metrics.directLinks += event.links.filter((l) => l.relation === "DIRECT").length;
    metrics.inferredLinks += event.links.filter((l) => l.relation === "INFERRED").length;
    metrics.impacts += event.impacts.length;
    bump(metrics.byType, event.type);
    for (const l of event.links) {
      if (l.node.startsWith("country:") && l.relation === "DIRECT") bump(metrics.byCountry, l.node.slice(8));
      if (l.node.startsWith("sector:")) bump(metrics.bySector, ctx.graph.label(l.node));
      if (l.node.startsWith("company:") && l.relation === "DIRECT") bump(metrics.byCompany, ctx.graph.universe.byCompanyId.get(l.node.slice(8))?.primaryTicker ?? l.node);
    }
  }
  return { metrics, touchedEvents: touched };
}
