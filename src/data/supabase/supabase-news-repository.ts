import "server-only";
import { DataAccessError } from "@/data/errors";
import type { EventQuery, IngestRun, NewsRepository, SourceStatus, StoredAiOutput } from "@/data/repositories/news-repository";
import type { ConfidenceBreakdown, EntityLink, EventSource, EventType, ImpactHypothesis, NewsEvent, SourceTier } from "@/domain/news";
import type { Move, NodeKey } from "@/knowledge/types";
import { eventStatus } from "@/news/assemble";
import { refreshConfidence } from "@/news/confidence";
import type { MarketRadarSupabase } from "./server-client";

function fail(operation: string, error: { message: string }): never {
  throw new DataAccessError(`Database query failed (${operation})`, operation, { cause: error });
}

const EVENT_COLUMNS =
  "id, fingerprint, event_type, secondary_types, title, summary, summary_origin, first_seen_at, last_seen_at, article_count, independent_sources, has_official_source, confidence, confidence_breakdown, importance, contradictory, unconfirmed, polarity, languages, moves, representative_article_id";

// UUID filters are encoded in the URL; keep requests below the local gateway's URI limit.
const EVENT_QUERY_BATCH_SIZE = 100;

interface EventRow {
  id: string;
  fingerprint: string;
  event_type: string;
  secondary_types: string[];
  title: string;
  representative_article_id: number | null;
  summary: string;
  summary_origin: string;
  first_seen_at: string;
  last_seen_at: string;
  article_count: number;
  independent_sources: number;
  has_official_source: boolean;
  confidence: number;
  confidence_breakdown: unknown;
  importance: number;
  contradictory: boolean;
  unconfirmed: boolean;
  polarity: number;
  languages: string[];
  moves: unknown;
}

export class SupabaseNewsRepository implements NewsRepository {
  constructor(
    private readonly db: MarketRadarSupabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toEvent(row: EventRow, links: EntityLink[], impacts: ImpactHypothesis[], representative?: { language: string | null; url: string; publisher: string }): NewsEvent {
    const now = this.now();
    const breakdown = refreshConfidence(row.confidence_breakdown as ConfidenceBreakdown, row.last_seen_at, now);
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      type: row.event_type as EventType,
      secondaryTypes: row.secondary_types as EventType[],
      title: row.title,
      originalLanguage: representative?.language ?? null,
      originalUrl: representative?.url ?? null,
      source: representative?.publisher ?? null,
      summary: row.summary,
      summaryOrigin: row.summary_origin as NewsEvent["summaryOrigin"],
      status: eventStatus(row.first_seen_at, row.last_seen_at, now),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      articleCount: row.article_count,
      independentSources: row.independent_sources,
      hasOfficialSource: row.has_official_source,
      confidence: breakdown,
      importance: Number(row.importance),
      contradictory: row.contradictory,
      unconfirmed: row.unconfirmed,
      languages: row.languages,
      links,
      impacts,
      moves: (row.moves as { node: NodeKey; move: Move; evidence: string }[]) ?? [],
      polarity: Math.sign(row.polarity) as -1 | 0 | 1,
    };
  }

  private async hydrate(rows: EventRow[]): Promise<NewsEvent[]> {
    const events: NewsEvent[] = [];
    for (let i = 0; i < rows.length; i += EVENT_QUERY_BATCH_SIZE) {
      events.push(...await this.hydrateBatch(rows.slice(i, i + EVENT_QUERY_BATCH_SIZE)));
    }
    return events;
  }

  private async hydrateBatch(rows: EventRow[]): Promise<NewsEvent[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const representativeIds = rows.map((r) => r.representative_article_id).filter((id): id is number => id !== null);
    const [ents, imps, representatives] = await Promise.all([
      this.db.from("news_event_entities").select("event_id, node, relation, method, confidence, evidence, via").in("event_id", ids),
      this.db.from("news_event_impacts").select("event_id, target, channel, direction, strength, horizon, confidence, mechanism, rationale, path, relation_ids, origin").in("event_id", ids),
      representativeIds.length ? this.db.from("news_articles").select("id, language, url, publisher").in("id", representativeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (ents.error) fail("news.entities", ents.error);
    if (imps.error) fail("news.impacts", imps.error);
    if (representatives.error) fail("news.representatives", representatives.error);
    const representativeById = new Map((representatives.data ?? []).map((article) => [article.id, article]));
    const links = new Map<string, EntityLink[]>();
    for (const e of ents.data ?? []) {
      const list = links.get(e.event_id) ?? [];
      list.push({ node: e.node as NodeKey, relation: e.relation as EntityLink["relation"], method: e.method as EntityLink["method"], confidence: Number(e.confidence), evidence: e.evidence, via: (e.via as NodeKey | null) ?? undefined });
      links.set(e.event_id, list);
    }
    const impacts = new Map<string, ImpactHypothesis[]>();
    for (const i of imps.data ?? []) {
      const list = impacts.get(i.event_id) ?? [];
      list.push({ target: i.target as NodeKey, channel: i.channel as ImpactHypothesis["channel"], direction: i.direction as ImpactHypothesis["direction"], strength: i.strength as 1 | 2 | 3, horizon: i.horizon as ImpactHypothesis["horizon"], confidence: Number(i.confidence), mechanism: i.mechanism, rationale: i.rationale, path: i.path as NodeKey[], relationIds: i.relation_ids, origin: i.origin as ImpactHypothesis["origin"] });
      impacts.set(i.event_id, list);
    }
    return rows.map((r) =>
      this.toEvent(
        r,
        (links.get(r.id) ?? []).sort((a, b) => Number(a.relation === "INFERRED") - Number(b.relation === "INFERRED") || b.confidence - a.confidence),
        (impacts.get(r.id) ?? []).sort((a, b) => b.confidence * b.strength - a.confidence * a.strength),
        r.representative_article_id === null ? undefined : representativeById.get(r.representative_article_id),
      ),
    );
  }

  async listEvents(query: EventQuery): Promise<NewsEvent[]> {
    let q = this.db.from("news_events").select(EVENT_COLUMNS).neq("fingerprint", "pending");
    if (query.since) q = q.gte("last_seen_at", query.since);
    if (query.types?.length) q = q.in("event_type", [...query.types]);
    if (query.minImportance !== undefined) q = q.gte("importance", query.minImportance);
    q = query.order === "recent" ? q.order("last_seen_at", { ascending: false }) : q.order("importance", { ascending: false }).order("last_seen_at", { ascending: false });
    const { data, error } = await q.limit(query.limit ?? 50);
    if (error) fail("news.listEvents", error);
    return this.hydrate(data as EventRow[]);
  }

  async eventsForNodes(nodes: readonly NodeKey[], query: EventQuery): Promise<NewsEvent[]> {
    if (nodes.length === 0) return [];
    const list = [...new Set(nodes)];
    const [ents, imps] = await Promise.all([
      this.db.from("news_event_entities").select("event_id").in("node", list).limit(2000),
      this.db.from("news_event_impacts").select("event_id").in("target", list).limit(2000),
    ]);
    if (ents.error) fail("news.nodeEntities", ents.error);
    if (imps.error) fail("news.nodeImpacts", imps.error);
    const ids = [...new Set([...(ents.data ?? []), ...(imps.data ?? [])].map((r) => r.event_id))];
    if (ids.length === 0) return [];
    const out: EventRow[] = [];
    for (let i = 0; i < ids.length; i += EVENT_QUERY_BATCH_SIZE) {
      let q = this.db.from("news_events").select(EVENT_COLUMNS).in("id", ids.slice(i, i + EVENT_QUERY_BATCH_SIZE)).neq("fingerprint", "pending");
      if (query.since) q = q.gte("last_seen_at", query.since);
      if (query.types?.length) q = q.in("event_type", [...query.types]);
      if (query.minImportance !== undefined) q = q.gte("importance", query.minImportance);
      const { data, error } = await q;
      if (error) fail("news.eventsForNodes", error);
      out.push(...(data as EventRow[]));
    }
    out.sort((a, b) => (query.order === "recent" ? b.last_seen_at.localeCompare(a.last_seen_at) : Number(b.importance) - Number(a.importance) || b.last_seen_at.localeCompare(a.last_seen_at)));
    return this.hydrate(out.slice(0, query.limit ?? 50));
  }

  async getEvent(id: string): Promise<{ event: NewsEvent; sources: EventSource[] } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await this.db.from("news_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
    if (error) fail("news.getEvent", error);
    if (!data) return null;
    const [event] = await this.hydrate([data as EventRow]);
    const arts = await this.db
      .from("news_articles")
      .select("id, url, title, publisher, publisher_key, tier, published_at, language, source_id, syndication_count, signals, snippet")
      .eq("event_id", id)
      .order("tier")
      .order("published_at")
      .limit(200);
    if (arts.error) fail("news.articles", arts.error);
    const sources: EventSource[] = (arts.data ?? []).map((a) => {
      const s = a.signals as { polarity?: number; flags?: { unconfirmed?: boolean } };
      return { articleId: a.id, url: a.url, title: a.title, publisher: a.publisher, publisherKey: a.publisher_key, tier: a.tier as SourceTier, publishedAt: a.published_at, language: a.language, sourceId: a.source_id, syndicationCount: a.syndication_count, polarity: Math.sign(s.polarity ?? 0) as -1 | 0 | 1, unconfirmed: !!s.flags?.unconfirmed, snippet: a.snippet };
    });
    return event ? { event, sources } : null;
  }

  async listSourceStatus(): Promise<SourceStatus[]> {
    const { data, error } = await this.db.from("news_source_state").select("*").order("source_id");
    if (error) fail("news.sources", error);
    return (data ?? []).map((s) => ({ sourceId: s.source_id, label: s.label, kind: s.kind, tier: s.tier, licenseTerms: s.license_terms, lastAttemptAt: s.last_attempt_at, lastSuccessAt: s.last_success_at, lastError: s.last_error, lastFetched: s.last_fetched, lastInserted: s.last_inserted, lastRequests: s.last_requests }));
  }

  async latestRuns(limit: number): Promise<IngestRun[]> {
    const { data, error } = await this.db
      .from("sync_runs")
      .select("id, job_type, status, started_at, finished_at, records_read, records_written, requests_made, metrics")
      .in("job_type", ["news_ingest", "news_prune", "ai_enrichment"])
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) fail("news.runs", error);
    return (data ?? []).map((r) => ({ id: r.id, jobType: r.job_type, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, recordsRead: r.records_read, recordsWritten: r.records_written, requestsMade: r.requests_made, metrics: (r.metrics as Record<string, unknown>) ?? {} }));
  }

  async getAiOutput(subject: string, task: string): Promise<StoredAiOutput | null> {
    const { data, error } = await this.db.from("ai_outputs").select("task, subject, provider, model, prompt_version, output, created_at").eq("subject", subject).eq("task", task).eq("status", "valid").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) fail("news.aiOutput", error);
    return data ? { task: data.task, subject: data.subject, provider: data.provider, model: data.model, promptVersion: data.prompt_version, output: data.output, createdAt: data.created_at } : null;
  }
}
