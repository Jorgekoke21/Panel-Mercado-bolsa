import { cleanText, decodeEntities } from "@/news/text";

/**
 * Parser mínimo de RSS 2.0 y Atom (sin dependencias). Solo extrae metadatos: título, enlace, fecha,
 * autor, categorías y la descripción/resumen (que el adaptador solo conserva si la licencia lo permite).
 */
export interface FeedItem {
  title: string;
  link: string;
  published: string | null;
  author: string | null;
  summary: string | null;
  categories: string[];
  id: string | null;
}

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  return m?.[1] !== undefined ? decodeEntities(m[1]).trim() : null;
}

function tags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  return [...block.matchAll(re)].map((m) => decodeEntities(m[1] ?? "").trim()).filter(Boolean);
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1] ?? "");
  const alternate = links.find((attrs) => /rel=["']alternate["']/i.test(attrs)) ?? links.find((attrs) => !/rel=/i.test(attrs)) ?? links[0];
  const href = alternate ? /href=["']([^"']+)["']/i.exec(alternate)?.[1] : null;
  return href ? decodeEntities(href) : null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const v = cleanText(value).replace(/\bEST\b/, "-0500").replace(/\bEDT\b/, "-0400").replace(/\bCST\b/, "-0600").replace(/\bCDT\b/, "-0500").replace(/\bPST\b/, "-0800").replace(/\bPDT\b/, "-0700");
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseFeed(xml: string, baseUrl?: string): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return blocks
    .map((block) => {
      const rawLink = isAtom ? atomLink(block) : (tag(block, "link") ?? tag(block, "guid"));
      let link = rawLink ? cleanText(rawLink) : "";
      if (link && baseUrl && !/^https?:/i.test(link)) {
        try {
          link = new URL(link, baseUrl).toString();
        } catch {
          link = "";
        }
      }
      const summary = tag(block, isAtom ? "summary" : "description") ?? tag(block, "content");
      return {
        title: cleanText(tag(block, "title") ?? ""),
        link,
        published: toIso(tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "dc:date") ?? tag(block, "updated")),
        author: (() => {
          const a = tag(block, "dc:creator") ?? (isAtom ? tag(tag(block, "author") ?? "", "name") : tag(block, "author"));
          const clean = a ? cleanText(a) : "";
          return clean || null;
        })(),
        summary: summary ? cleanText(summary) : null,
        categories: tags(block, "category").map(cleanText),
        id: tag(block, isAtom ? "id" : "guid"),
      };
    })
    .filter((i) => i.title && i.link);
}
