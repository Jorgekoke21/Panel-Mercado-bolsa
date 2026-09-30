import type { EventType, RawArticle } from "@/domain/news";
import type { NodeKey } from "@/knowledge/types";
import { parseFeed } from "./feed-parser";
import { NewsHttpClient } from "./http";
import type { NewsFetchContext, NewsFetchResult, NewsSource, NewsSourceLicense } from "./ports";

/**
 * Feeds OFICIALES (RSS/Atom estructurados, gratuitos, sin clave). Fuente primaria ⇒ tier 1.
 *
 * Licencias:
 *   * Obras del gobierno federal de EE. UU. (Fed Board, BLS, BEA, EIA, FDA, FTC, SEC, DOJ, CFTC): dominio
 *     público (17 U.S.C. §105) ⇒ se conserva un snippet corto con atribución.
 *   * BCE: "reproduction is permitted provided that the source is acknowledged" ⇒ snippet con atribución.
 *   * Bank of England: condiciones propias ⇒ solo titular + enlace (conservador).
 */
const US_PUBLIC_DOMAIN: NewsSourceLicense = {
  terms: "US federal government work — public domain (17 U.S.C. §105). Attribution kept.",
  termsUrl: "https://www.usa.gov/government-copyright",
  snippetAllowed: true,
  attribution: "",
};

export interface OfficialFeedDef {
  id: string;
  label: string;
  publisher: string;
  url: string;
  kind: "official" | "regulator";
  relevanceScope: "macro" | "regulator";
  license: NewsSourceLicense;
  eventTypes?: EventType[];
  nodes?: NodeKey[];
  pollMinutes: number;
}

export const OFFICIAL_FEEDS: readonly OfficialFeedDef[] = [
  { id: "fed-monetary", label: "Federal Reserve — monetary policy", publisher: "Federal Reserve Board", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "Board of Governors of the Federal Reserve System" }, eventTypes: ["CENTRAL_BANK"], nodes: ["country:US", "factor:interest_rates"], pollMinutes: 60 },
  { id: "fed-press", label: "Federal Reserve — all press releases", publisher: "Federal Reserve Board", url: "https://www.federalreserve.gov/feeds/press_all.xml", kind: "official", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "Board of Governors of the Federal Reserve System" }, nodes: ["country:US"], pollMinutes: 60 },
  { id: "ecb-press", label: "European Central Bank — press", publisher: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html", kind: "official", relevanceScope: "macro", license: { terms: "ECB: reproduction permitted provided the source is acknowledged.", termsUrl: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html", snippetAllowed: true, attribution: "European Central Bank" }, eventTypes: ["CENTRAL_BANK"], nodes: ["country:EU"], pollMinutes: 60 },
  { id: "boe-news", label: "Bank of England — news", publisher: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news", kind: "official", relevanceScope: "macro", license: { terms: "Bank of England website terms; headline and link only.", termsUrl: "https://www.bankofengland.co.uk/legal", snippetAllowed: false, attribution: "Bank of England" }, eventTypes: ["CENTRAL_BANK"], nodes: ["country:GB"], pollMinutes: 120 },
  { id: "bls-cpi", label: "BLS — Consumer Price Index", publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/feed/cpi.rss", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Bureau of Labor Statistics" }, eventTypes: ["INFLATION"], nodes: ["country:US", "factor:inflation"], pollMinutes: 120 },
  { id: "bls-ppi", label: "BLS — Producer Price Index", publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/feed/ppi.rss", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Bureau of Labor Statistics" }, eventTypes: ["INFLATION"], nodes: ["country:US", "factor:inflation"], pollMinutes: 120 },
  { id: "bls-empsit", label: "BLS — Employment Situation", publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/feed/empsit.rss", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Bureau of Labor Statistics" }, eventTypes: ["EMPLOYMENT"], nodes: ["country:US", "factor:labor_market"], pollMinutes: 120 },
  { id: "bea", label: "BEA — news releases", publisher: "U.S. Bureau of Economic Analysis", url: "https://apps.bea.gov/rss/rss.xml", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Bureau of Economic Analysis" }, nodes: ["country:US"], pollMinutes: 120 },
  { id: "eia-press", label: "EIA — press releases", publisher: "U.S. Energy Information Administration", url: "https://www.eia.gov/rss/press_rss.xml", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Energy Information Administration" }, eventTypes: ["ENERGY_MARKETS"], nodes: ["country:US"], pollMinutes: 180 },
  { id: "eia-tie", label: "EIA — Today in Energy", publisher: "U.S. Energy Information Administration", url: "https://www.eia.gov/rss/todayinenergy.xml", kind: "official", relevanceScope: "macro", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Energy Information Administration" }, eventTypes: ["ENERGY_MARKETS"], nodes: ["country:US"], pollMinutes: 180 },
  { id: "fda-press", label: "FDA — press announcements", publisher: "U.S. Food and Drug Administration", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", kind: "regulator", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Food and Drug Administration" }, eventTypes: ["HEALTHCARE_REGULATORY"], nodes: ["country:US"], pollMinutes: 120 },
  { id: "ftc-press", label: "FTC — press releases", publisher: "U.S. Federal Trade Commission", url: "https://www.ftc.gov/feeds/press-release.xml", kind: "regulator", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Federal Trade Commission" }, nodes: ["country:US"], pollMinutes: 120 },
  { id: "sec-press", label: "SEC — press releases", publisher: "U.S. Securities and Exchange Commission", url: "https://www.sec.gov/news/pressreleases.rss", kind: "regulator", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Securities and Exchange Commission" }, nodes: ["country:US"], pollMinutes: 120 },
  { id: "doj-press", label: "DOJ — press releases", publisher: "U.S. Department of Justice", url: "https://www.justice.gov/news/rss?type=press_release&m=1", kind: "regulator", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Department of Justice" }, nodes: ["country:US"], pollMinutes: 180 },
  { id: "cftc-press", label: "CFTC — press releases", publisher: "U.S. Commodity Futures Trading Commission", url: "https://www.cftc.gov/RSS/RSSGP/rssgp.xml", kind: "regulator", relevanceScope: "regulator", license: { ...US_PUBLIC_DOMAIN, attribution: "U.S. Commodity Futures Trading Commission" }, nodes: ["country:US"], pollMinutes: 240 },
];

/** Convierte las entradas de un feed oficial en artículos (sin red: testeable con fixtures). */
export function feedToArticles(def: OfficialFeedDef, xml: string, since: Date): RawArticle[] {
  return parseFeed(xml, def.url)
    .filter((item) => item.published && Date.parse(item.published) >= since.getTime())
    .map((item) => ({
      sourceId: def.id,
      url: item.link,
      title: item.title,
      publishedAt: item.published as string,
      timeBasis: "published" as const,
      language: "en",
      publisher: def.publisher,
      author: null,
      snippet: def.license.snippetAllowed && item.summary && item.summary !== item.title ? item.summary.slice(0, 280) : null,
      publisherCountry: def.nodes?.find((n) => n.startsWith("country:"))?.slice(8) ?? null,
      hints: { eventTypes: def.eventTypes, nodes: def.nodes, primary: true },
    }));
}

export class OfficialFeedSource implements NewsSource {
  readonly tier = 1 as const;
  readonly id: string;
  readonly label: string;
  readonly kind: "official" | "regulator";
  readonly relevanceScope: "macro" | "regulator";
  readonly license: NewsSourceLicense;
  readonly pollMinutes: number;

  constructor(
    readonly def: OfficialFeedDef,
    private readonly http: NewsHttpClient,
  ) {
    this.id = def.id;
    this.label = def.label;
    this.kind = def.kind;
    this.relevanceScope = def.relevanceScope;
    this.license = def.license;
    this.pollMinutes = def.pollMinutes;
  }

  async fetch(ctx: NewsFetchContext): Promise<NewsFetchResult> {
    const before = this.http.requestCount;
    const xml = await this.http.getText(this.def.url, this.def.id);
    return { articles: feedToArticles(this.def, xml, ctx.since), requests: this.http.requestCount - before, warnings: [] };
  }
}
