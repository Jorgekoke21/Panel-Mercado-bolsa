import type { EventSource, EventType, NewsEvent } from "@/domain/news";
import type { NodeKey } from "@/knowledge/types";

/**
 * Lectura de noticias/eventos desde NUESTRA base de datos (la UI nunca habla con las fuentes).
 */
export interface EventQuery {
  /** ISO: solo eventos con actividad desde esta fecha. */
  since?: string;
  types?: readonly EventType[];
  limit?: number;
  minImportance?: number;
  order?: "importance" | "recent";
}

export interface SourceStatus {
  sourceId: string;
  label: string;
  kind: string;
  tier: number | null;
  licenseTerms: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastFetched: number;
  lastInserted: number;
  lastRequests: number;
}

export interface IngestRun {
  id: string;
  jobType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  recordsRead: number;
  recordsWritten: number;
  requestsMade: number | null;
  metrics: Record<string, unknown>;
}

export interface StoredAiOutput {
  task: string;
  subject: string;
  provider: string;
  model: string;
  promptVersion: string;
  output: unknown;
  createdAt: string;
}

export interface NewsRepository {
  listEvents(query: EventQuery): Promise<NewsEvent[]>;
  /** Eventos relacionados con cualquiera de los nodos (entidad DIRECT/INFERRED o destino de un impacto). */
  eventsForNodes(nodes: readonly NodeKey[], query: EventQuery): Promise<NewsEvent[]>;
  getEvent(id: string): Promise<{ event: NewsEvent; sources: EventSource[] } | null>;
  listSourceStatus(): Promise<SourceStatus[]>;
  latestRuns(limit: number): Promise<IngestRun[]>;
  getAiOutput(subject: string, task: string): Promise<StoredAiOutput | null>;
}
