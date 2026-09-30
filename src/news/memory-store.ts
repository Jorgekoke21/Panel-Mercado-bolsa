import type { EntityLink, ImpactHypothesis, ProcessedArticle } from "@/domain/news";
import type { AssembledEvent, EventArticle } from "./assemble";
import { deserializeSeed, type EventSeed, type SerializedSeed } from "./cluster";
import type { NewsStore, StoredArticleRef } from "./pipeline";

/** NewsStore en memoria: tests offline y `npm run sync -- news --dry-run`. */
export interface MemoryArticle {
  id: number;
  eventId: string;
  article: ProcessedArticle;
  syndicationCount: number;
  alsoSeenOn: string[];
}

export class MemoryNewsStore implements NewsStore {
  articles: MemoryArticle[] = [];
  events = new Map<string, { event: AssembledEvent; seed: SerializedSeed }>();
  links = new Map<string, EntityLink[]>();
  impacts = new Map<string, ImpactHypothesis[]>();
  private nextId = 1;

  async existingUrlHashes(hashes: readonly string[]): Promise<Set<string>> {
    const set = new Set(hashes);
    return new Set(this.articles.filter((a) => set.has(a.article.urlHash)).map((a) => a.article.urlHash));
  }

  async findByTitleHash(hashes: readonly string[], since: Date): Promise<Map<string, StoredArticleRef>> {
    const out = new Map<string, StoredArticleRef>();
    for (const a of this.articles) {
      if (hashes.includes(a.article.titleHash) && Date.parse(a.article.publishedAt) >= since.getTime() && !out.has(a.article.titleHash)) out.set(a.article.titleHash, { id: a.id, eventId: a.eventId });
    }
    return out;
  }

  async addSyndication(articleId: number, publisherKey: string, count: number): Promise<void> {
    const a = this.articles.find((x) => x.id === articleId);
    if (!a) return;
    a.syndicationCount += count;
    if (!a.alsoSeenOn.includes(publisherKey) && a.alsoSeenOn.length < 10) a.alsoSeenOn.push(publisherKey);
  }

  async loadActiveSeeds(since: Date): Promise<EventSeed[]> {
    return [...this.events.entries()]
      .filter(([, e]) => Date.parse(e.event.lastSeenAt) >= since.getTime())
      .map(([id, e]) => deserializeSeed({ id, type: e.event.type, secondaryTypes: e.event.secondaryTypes, firstSeenAt: e.event.firstSeenAt, lastSeenAt: e.event.lastSeenAt, articleCount: e.event.articleCount }, e.seed));
  }

  async insertArticles(rows: readonly { article: ProcessedArticle; eventId: string; syndication: string[] }[]): Promise<number[]> {
    return rows.map((r) => {
      const id = this.nextId++;
      this.articles.push({ id, eventId: r.eventId, article: r.article, syndicationCount: 1 + r.syndication.length, alsoSeenOn: [...new Set(r.syndication)].slice(0, 10) });
      return id;
    });
  }

  async loadEventArticles(eventIds: readonly string[]): Promise<Map<string, EventArticle[]>> {
    const out = new Map<string, EventArticle[]>();
    for (const a of this.articles) {
      if (!eventIds.includes(a.eventId)) continue;
      const list = out.get(a.eventId) ?? [];
      list.push(toEventArticle(a));
      out.set(a.eventId, list);
    }
    return out;
  }

  async saveEvent(id: string, event: AssembledEvent, seed: SerializedSeed): Promise<void> {
    this.events.set(id, { event, seed });
  }

  async replaceEventLinks(eventId: string, links: readonly EntityLink[]): Promise<void> {
    this.links.set(eventId, [...links]);
  }

  async replaceEventImpacts(eventId: string, impacts: readonly ImpactHypothesis[]): Promise<void> {
    this.impacts.set(eventId, [...impacts]);
  }
}

export function toEventArticle(a: MemoryArticle): EventArticle {
  const x = a.article;
  return {
    id: a.id,
    url: x.canonicalUrl,
    title: x.title,
    publisher: x.publisher,
    publisherKey: x.publisherKey,
    tier: x.tier,
    publishedAt: x.publishedAt,
    language: x.language,
    sourceId: x.sourceId,
    syndicationCount: a.syndicationCount,
    snippet: x.snippet ?? null,
    primary: !!x.hints?.primary,
    signals: x.signals,
  };
}
