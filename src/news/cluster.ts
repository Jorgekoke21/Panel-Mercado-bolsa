import type { EventType, ProcessedArticle } from "@/domain/news";
import type { NodeKey } from "@/knowledge/types";
import { isSpecificNode, primaryCompany } from "./process";
import { eventTypeDef } from "./taxonomy";

/**
 * Clustering ARTÍCULO → EVENTO.
 *
 * Dos niveles de deduplicación:
 *   1. Artículo (antes de llegar aquí): URL canónica idéntica ⇒ se descarta; titular normalizado
 *      idéntico en 48 h ⇒ republicación (sindicación), se suma a la fila existente sin crear otra.
 *   2. Evento (aquí): artículos distintos que cuentan el mismo hecho se agrupan.
 *
 * Similitud artículo–evento (0–1):
 *   text   = solapamiento PONDERADO de tokens del titular con el evento (peso ≈ IDF: "stocks",
 *            "market" o "China" pesan poco; "export", "curbs", "Nvidia" pesan mucho)
 *   entity = solapamiento de entidades específicas (empresas, materias primas, industrias…)
 *   type   = 1 mismo tipo · 0.6 tipo secundario · 0.4 misma familia · 0 distinto
 *
 * Reglas de fusión (dentro de una ventana de 72 h desde el último artículo del evento):
 *   a) mismo tipo corporativo + misma empresa sujeto en 48 h                  (earnings de NVDA)
 *   b) text ≥ 0.55                                                            (misma historia, otra redacción)
 *   c) text ≥ 0.3 y entity ≥ 0.5 y type ≥ 0.4                                 (mismo hecho, distinto enfoque)
 *   d) idioma distinto: entity ≥ 0.67 con ≥ 2 entidades específicas comunes y mismo tipo, en 24 h
 * Se elige el evento con mayor puntuación combinada 0.55·text + 0.3·entity + 0.15·type.
 */
export interface EventSeed {
  id: string;
  isNew: boolean;
  type: EventType;
  secondaryTypes: EventType[];
  tokenCounts: Map<string, number>;
  entities: Set<NodeKey>;
  primaryCompany: NodeKey | null;
  firstSeenAt: number;
  lastSeenAt: number;
  languages: Set<string>;
  articleCount: number;
}

export interface SerializedSeed {
  tokens: Record<string, number>;
  entities: string[];
  primaryCompany: string | null;
  languages: string[];
}

export function serializeSeed(seed: EventSeed): SerializedSeed {
  // Se guardan los 40 tokens más frecuentes: suficiente para comparar y acotado en tamaño.
  const top = [...seed.tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  return { tokens: Object.fromEntries(top), entities: [...seed.entities].slice(0, 30), primaryCompany: seed.primaryCompany, languages: [...seed.languages] };
}

export function deserializeSeed(
  row: { id: string; type: EventType; secondaryTypes: EventType[]; firstSeenAt: string; lastSeenAt: string; articleCount: number },
  s: SerializedSeed,
): EventSeed {
  return {
    id: row.id,
    isNew: false,
    type: row.type,
    secondaryTypes: row.secondaryTypes,
    tokenCounts: new Map(Object.entries(s.tokens)),
    entities: new Set(s.entities as NodeKey[]),
    primaryCompany: (s.primaryCompany as NodeKey | null) ?? null,
    firstSeenAt: Date.parse(row.firstSeenAt),
    lastSeenAt: Date.parse(row.lastSeenAt),
    languages: new Set(s.languages),
    articleCount: row.articleCount,
  };
}

const WINDOW_MS = 72 * 3_600_000;
const CORPORATE_WINDOW_MS = 48 * 3_600_000;
const CROSS_LANGUAGE_WINDOW_MS = 24 * 3_600_000;

export interface Similarity {
  score: number;
  text: number;
  entity: number;
  type: number;
  shared: number;
  rule: "corporate_subject" | "text" | "text_entity" | "cross_language" | null;
}

function specificEntities(article: ProcessedArticle): NodeKey[] {
  return article.signals.links.filter((l) => l.relation === "DIRECT" && isSpecificNode(l.node) && !l.node.startsWith("index:")).map((l) => l.node);
}

export class TokenWeights {
  private readonly df = new Map<string, number>();
  private docs = 0;

  add(tokens: Iterable<string>) {
    this.docs++;
    for (const t of new Set(tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  weight(token: string): number {
    const df = this.df.get(token) ?? 0;
    // IDF suavizado; los números pesan un poco menos (fechas, cifras genéricas).
    const idf = Math.log(1 + (this.docs + 1) / (df + 1));
    return /^\d+$/.test(token) ? idf * 0.6 : idf;
  }
}

function typeCompat(a: EventType, aSecondary: readonly EventType[], seed: EventSeed): number {
  if (a === seed.type) return 1;
  if (aSecondary.includes(seed.type) || seed.secondaryTypes.includes(a)) return 0.6;
  if (eventTypeDef(a).family === eventTypeDef(seed.type).family) return 0.4;
  return 0;
}

export function similarity(article: ProcessedArticle, seed: EventSeed, weights: TokenWeights): Similarity {
  const tokens = article.signals.tokens;
  let inter = 0;
  let total = 0;
  for (const t of tokens) {
    const w = weights.weight(t);
    total += w;
    if (seed.tokenCounts.has(t)) inter += w;
  }
  // Fracción del contenido informativo del titular presente en el evento, penalizada si el evento es mucho más amplio.
  const coverage = total > 0 ? inter / total : 0;
  const seedSize = seed.tokenCounts.size;
  const breadthPenalty = seedSize > 0 ? Math.min(1, (tokens.length + 6) / Math.min(seedSize, 40)) : 1;
  const text = coverage * (0.7 + 0.3 * breadthPenalty);

  const ents = specificEntities(article);
  const shared = ents.filter((e) => seed.entities.has(e)).length;
  const entity = ents.length && seed.entities.size ? shared / Math.min(ents.length, seed.entities.size) : 0;
  const type = typeCompat(article.signals.type, article.signals.secondaryTypes, seed);
  const score = 0.55 * text + 0.3 * entity + 0.15 * type;

  const t = Date.parse(article.publishedAt);
  const subject = primaryCompany(article);
  let rule: Similarity["rule"] = null;
  // Eventos corporativos de empresas distintas nunca se fusionan (8-K con la misma plantilla de título).
  const corporate = eventTypeDef(article.signals.type).corporate || eventTypeDef(seed.type).corporate;
  if (corporate && subject && seed.primaryCompany && subject !== seed.primaryCompany) return { score, text, entity, type, shared, rule: null };
  if (eventTypeDef(article.signals.type).corporate && type === 1 && subject && subject === seed.primaryCompany && Math.abs(t - seed.lastSeenAt) <= CORPORATE_WINDOW_MS) rule = "corporate_subject";
  else if (text >= 0.55) rule = "text";
  else if (text >= 0.3 && entity >= 0.5 && type >= 0.4) rule = "text_entity";
  else if (article.language && !seed.languages.has(article.language) && entity >= 0.67 && shared >= 2 && type === 1 && Math.abs(t - seed.lastSeenAt) <= CROSS_LANGUAGE_WINDOW_MS) rule = "cross_language";
  return { score, text, entity, type, shared, rule };
}

function seedFromArticle(id: string, article: ProcessedArticle): EventSeed {
  const t = Date.parse(article.publishedAt);
  return {
    id,
    isNew: true,
    type: article.signals.type,
    secondaryTypes: [...article.signals.secondaryTypes],
    tokenCounts: new Map(article.signals.tokens.map((tok) => [tok, 1])),
    entities: new Set(specificEntities(article)),
    primaryCompany: primaryCompany(article),
    firstSeenAt: t,
    lastSeenAt: t,
    languages: new Set(article.language ? [article.language] : []),
    articleCount: 1,
  };
}

function absorb(seed: EventSeed, article: ProcessedArticle) {
  for (const tok of article.signals.tokens) seed.tokenCounts.set(tok, (seed.tokenCounts.get(tok) ?? 0) + 1);
  for (const e of specificEntities(article)) seed.entities.add(e);
  if (article.language) seed.languages.add(article.language);
  const t = Date.parse(article.publishedAt);
  seed.firstSeenAt = Math.min(seed.firstSeenAt, t);
  seed.lastSeenAt = Math.max(seed.lastSeenAt, t);
  seed.articleCount++;
  seed.primaryCompany ??= primaryCompany(article);
}

export interface ClusterResult {
  /** Índice del artículo (en la lista de entrada) ⇒ id del evento (existente o "new:n"). */
  assignments: Map<number, string>;
  seeds: Map<string, EventSeed>;
  merges: { article: number; event: string; similarity: Similarity }[];
}

/**
 * Asigna artículos relevantes a eventos existentes o nuevos. Determinista: mismo input ⇒ mismo resultado
 * (orden por fecha y URL).
 */
export function clusterArticles(articles: readonly ProcessedArticle[], existing: readonly EventSeed[]): ClusterResult {
  const seeds = new Map<string, EventSeed>(existing.map((s) => [s.id, s]));
  const weights = new TokenWeights();
  for (const s of existing) weights.add(s.tokenCounts.keys());
  for (const a of articles) weights.add(a.signals.tokens);

  const order = articles.map((a, i) => ({ a, i })).sort((x, y) => Date.parse(x.a.publishedAt) - Date.parse(y.a.publishedAt) || x.a.canonicalUrl.localeCompare(y.a.canonicalUrl));
  const assignments = new Map<number, string>();
  const merges: ClusterResult["merges"] = [];
  let next = 0;
  for (const { a, i } of order) {
    const t = Date.parse(a.publishedAt);
    let best: { seed: EventSeed; sim: Similarity } | null = null;
    for (const seed of seeds.values()) {
      if (t - seed.lastSeenAt > WINDOW_MS || seed.firstSeenAt - t > 12 * 3_600_000) continue;
      const sim = similarity(a, seed, weights);
      if (!sim.rule) continue;
      if (!best || sim.score > best.sim.score) best = { seed, sim };
    }
    if (best) {
      absorb(best.seed, a);
      assignments.set(i, best.seed.id);
      merges.push({ article: i, event: best.seed.id, similarity: best.sim });
    } else {
      const id = `new:${next++}`;
      seeds.set(id, seedFromArticle(id, a));
      assignments.set(i, id);
    }
  }
  return { assignments, seeds, merges };
}
