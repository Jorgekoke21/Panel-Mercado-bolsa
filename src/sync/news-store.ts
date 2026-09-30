import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/data/supabase/database.types";
import type { ArticleSignals, EntityLink, EventType, ImpactHypothesis, ProcessedArticle, SourceTier } from "@/domain/news";
import { parseNodeKey } from "@/knowledge/types";
import type { AssembledEvent, EventArticle } from "@/news/assemble";
import { deserializeSeed, type EventSeed, type SerializedSeed } from "@/news/cluster";
import type { NewsStore, StoredArticleRef } from "@/news/pipeline";

type JsonValue = NonNullable<Json>;
type Db = SupabaseClient<Database>;

/** Versión de las reglas deterministas (taxonomía, léxico, grafo). Se guarda en cada evento. */
export const NEWS_RULE_VERSION = "news-rules-2026.09.29";

const CHUNK = 80; // in(...) va en la URL de PostgREST: lotes pequeños para no exceder su longitud máxima

function check(op: string, r: { error: { message: string } | null }) {
  if (r.error) throw new Error(`${op}: ${r.error.message}`);
}

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Señales que se guardan por artículo (los tokens no: la firma del evento ya los contiene). */
function storedSignals(s: ArticleSignals): JsonValue {
  return {
    secondaryTypes: s.secondaryTypes,
    typeCertainty: s.typeCertainty,
    links: s.links.map((l) => ({ node: l.node, relation: l.relation, method: l.method, confidence: l.confidence, evidence: l.evidence, ...(l.via ? { via: l.via } : {}) })),
    polarity: s.polarity,
    moves: s.moves,
    flags: s.flags,
    relevanceReason: s.relevanceReason,
  } as unknown as JsonValue;
}

export class SupabaseNewsStore implements NewsStore {
  constructor(private readonly db: Db) {}

  async existingUrlHashes(hashes: readonly string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunks(hashes)) {
      const r = await this.db.from("news_articles").select("url_hash").in("url_hash", part);
      check("news_articles.url_hash", r);
      for (const row of r.data ?? []) out.add(row.url_hash);
    }
    return out;
  }

  async findByTitleHash(hashes: readonly string[], since: Date): Promise<Map<string, StoredArticleRef>> {
    const out = new Map<string, StoredArticleRef>();
    for (const part of chunks(hashes)) {
      const r = await this.db.from("news_articles").select("id, title_hash, event_id").in("title_hash", part).gte("published_at", since.toISOString()).order("published_at");
      check("news_articles.title_hash", r);
      for (const row of r.data ?? []) if (!out.has(row.title_hash)) out.set(row.title_hash, { id: row.id, eventId: row.event_id });
    }
    return out;
  }

  async addSyndication(articleId: number, publisherKey: string, count: number): Promise<void> {
    const r = await this.db.from("news_articles").select("syndication_count, also_seen_on").eq("id", articleId).maybeSingle();
    check("news_articles.syndication", r);
    if (!r.data) return;
    const also = r.data.also_seen_on.includes(publisherKey) || r.data.also_seen_on.length >= 10 ? r.data.also_seen_on : [...r.data.also_seen_on, publisherKey];
    const u = await this.db.from("news_articles").update({ syndication_count: r.data.syndication_count + count, also_seen_on: also }).eq("id", articleId);
    check("news_articles.syndication update", u);
  }

  async loadActiveSeeds(since: Date): Promise<EventSeed[]> {
    const r = await this.db.from("news_events").select("id, event_type, secondary_types, first_seen_at, last_seen_at, article_count, seed").gte("last_seen_at", since.toISOString()).limit(5000);
    check("news_events.seeds", r);
    return (r.data ?? []).map((row) =>
      deserializeSeed(
        { id: row.id, type: row.event_type as EventType, secondaryTypes: row.secondary_types as EventType[], firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, articleCount: row.article_count },
        row.seed as unknown as SerializedSeed,
      ),
    );
  }

  async insertArticles(rows: readonly { article: ProcessedArticle; eventId: string; syndication: string[] }[]): Promise<number[]> {
    // Los eventos nuevos deben existir antes que sus artículos (FK): se crean con una fila mínima.
    const ids: number[] = [];
    for (const part of chunks(rows)) {
      const newEvents = [...new Set(part.map((r) => r.eventId))];
      const existing = await this.db.from("news_events").select("id").in("id", newEvents);
      check("news_events.exists", existing);
      const have = new Set((existing.data ?? []).map((e) => e.id));
      const placeholders = part
        .filter((r) => !have.has(r.eventId))
        .filter((r, i, all) => all.findIndex((x) => x.eventId === r.eventId) === i)
        .map((r) => ({
          id: r.eventId,
          fingerprint: "pending",
          event_type: r.article.signals.type,
          title: r.article.title.slice(0, 500),
          summary: "",
          first_seen_at: r.article.publishedAt,
          last_seen_at: r.article.publishedAt,
          article_count: 1,
          independent_sources: 1,
          confidence: 0,
          confidence_breakdown: {},
          importance: 0,
          seed: {},
          rule_version: NEWS_RULE_VERSION,
        }));
      if (placeholders.length) check("news_events.placeholder", await this.db.from("news_events").insert(placeholders));
      const r = await this.db
        .from("news_articles")
        .insert(
          part.map(({ article: a, eventId, syndication }) => ({
            url_hash: a.urlHash,
            url: a.canonicalUrl,
            title: a.title.slice(0, 500),
            title_hash: a.titleHash,
            source_id: a.sourceId,
            publisher: a.publisher,
            publisher_key: a.publisherKey,
            tier: a.tier,
            language: a.language,
            published_at: a.publishedAt,
            time_basis: a.timeBasis,
            author: a.author ?? null,
            snippet: a.snippet ?? null,
            publisher_country: a.publisherCountry ?? null,
            event_id: eventId,
            event_type: a.signals.type,
            signals: storedSignals(a.signals),
            hints: (a.hints ?? null) as JsonValue,
            syndication_count: 1 + syndication.length,
            also_seen_on: [...new Set(syndication)].slice(0, 10),
          })),
        )
        .select("id");
      check("news_articles.insert", r);
      ids.push(...(r.data ?? []).map((x) => x.id));
    }
    return ids;
  }

  async loadEventArticles(eventIds: readonly string[]): Promise<Map<string, EventArticle[]>> {
    const out = new Map<string, EventArticle[]>();
    for (const part of chunks(eventIds, 100)) {
      const r = await this.db
        .from("news_articles")
        .select("id, url, title, publisher, publisher_key, tier, published_at, language, source_id, syndication_count, snippet, event_id, event_type, signals, hints")
        .in("event_id", part)
        .limit(10_000);
      check("news_articles.byEvent", r);
      for (const row of r.data ?? []) {
        if (!row.event_id) continue;
        const s = row.signals as unknown as Omit<ArticleSignals, "type" | "tokens" | "relevant">;
        const hints = row.hints as { primary?: boolean } | null;
        const list = out.get(row.event_id) ?? [];
        list.push({
          id: row.id,
          url: row.url,
          title: row.title,
          publisher: row.publisher,
          publisherKey: row.publisher_key,
          tier: row.tier as SourceTier,
          publishedAt: row.published_at,
          language: row.language,
          sourceId: row.source_id,
          syndicationCount: row.syndication_count,
          snippet: row.snippet,
          primary: !!hints?.primary,
          signals: { type: row.event_type as EventType, secondaryTypes: s.secondaryTypes ?? [], typeCertainty: s.typeCertainty ?? 0, links: s.links ?? [], polarity: s.polarity ?? 0, moves: s.moves ?? [], flags: s.flags ?? { unconfirmed: false, denial: false, opinion: false } },
        });
        out.set(row.event_id, list);
      }
    }
    return out;
  }

  async saveEvent(id: string, e: AssembledEvent, seed: SerializedSeed): Promise<void> {
    const row = {
      id,
      fingerprint: e.fingerprint,
      event_type: e.type,
      secondary_types: e.secondaryTypes,
      title: e.title.slice(0, 500),
      summary: e.summary,
      summary_origin: e.summaryOrigin,
      status_hint: e.status,
      first_seen_at: e.firstSeenAt,
      last_seen_at: e.lastSeenAt,
      article_count: e.articleCount,
      independent_sources: e.independentSources,
      has_official_source: e.hasOfficialSource,
      confidence: e.confidence.score,
      confidence_breakdown: e.confidence as unknown as JsonValue,
      importance: e.importance,
      contradictory: e.contradictory,
      unconfirmed: e.unconfirmed,
      polarity: e.polarity,
      languages: e.languages,
      moves: e.moves as unknown as JsonValue,
      representative_article_id: e.representativeArticleId,
      seed: seed as unknown as JsonValue,
      rule_version: NEWS_RULE_VERSION,
    };
    check("news_events.upsert", await this.db.from("news_events").upsert(row, { onConflict: "id" }));
  }

  async replaceEventLinks(eventId: string, links: readonly EntityLink[]): Promise<void> {
    check("news_event_entities.delete", await this.db.from("news_event_entities").delete().eq("event_id", eventId));
    if (links.length === 0) return;
    const rows = links.map((l) => ({
      event_id: eventId,
      node: l.node,
      node_kind: parseNodeKey(l.node)?.kind ?? "unknown",
      relation: l.relation,
      method: l.method,
      confidence: l.confidence,
      evidence: l.evidence.slice(0, 500),
      via: l.via ?? null,
    }));
    check("news_event_entities.insert", await this.db.from("news_event_entities").insert(rows));
  }

  async replaceEventImpacts(eventId: string, impacts: readonly ImpactHypothesis[]): Promise<void> {
    check("news_event_impacts.delete", await this.db.from("news_event_impacts").delete().eq("event_id", eventId).eq("origin", "rule"));
    const rows = impacts
      .filter((i) => i.origin === "rule")
      .map((i) => ({
        event_id: eventId,
        target: i.target,
        target_kind: parseNodeKey(i.target)?.kind ?? "unknown",
        channel: i.channel,
        direction: i.direction,
        strength: i.strength,
        horizon: i.horizon,
        confidence: i.confidence,
        mechanism: i.mechanism.slice(0, 200),
        rationale: i.rationale.slice(0, 1500),
        path: i.path,
        relation_ids: i.relationIds,
        origin: i.origin,
      }));
    if (rows.length) check("news_event_impacts.insert", await this.db.from("news_event_impacts").insert(rows));
  }
}
