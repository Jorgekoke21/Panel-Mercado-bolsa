import type { RawArticle, SourceKind, SourceTier } from "@/domain/news";

/**
 * Puerto de las fuentes de noticias (Fase 4). MarketRadar no se acopla a ninguna: cada adaptador
 * (GDELT, feeds oficiales RSS/Atom, EDGAR…) implementa `NewsSource` y declara su licencia.
 *
 * Reglas:
 *   * Solo metadatos + enlace. Nunca se descarga ni se guarda el cuerpo de artículos de terceros.
 *   * `snippetAllowed` solo para fuentes cuyo contenido es de dominio público o de reutilización
 *     autorizada (obras del gobierno federal de EE. UU., BCE con atribución).
 *   * Los fallos se lanzan como ProviderError; un adaptador caído no detiene a los demás.
 */
export interface NewsSourceLicense {
  /** Texto breve de las condiciones de uso aplicables. */
  terms: string;
  termsUrl?: string;
  snippetAllowed: boolean;
  attribution: string;
}

export interface NewsFetchContext {
  now: Date;
  /** Ventana de búsqueda: desde aquí (el job la calcula a partir del último éxito, con solape). */
  since: Date;
  /** Estado propio del adaptador entre ejecuciones (p. ej. rotación de consultas). */
  cursor: Record<string, unknown>;
  log?: (line: string) => void;
}

export interface NewsFetchResult {
  articles: RawArticle[];
  requests: number;
  cursor?: Record<string, unknown>;
  warnings: string[];
}

export interface NewsSource {
  readonly id: string;
  readonly label: string;
  readonly kind: SourceKind;
  /** Tier fijo para fuentes oficiales; los agregadores lo calculan por dominio (undefined). */
  readonly tier?: SourceTier;
  /**
   * macro: todo lo que publica es relevante (banco central, estadística oficial).
   * regulator: relevante solo si relaciona una entidad de mercado (empresa, industria, materia prima).
   * media: filtro normal por tipo de evento + entidades.
   */
  readonly relevanceScope: "macro" | "regulator" | "media";
  readonly license: NewsSourceLicense;
  /** Frecuencia recomendada de consulta (minutos). */
  readonly pollMinutes: number;
  fetch(ctx: NewsFetchContext): Promise<NewsFetchResult>;
}
