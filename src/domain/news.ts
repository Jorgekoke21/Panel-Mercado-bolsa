import type { Horizon, ImpactChannel, Move, NodeKey } from "@/knowledge/types";

/**
 * Dominio del News Engine (Fase 4).
 *
 * ARTÍCULO ≠ EVENTO. Un artículo es una publicación de terceros (solo metadatos + enlace); un evento
 * es un objeto de MarketRadar que agrupa artículos que cuentan lo mismo y lo relaciona con el
 * mercado (entidades, impactos potenciales, confianza).
 */

export const EVENT_TYPES = [
  // macro
  "CENTRAL_BANK",
  "INFLATION",
  "EMPLOYMENT",
  "ECONOMIC_GROWTH",
  "RATES_BONDS",
  "CURRENCY",
  "CREDIT",
  "FISCAL_POLICY",
  // policy
  "TRADE_TARIFFS",
  "SANCTIONS_EXPORT_CONTROLS",
  "REGULATION",
  "ANTITRUST",
  "ELECTION_POLITICS",
  // geopolitics
  "GEOPOLITICAL_CONFLICT",
  // commodities
  "ENERGY_MARKETS",
  "METALS_MINING",
  "AGRICULTURE",
  // corporate
  "EARNINGS",
  "GUIDANCE",
  "MERGER_ACQUISITION",
  "CAPITAL_MARKETS",
  "CAPEX_INVESTMENT",
  "PRODUCT_TECHNOLOGY",
  "CONTRACT_PARTNERSHIP",
  "MANAGEMENT_CHANGE",
  "WORKFORCE",
  "LEGAL",
  "ANALYST_RATING",
  // technology & sectors
  "AI_DATA_CENTERS",
  "SEMICONDUCTORS",
  "CYBERSECURITY",
  "HEALTHCARE_REGULATORY",
  // risk
  "SUPPLY_CHAIN_LOGISTICS",
  "NATURAL_DISASTER_CLIMATE",
  // markets
  "MARKET_MOVE",
  "OTHER",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type EventFamily = "macro" | "policy" | "geopolitics" | "commodities" | "corporate" | "technology" | "risk" | "markets";

/**
 * Calidad de la fuente:
 *   1 fuente primaria oficial (banco central, estadística oficial, regulador, SEC/EDGAR)
 *   2 agencia o medio financiero de referencia (Reuters, AP, Bloomberg, WSJ, FT, CNBC…)
 *   3 medio establecido general o sectorial
 *   4 desconocido / agregador / blog
 */
export type SourceTier = 1 | 2 | 3 | 4;

export type SourceKind = "official" | "regulator" | "company_filing" | "media" | "aggregator";

/** Artículo tal como lo entrega un NewsSource adapter (antes de procesar). */
export interface RawArticle {
  /** Adaptador/feed que lo descubrió (p. ej. "gdelt", "fed-press", "sec-8k"). */
  sourceId: string;
  url: string;
  title: string;
  /** ISO 8601. */
  publishedAt: string;
  /** "published" = fecha de publicación declarada; "seen" = primera vez vista por el agregador (GDELT). */
  timeBasis: "published" | "seen";
  /** ISO 639-1 si se conoce. */
  language: string | null;
  /** Dominio del editor (p. ej. reuters.com) o nombre de la institución oficial. */
  publisher: string;
  author?: string | null;
  /** Solo si la licencia de la fuente lo permite (dominio público, reutilización autorizada). */
  snippet?: string | null;
  /** País del editor según el agregador (no es el país del que trata la noticia). */
  publisherCountry?: string | null;
  /** Metadatos estructurados de la fuente (p. ej. ítems de un 8-K). */
  hints?: SourceHints;
}

export interface SourceHints {
  eventTypes?: EventType[];
  /** CIK del emisor (EDGAR): identificación exacta de la empresa. */
  cik?: string;
  form?: string;
  items?: string[];
  accession?: string;
  /** Nodos que la fuente implica siempre (p. ej. feed de la Fed ⇒ country:US, factor:interest_rates). */
  nodes?: NodeKey[];
  /** La fuente es la propia entidad que anuncia (comunicado oficial): hecho, no rumor. */
  primary?: boolean;
}

export type LinkRelation = "DIRECT" | "INFERRED";

export type LinkMethod =
  | "source_metadata"
  | "cik"
  | "cashtag"
  | "exchange_ticker"
  | "ticker"
  | "alias"
  | "alias_context"
  | "keyword"
  | "classification"
  | "graph"
  | "macro_scope"
  | "ai";

/** Relación entre un artículo/evento y un nodo del grafo, con su explicación. */
export interface EntityLink {
  node: NodeKey;
  relation: LinkRelation;
  method: LinkMethod;
  confidence: number;
  /** Texto encontrado (DIRECT) o motivo de la inferencia (INFERRED). */
  evidence: string;
  /** Nodo del que se infiere (INFERRED). */
  via?: NodeKey;
  /** Empresa sujeto del titular (aparece al principio): el tono del titular se le aplica. */
  subject?: boolean;
}

/** Señales deterministas extraídas de un artículo. */
export interface ArticleSignals {
  type: EventType;
  secondaryTypes: EventType[];
  /** Certeza de la clasificación (0–1): margen entre la primera y la segunda categoría. */
  typeCertainty: number;
  links: EntityLink[];
  /** Tono del titular respecto a su sujeto: +1 positivo, −1 negativo, 0 neutro/mixto. */
  polarity: -1 | 0 | 1;
  /** Movimientos detectados de materias primas y factores ("oil prices surge" ⇒ commodity:crude_oil up). */
  moves: { node: NodeKey; move: Move; evidence: string }[];
  flags: {
    /** "reportedly", "sources say", "according to people familiar…" */
    unconfirmed: boolean;
    /** "denies", "refutes", "false report"… */
    denial: boolean;
    /** Opinión/columna/análisis (no es un hecho nuevo). */
    opinion: boolean;
  };
  /** Tokens normalizados del titular (clustering). */
  tokens: string[];
  /** Pasa el filtro de relevancia de mercado. */
  relevant: boolean;
  relevanceReason: string;
}

export interface ProcessedArticle extends RawArticle {
  canonicalUrl: string;
  urlHash: string;
  titleHash: string;
  /** Dominio registrable del editor (iheart.com para wmrn.iheart.com): familia de publicación. */
  publisherKey: string;
  tier: SourceTier;
  signals: ArticleSignals;
  /** Publicado hace más de STALE_ARTICLE_DAYS al ingerirse. */
  stale: boolean;
}

export type EventStatus = "developing" | "active" | "stale";

export interface ConfidenceBreakdown {
  sourceQuality: number;
  corroboration: number;
  entityMatch: number;
  recency: number;
  classification: number;
  agreement: number;
  /** Certeza del hecho: fuente primaria/oficial vs. "según fuentes" o desmentidos. */
  eventCertainty: number;
  /** Resultado ponderado 0–1. */
  score: number;
  /** Explicación legible de cada componente. */
  notes: string[];
}

export type ImpactDirection = "potential_positive" | "potential_negative" | "mixed_uncertain";

export interface ImpactHypothesis {
  target: NodeKey;
  channel: ImpactChannel;
  direction: ImpactDirection;
  /** 1 débil · 2 moderada · 3 fuerte. */
  strength: 1 | 2 | 3;
  horizon: Horizon;
  confidence: number;
  mechanism: string;
  /** Explicación completa (camino del grafo). */
  rationale: string;
  /** Camino del grafo: [origen, …, destino]. */
  path: NodeKey[];
  /** Ids de las relaciones utilizadas. */
  relationIds: string[];
  origin: "rule" | "ai";
}

/** Artículo resumido dentro de un evento (lo que la UI necesita). */
export interface EventSource {
  articleId: number;
  url: string;
  title: string;
  publisher: string;
  publisherKey: string;
  tier: SourceTier;
  publishedAt: string;
  language: string | null;
  sourceId: string;
  syndicationCount: number;
  polarity: -1 | 0 | 1;
  unconfirmed: boolean;
  snippet: string | null;
}

export interface NewsEvent {
  id: string;
  fingerprint: string;
  type: EventType;
  secondaryTypes: EventType[];
  title: string;
  /** Representative source metadata; `title` itself remains the original headline. */
  originalLanguage?: string | null;
  originalUrl?: string | null;
  source?: string | null;
  /** Resumen propio de MarketRadar (determinista o IA, según `summaryOrigin`). */
  summary: string;
  summaryOrigin: "deterministic" | "ai";
  status: EventStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  articleCount: number;
  /** Informes independientes (editores distintos con redacción propia). */
  independentSources: number;
  hasOfficialSource: boolean;
  confidence: ConfidenceBreakdown;
  importance: number;
  contradictory: boolean;
  unconfirmed: boolean;
  languages: string[];
  links: EntityLink[];
  impacts: ImpactHypothesis[];
  moves: ArticleSignals["moves"];
  polarity: -1 | 0 | 1;
}

/**
 * Naturaleza de una afirmación mostrada al usuario (grounding):
 *   FACT              hecho de fuente primaria oficial (EDGAR, banco central, estadística oficial)
 *   SOURCE_CLAIM      lo que afirma un medio (se atribuye; puede ser incorrecto)
 *   MARKET_DATA       dato calculado por MarketRadar a partir de sus datos (precios, fundamentales)
 *   INFERENCE         relación inferida por reglas/grafo de MarketRadar
 *   AI_INTERPRETATION interpretación generada por un modelo de IA (validada contra la evidencia)
 *   UNKNOWN           no hay evidencia suficiente
 */
export type ClaimKind = "FACT" | "SOURCE_CLAIM" | "MARKET_DATA" | "INFERENCE" | "AI_INTERPRETATION" | "UNKNOWN";
