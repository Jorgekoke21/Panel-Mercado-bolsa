import type { RawArticle } from "@/domain/news";
import { parseFeed } from "./feed-parser";
import { NewsHttpClient } from "./http";
import type { NewsFetchContext, NewsFetchResult, NewsSource, NewsSourceLicense } from "./ports";

/**
 * Feeds RSS PÚBLICOS de editores (CNBC, MarketWatch, WSJ, FT, BBC, NYT, Yahoo Finance…).
 *
 * El RSS es el canal que los propios editores ofrecen para sindicar titulares: MarketRadar guarda solo
 * titular + enlace + fecha (nunca la descripción ni el cuerpo) y enlaza siempre al original. Uso personal,
 * no comercial. ⚠ Si MarketRadar se convierte en producto, revisar las condiciones de cada feed.
 * La calidad (tier) se asigna por dominio (src/news/publishers.ts), no por el adaptador.
 */
const MEDIA_LICENSE: NewsSourceLicense = {
  terms: "Publisher RSS feed: headline + link + time only, personal non-commercial use, always linking to the original. Review each publisher's RSS terms before any commercial use.",
  snippetAllowed: false,
  attribution: "",
};

export interface PublisherFeedDef {
  id: string;
  label: string;
  publisher: string;
  url: string;
  language: string;
  pollMinutes: number;
}

export const PUBLISHER_FEEDS: readonly PublisherFeedDef[] = [
  { id: "cnbc-top", label: "CNBC — top news", publisher: "cnbc.com", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", language: "en", pollMinutes: 60 },
  { id: "cnbc-finance", label: "CNBC — finance", publisher: "cnbc.com", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", language: "en", pollMinutes: 60 },
  { id: "cnbc-tech", label: "CNBC — technology", publisher: "cnbc.com", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", language: "en", pollMinutes: 60 },
  { id: "marketwatch-top", label: "MarketWatch — top stories", publisher: "marketwatch.com", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", language: "en", pollMinutes: 60 },
  { id: "ft-markets", label: "Financial Times — markets", publisher: "ft.com", url: "https://www.ft.com/markets?format=rss", language: "en", pollMinutes: 60 },
  { id: "bbc-business", label: "BBC — business", publisher: "bbc.co.uk", url: "https://feeds.bbci.co.uk/news/business/rss.xml", language: "en", pollMinutes: 60 },
  { id: "nyt-business", label: "New York Times — business", publisher: "nytimes.com", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", language: "en", pollMinutes: 60 },
  { id: "investing-stocks", label: "Investing.com — stock market news", publisher: "investing.com", url: "https://www.investing.com/rss/news_25.rss", language: "en", pollMinutes: 60 },
  { id: "oilprice", label: "OilPrice.com", publisher: "oilprice.com", url: "https://oilprice.com/rss/main", language: "en", pollMinutes: 120 },
  { id: "mining-com", label: "Mining.com", publisher: "mining.com", url: "https://www.mining.com/feed/", language: "en", pollMinutes: 120 },
  { id: "dcd", label: "DatacenterDynamics", publisher: "datacenterdynamics.com", url: "https://www.datacenterdynamics.com/en/rss/", language: "en", pollMinutes: 120 },
  { id: "aljazeera", label: "Al Jazeera — all news", publisher: "aljazeera.com", url: "https://www.aljazeera.com/xml/rss/all.xml", language: "en", pollMinutes: 120 },
  { id: "expansion-mercados", label: "Expansión — mercados", publisher: "expansion.com", url: "https://www.expansion.com/rss/mercados.xml", language: "es", pollMinutes: 120 },
  { id: "elpais-economia", label: "El País — economía", publisher: "elpais.com", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada", language: "es", pollMinutes: 120 },
];

function toArticles(sourceId: string, language: string, fallbackPublisher: string, xml: string, since: Date, baseUrl: string): RawArticle[] {
  return parseFeed(xml, baseUrl)
    .filter((i) => i.published && Date.parse(i.published) >= since.getTime())
    .map((i) => {
      let host = fallbackPublisher;
      try {
        host = new URL(i.link).hostname.replace(/^www\./, "");
      } catch {
        // se usa el editor del feed
      }
      return { sourceId, url: i.link, title: i.title, publishedAt: i.published as string, timeBasis: "published" as const, language, publisher: host, author: i.author, snippet: null };
    });
}

export class PublisherFeedSource implements NewsSource {
  readonly kind = "media" as const;
  readonly relevanceScope = "media" as const;
  readonly license = MEDIA_LICENSE;
  readonly id: string;
  readonly label: string;
  readonly pollMinutes: number;

  constructor(
    readonly def: PublisherFeedDef,
    private readonly http: NewsHttpClient,
  ) {
    this.id = def.id;
    this.label = def.label;
    this.pollMinutes = def.pollMinutes;
  }

  async fetch(ctx: NewsFetchContext): Promise<NewsFetchResult> {
    const before = this.http.requestCount;
    const xml = await this.http.getText(this.def.url, this.def.id);
    return { articles: toArticles(this.def.id, this.def.language, this.def.publisher, xml, ctx.since, this.def.url), requests: this.http.requestCount - before, warnings: [] };
  }
}

/**
 * Yahoo Finance — titulares por ticker (feed RSS público). Rota el universo por capitalización:
 * los 30 mayores en cada ejecución y el resto en tandas (10 tickers por petición).
 */
export class YahooTickerFeedSource implements NewsSource {
  readonly id = "yahoo-tickers";
  readonly label = "Yahoo Finance — headlines by ticker";
  readonly kind = "aggregator" as const;
  readonly relevanceScope = "media" as const;
  readonly license = MEDIA_LICENSE;
  readonly pollMinutes = 60;

  constructor(
    private readonly tickers: readonly string[],
    private readonly http: NewsHttpClient,
    private readonly perRun = 60,
  ) {}

  async fetch(ctx: NewsFetchContext): Promise<NewsFetchResult> {
    const before = this.http.requestCount;
    const top = this.tickers.slice(0, 30);
    const rest = this.tickers.slice(30);
    const offset = typeof ctx.cursor.offset === "number" && ctx.cursor.offset < rest.length ? ctx.cursor.offset : 0;
    const batch = [...top, ...rest.slice(offset, offset + this.perRun - top.length)];
    const next = offset + this.perRun - top.length >= rest.length ? 0 : offset + this.perRun - top.length;
    const articles: RawArticle[] = [];
    const warnings: string[] = [];
    for (let i = 0; i < batch.length; i += 10) {
      const symbols = batch.slice(i, i + 10).map((t) => t.replace(".", "-")).join(",");
      const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbols)}&region=US&lang=en-US`;
      try {
        const xml = await this.http.getText(url, "yahoo headline");
        articles.push(...toArticles(this.id, "en", "finance.yahoo.com", xml, ctx.since, url));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
    return { articles, requests: this.http.requestCount - before, cursor: { offset: next }, warnings };
  }
}
