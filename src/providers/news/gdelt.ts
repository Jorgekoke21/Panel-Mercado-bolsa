import type { RawArticle } from "@/domain/news";
import { languageCode } from "@/news/text";
import { ProviderError } from "../errors";
import { NewsHttpClient } from "./http";
import type { NewsFetchContext, NewsFetchResult, NewsSource } from "./ports";

/**
 * GDELT DOC 2.0 API — descubrimiento global de noticias (gratuito, sin clave).
 *
 *   https://api.gdeltproject.org/api/v2/doc/doc?query=…&mode=artlist&format=json
 *   Límite oficial: 1 petición cada 5 s. En la práctica GDELT devuelve 429 con ráfagas: se usan 10 s. Devuelve metadatos: URL, título, fecha en que GDELT
 *   vio el artículo, dominio, idioma y país del editor. No devuelve el texto (ni lo necesitamos).
 *
 * Licencia GDELT: uso libre e ilimitado (incluido comercial) con cita del proyecto. Los titulares y
 * enlaces pertenecen a cada editor: MarketRadar solo guarda metadatos y enlaza al original.
 *
 * Estrategia de consultas (acotada, ~25 peticiones por ejecución):
 *   * Consultas temáticas fijas (mercados, bancos centrales, comercio, energía, metales, IA/chips,
 *     geopolítica con ángulo económico, resultados, M&A, regulación, ciberseguridad, cadena de
 *     suministro, desastres, tipos/divisas) en inglés + 3 consultas en español, alemán y francés.
 *   * Rotación de empresas del universo por capitalización (las 20 mayores siempre; el resto rota).
 */
export interface GdeltQuery {
  id: string;
  query: string;
}

export const GDELT_TOPIC_QUERIES: readonly GdeltQuery[] = [
  { id: "markets", query: '("stock market" OR "Wall Street" OR "S&P 500" OR "Dow Jones" OR "Nasdaq Composite") sourcelang:english' },
  { id: "central_banks", query: '("Federal Reserve" OR "central bank" OR "rate cut" OR "rate hike" OR "interest rates" OR "Bank of Japan" OR "European Central Bank") sourcelang:english' },
  { id: "macro_data", query: '(inflation OR "consumer prices" OR payrolls OR unemployment OR "gross domestic product" OR recession OR "retail sales") economy sourcelang:english' },
  { id: "trade", query: '(tariff OR tariffs OR "trade war" OR "trade deal" OR "export controls" OR "export restrictions" OR sanctions) sourcelang:english' },
  { id: "energy", query: '("oil prices" OR "crude oil" OR OPEC OR Brent OR "natural gas" OR LNG OR refinery) sourcelang:english' },
  { id: "metals", query: '(gold OR copper OR lithium OR uranium OR "iron ore" OR nickel OR silver) (prices OR mining OR miners) sourcelang:english' },
  { id: "semis_ai", query: '(semiconductor OR chipmaker OR chipmakers OR "AI chips" OR "data center" OR "data centers" OR hyperscaler) sourcelang:english' },
  { id: "geopolitics", query: '(war OR missile OR invasion OR ceasefire OR airstrike OR blockade) (oil OR markets OR stocks OR shipping OR economy) sourcelang:english' },
  { id: "earnings", query: '(earnings OR "quarterly results" OR guidance OR "profit warning" OR "revenue forecast") (shares OR stock) sourcelang:english' },
  { id: "deals", query: '(acquisition OR merger OR takeover OR "to acquire" OR buyout) (billion OR deal) sourcelang:english' },
  { id: "regulation", query: '(antitrust OR "Federal Trade Commission" OR "Justice Department" OR "FDA approval" OR regulator) (company OR shares) sourcelang:english' },
  { id: "people_jobs", query: '(layoffs OR "job cuts" OR "chief executive" OR "steps down" OR restructuring) (company OR shares) sourcelang:english' },
  { id: "cyber", query: '(cyberattack OR ransomware OR "data breach" OR outage) (company OR shares OR customers) sourcelang:english' },
  { id: "supply_chain", query: '("supply chain" OR freight OR "Red Sea" OR "Panama Canal" OR "Strait of Hormuz" OR shortage) (prices OR companies OR trade) sourcelang:english' },
  { id: "disasters", query: '(hurricane OR earthquake OR wildfire OR flooding OR drought) (damage OR insurers OR production OR refinery OR crops) sourcelang:english' },
  { id: "rates_fx", query: '("Treasury yields" OR "bond yields" OR "dollar index" OR "yen" OR "yuan" OR "currency") (markets OR investors) sourcelang:english' },
  { id: "es", query: '(bolsa OR "Reserva Federal" OR aranceles OR petróleo OR inflación OR "Wall Street") sourcelang:spanish' },
  { id: "de", query: '(Börse OR Zölle OR Ölpreis OR Inflation OR Notenbank OR "Wall Street") sourcelang:german' },
  { id: "fr", query: '(Bourse OR "droits de douane" OR pétrole OR inflation OR "Wall Street") sourcelang:french' },
];

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export function gdeltTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** Construye consultas de empresas: `("Nvidia" OR "Apple" OR …) sourcelang:english`, ≤ 10 nombres. */
export function companyQueries(names: readonly string[], size = 10): GdeltQuery[] {
  const out: GdeltQuery[] = [];
  for (let i = 0; i < names.length; i += size) {
    const chunk = names.slice(i, i + size).filter((n) => n.length >= 4);
    if (chunk.length) out.push({ id: `companies_${i}`, query: `(${chunk.map((n) => `"${n.replace(/"/g, "")}"`).join(" OR ")}) sourcelang:english` });
  }
  return out;
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

/**
 * GDELT entrega los titulares pre-tokenizados ("U . S . stocks", "$4 , 150", "( CCL )", "52 - Week").
 * Se recompone la puntuación para que la resolución de entidades y los tickers funcionen.
 */
export function normalizeGdeltTitle(title: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) t = t.replace(/\b([A-Z]) \. ([A-Z])\b/g, "$1.$2");
  return t
    .replace(/\b([A-Z]\.[A-Z](?:\.[A-Z])*) \./g, "$1.")
    .replace(/(\d) ([,.]) (\d)/g, "$1$2$3")
    .replace(/(\d) % /g, "$1% ")
    .replace(/(\d) %$/g, "$1%")
    .replace(/\$ (\d)/g, "$$$1")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .replace(/(\w) ' (s|re|ve|ll|t|d)\b/gi, "$1'$2")
    .replace(/(\w) ' /g, "$1' ")
    .replace(/(\w) - (\w)/g, (m, a: string, b: string) => (/\d/.test(a) || /^[a-z]/.test(b) ? `${a}-${b}` : m))
    .replace(/ ([,;:!?%])/g, "$1")
    .replace(/ \.$/, ".")
    .replace(/ \. /g, ". ");
}

function parseSeenDate(value: string | undefined): string | null {
  const m = value ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/** Respuesta JSON de GDELT ⇒ artículos (sin red: testeable con fixtures). */
export function parseGdeltResponse(body: string, queryId: string): RawArticle[] {
  const text = body.trim();
  if (!text) return [];
  let json: { articles?: GdeltArticle[] };
  try {
    json = JSON.parse(text) as { articles?: GdeltArticle[] };
  } catch {
    // GDELT a veces incluye barras invertidas no escapadas en los títulos.
    try {
      json = JSON.parse(text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\")) as { articles?: GdeltArticle[] };
    } catch {
      throw new ProviderError("invalid_response", "gdelt", queryId, text.slice(0, 120));
    }
  }
  return (json.articles ?? []).flatMap((a) => {
    const publishedAt = parseSeenDate(a.seendate);
    if (!a.url || !a.title || !publishedAt) return [];
    return [
      {
        sourceId: "gdelt",
        url: a.url,
        title: normalizeGdeltTitle(a.title),
        publishedAt,
        timeBasis: "seen" as const,
        language: languageCode(a.language),
        publisher: a.domain ?? "",
        author: null,
        snippet: null,
        publisherCountry: a.sourcecountry ?? null,
      },
    ];
  });
}

export interface GdeltOptions {
  userAgent: string;
  /** Nombres de empresas por orden de capitalización (para la rotación). */
  companyNames?: readonly string[];
  alwaysTop?: number;
  rotatingQueries?: number;
  maxRecords?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Solo estas consultas temáticas (por id). */
  onlyTopics?: readonly string[];
  /** Tiempo máximo de una ejecución (ms). Lo que no dé tiempo se consulta en la siguiente. */
  maxRunMs?: number;
}

export class GdeltSource implements NewsSource {
  readonly id = "gdelt";
  readonly label = "GDELT DOC 2.0 (global news discovery)";
  readonly kind = "aggregator" as const;
  readonly relevanceScope = "media" as const;
  readonly pollMinutes = 60;
  readonly license = {
    terms: "GDELT: free and unrestricted use with citation of the GDELT Project. Article headlines/URLs belong to each publisher: metadata + link only.",
    termsUrl: "https://www.gdeltproject.org/about.html#termsofuse",
    snippetAllowed: false,
    attribution: "Discovered via the GDELT Project",
  };
  private readonly http: NewsHttpClient;

  constructor(private readonly options: GdeltOptions) {
    this.http = new NewsHttpClient({ provider: "gdelt", userAgent: options.userAgent, minIntervalMs: 10_000, maxRetries: 1, timeoutMs: 25_000, fetchImpl: options.fetchImpl, sleep: options.sleep });
  }

  plan(cursor: Record<string, unknown>): { queries: GdeltQuery[]; nextOffset: number } {
    const topics = this.options.onlyTopics ? GDELT_TOPIC_QUERIES.filter((q) => this.options.onlyTopics?.includes(q.id)) : GDELT_TOPIC_QUERIES;
    const names = this.options.companyNames ?? [];
    const top = this.options.alwaysTop ?? 20;
    const rotating = this.options.rotatingQueries ?? 4;
    const fixed = companyQueries(names.slice(0, top)).map((q) => ({ ...q, id: `top_${q.id}` }));
    const rest = names.slice(top);
    const offset = typeof cursor.companyOffset === "number" && cursor.companyOffset < rest.length ? cursor.companyOffset : 0;
    const slice = rest.slice(offset, offset + rotating * 10);
    const nextOffset = offset + rotating * 10 >= rest.length ? 0 : offset + rotating * 10;
    return { queries: [...topics, ...fixed, ...companyQueries(slice).map((q) => ({ ...q, id: `rot_${offset}_${q.id}` }))], nextOffset };
  }

  async fetch(ctx: NewsFetchContext): Promise<NewsFetchResult> {
    const { queries, nextOffset } = this.plan(ctx.cursor);
    const articles: RawArticle[] = [];
    const warnings: string[] = [];
    const before = this.http.requestCount;
    // GDELT solo cubre los últimos 3 meses; la ventana se acota a 3 días como máximo.
    const since = new Date(Math.max(ctx.since.getTime(), ctx.now.getTime() - 3 * 86_400_000));
    const started = Date.now();
    let consecutiveFailures = 0;
    let done = 0;
    for (const q of queries) {
      // Circuit breaker: si GDELT limita o no responde 3 veces seguidas, se para y se reintenta en la próxima ejecución.
      if (consecutiveFailures >= 3) {
        warnings.push(`stopped after ${consecutiveFailures} consecutive failures (${queries.length - done} queries deferred)`);
        break;
      }
      if (Date.now() - started > (this.options.maxRunMs ?? 6 * 60_000)) {
        warnings.push(`time budget reached (${queries.length - done} queries deferred)`);
        break;
      }
      done++;
      const params = new URLSearchParams({
        query: q.query,
        mode: "artlist",
        format: "json",
        maxrecords: String(this.options.maxRecords ?? 75),
        sort: "datedesc",
        startdatetime: gdeltTimestamp(since),
        enddatetime: gdeltTimestamp(ctx.now),
      });
      try {
        const body = await this.http.getText(`${ENDPOINT}?${params.toString()}`, `doc:${q.id}`);
        const found = parseGdeltResponse(body, q.id);
        ctx.log?.(`  gdelt ${q.id}: ${found.length}`);
        articles.push(...found);
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures++;
        ctx.log?.(`  gdelt ${q.id}: ✗ ${error instanceof Error ? error.message : String(error)}`);
        warnings.push(`${q.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { articles, requests: this.http.requestCount - before, cursor: { companyOffset: nextOffset }, warnings };
  }
}
