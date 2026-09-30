import type { EventQuery, IngestRun, NewsRepository, SourceStatus, StoredAiOutput } from "@/data/repositories/news-repository";
import type { EventSource, NewsEvent } from "@/domain/news";
import type { NodeKey } from "@/knowledge/types";

/** NewsRepository en memoria (tests y ausencia de base de datos). */
export class MemoryNewsRepository implements NewsRepository {
  constructor(
    private readonly events: NewsEvent[] = [],
    private readonly sources: Map<string, EventSource[]> = new Map(),
    private readonly status: SourceStatus[] = [],
    private readonly runs: IngestRun[] = [],
    private readonly ai: StoredAiOutput[] = [],
  ) {}

  private filter(list: NewsEvent[], q: EventQuery): NewsEvent[] {
    return list
      .filter((e) => (!q.since || e.lastSeenAt >= q.since) && (!q.types?.length || q.types.includes(e.type)) && (q.minImportance === undefined || e.importance >= q.minImportance))
      .sort((a, b) => (q.order === "recent" ? b.lastSeenAt.localeCompare(a.lastSeenAt) : b.importance - a.importance))
      .slice(0, q.limit ?? 50);
  }

  async listEvents(query: EventQuery): Promise<NewsEvent[]> {
    return this.filter(this.events, query);
  }

  async eventsForNodes(nodes: readonly NodeKey[], query: EventQuery): Promise<NewsEvent[]> {
    const set = new Set(nodes);
    return this.filter(
      this.events.filter((e) => e.links.some((l) => set.has(l.node)) || e.impacts.some((i) => set.has(i.target))),
      query,
    );
  }

  async getEvent(id: string): Promise<{ event: NewsEvent; sources: EventSource[] } | null> {
    const event = this.events.find((e) => e.id === id);
    return event ? { event, sources: this.sources.get(id) ?? [] } : null;
  }

  async listSourceStatus(): Promise<SourceStatus[]> {
    return this.status;
  }

  async latestRuns(limit: number): Promise<IngestRun[]> {
    return this.runs.slice(0, limit);
  }

  async getAiOutput(subject: string, task: string): Promise<StoredAiOutput | null> {
    return this.ai.find((a) => a.subject === subject && a.task === task) ?? null;
  }
}
