import type { EventType, RawArticle } from "@/domain/news";
import { SEC_8K_ITEM_TYPES, SEC_8K_LOW_SIGNAL_ITEMS } from "@/news/taxonomy";
import { cleanText } from "@/news/text";
import { parseFeed } from "./feed-parser";
import { NewsHttpClient } from "./http";
import type { NewsFetchContext, NewsFetchResult, NewsSource } from "./ports";

/**
 * SEC EDGAR — últimos Form 8-K (feed Atom "getcurrent"). Fuente PRIMARIA de eventos corporativos:
 * la propia empresa comunica el hecho a la SEC. Gratuito, sin clave; política de acceso justo de la
 * SEC (User-Agent con contacto, ≤ 10 req/s).
 *
 * Solo se conservan los 8-K de emisores del universo (por CIK) con al menos un ítem de interés de
 * mercado (resultados 2.02, acuerdos 1.01, adquisiciones 2.01, directivos 5.02, ciberincidentes 1.05…).
 */
const ENDPOINT = "https://www.sec.gov/cgi-bin/browse-edgar";

export interface EdgarFilingEntry {
  form: string;
  companyName: string;
  cik: string;
  url: string;
  accession: string | null;
  items: string[];
  itemText: string[];
  updated: string;
}

/** Atom de EDGAR ⇒ filings (sin red: testeable con fixtures). */
export function parseEdgarCurrent(xml: string): EdgarFilingEntry[] {
  return parseFeed(xml).flatMap((item) => {
    const m = /^(\S+)\s+-\s+(.+?)\s+\((\d{4,10})\)\s+\((?:Filer|Subject|Reporting)\)/.exec(item.title);
    if (!m?.[1] || !m[2] || !m[3] || !item.published) return [];
    const summary = item.summary ?? "";
    const itemText = [...summary.matchAll(/Item\s+(\d\.\d{2}):\s*([^<\n]+?)(?=\s*Item\s+\d\.\d{2}:|$)/g)].map((x) => `Item ${x[1]}: ${cleanText(x[2] ?? "")}`);
    const items = [...summary.matchAll(/Item\s+(\d\.\d{2})/g)].map((x) => x[1] as string);
    const accession = /AccNo:\s*([0-9-]{20})/.exec(summary)?.[1] ?? (item.id ? /accession-number=([0-9-]+)/.exec(item.id)?.[1] ?? null : null);
    return [{ form: m[1], companyName: m[2], cik: m[3].replace(/^0+/, ""), url: item.link, accession, items: [...new Set(items)], itemText, updated: item.published }];
  });
}

/** Filing ⇒ artículo (título propio a partir de los ítems; el texto de los ítems es de dominio público). */
export function filingToArticle(f: EdgarFilingEntry, companyLabel: string): RawArticle | null {
  const signal = f.items.filter((i) => !SEC_8K_LOW_SIGNAL_ITEMS.has(i));
  if (signal.length === 0) return null;
  const types = [...new Set(signal.map((i) => SEC_8K_ITEM_TYPES[i]?.type).filter((t): t is EventType => !!t && t !== "OTHER"))];
  const labels = signal.map((i) => SEC_8K_ITEM_TYPES[i]?.label ?? `Item ${i}`);
  return {
    sourceId: "sec-8k",
    url: f.url,
    title: `${companyLabel} files Form ${f.form}: ${labels.join("; ")}`,
    publishedAt: f.updated,
    timeBasis: "published",
    language: "en",
    publisher: "SEC EDGAR",
    author: null,
    snippet: f.itemText.join(" · ").slice(0, 280) || null,
    publisherCountry: "US",
    hints: { cik: f.cik, form: f.form, items: f.items, accession: f.accession ?? undefined, eventTypes: types, primary: true },
  };
}

export interface SecCurrentOptions {
  userAgent: string;
  /** CIK (sin ceros) ⇒ nombre de la empresa en MarketRadar. */
  universeCiks: ReadonlyMap<string, string>;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

export class SecCurrentFilingsSource implements NewsSource {
  readonly id = "sec-8k";
  readonly label = "SEC EDGAR — current Form 8-K filings";
  readonly kind = "company_filing" as const;
  readonly tier = 1 as const;
  readonly relevanceScope = "regulator" as const;
  readonly pollMinutes = 30;
  readonly license = {
    terms: "SEC EDGAR filings are public records (US federal government); fair-access policy applies.",
    termsUrl: "https://www.sec.gov/os/accessing-edgar-data",
    snippetAllowed: true,
    attribution: "U.S. Securities and Exchange Commission (EDGAR)",
  };
  private readonly http: NewsHttpClient;

  constructor(private readonly options: SecCurrentOptions) {
    this.http = new NewsHttpClient({ provider: "sec", userAgent: options.userAgent, minIntervalMs: 250, fetchImpl: options.fetchImpl });
  }

  async fetch(ctx: NewsFetchContext): Promise<NewsFetchResult> {
    const before = this.http.requestCount;
    const articles: RawArticle[] = [];
    const warnings: string[] = [];
    for (let page = 0; page < (this.options.maxPages ?? 8); page++) {
      const params = new URLSearchParams({ action: "getcurrent", type: "8-K", count: "100", start: String(page * 100), output: "atom" });
      const xml = await this.http.getText(`${ENDPOINT}?${params.toString()}`, "getcurrent 8-K");
      const entries = parseEdgarCurrent(xml);
      for (const e of entries) {
        const label = this.options.universeCiks.get(e.cik);
        if (!label || Date.parse(e.updated) < ctx.since.getTime()) continue;
        const article = filingToArticle(e, label);
        if (article) articles.push(article);
      }
      const oldest = entries.at(-1)?.updated;
      if (entries.length < 100 || (oldest && Date.parse(oldest) < ctx.since.getTime())) break;
    }
    return { articles, requests: this.http.requestCount - before, warnings };
  }
}
