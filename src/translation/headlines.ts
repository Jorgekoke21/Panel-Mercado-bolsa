import { createHash } from "node:crypto";
import type { Locale } from "@/i18n/messages";

export interface HeadlineInput {
  id: string;
  /** Representative article headline, never modified by translation. */
  title: string;
  originalLanguage: string | null;
  originalUrl: string | null;
  source: string | null;
}

export interface DisplayHeadline {
  title: string;
  language: string | null;
  status: "original" | "translated" | "fallback";
  provider: string | null;
}

export interface HeadlineTranslation {
  key: string;
  eventId: string;
  originalTitle: string;
  originalLanguage: string | null;
  originalUrl: string | null;
  source: string | null;
  targetLocale: Locale;
  provider: string;
  providerVersion: string;
  translatedTitle: string;
}

export interface TranslationProvider {
  readonly id: string;
  readonly version: string;
  readonly batchSize?: number;
  translateBatch(texts: readonly string[], sourceLanguage: string, targetLocale: Locale): Promise<string[]>;
}

export interface TranslationCache {
  getMany(keys: readonly string[]): Promise<Map<string, string>>;
  putMany(entries: readonly HeadlineTranslation[]): Promise<void>;
}

function language(code: string | null): string {
  return code?.trim().toLowerCase().split(/[-_]/)[0] || "auto";
}

export function headlineCacheKey(item: HeadlineInput, targetLocale: Locale, provider: TranslationProvider): string {
  return createHash("sha256")
    .update(JSON.stringify([item.id, item.title, language(item.originalLanguage), item.originalUrl, item.source, targetLocale, provider.id, provider.version]))
    .digest("hex");
}

/** Localize presentation data. Neither the event nor its representative source is mutated. */
export async function localizeHeadlines<T extends HeadlineInput>(
  items: readonly T[],
  targetLocale: Locale,
  provider: TranslationProvider | null,
  cache: TranslationCache | null,
): Promise<(T & { headline: DisplayHeadline })[]> {
  const result = items.map((item) => ({
    ...item,
    headline: {
      title: item.title,
      language: item.originalLanguage,
      status: language(item.originalLanguage) === targetLocale ? "original" : "fallback",
      provider: null,
    } as DisplayHeadline,
  }));
  if (!provider || result.length === 0) return result;

  const pending = new Map<string, { key: string; item: T; sourceLanguage: string; indices: number[] }>();
  for (let i = 0; i < result.length; i++) {
    const item = items[i] as T;
    const sourceLanguage = language(item.originalLanguage);
    if (sourceLanguage === targetLocale || !item.title.trim()) continue;
    const key = headlineCacheKey(item, targetLocale, provider);
    const existing = pending.get(key);
    if (existing) existing.indices.push(i);
    else pending.set(key, { key, item, sourceLanguage, indices: [i] });
  }
  if (pending.size === 0) return result;

  let cached = new Map<string, string>();
  if (cache) {
    try {
      cached = await cache.getMany([...pending.keys()]);
    } catch (error) {
      console.warn("[headlines] cache read failed", error);
    }
  }

  const missing = new Map<string, typeof pending extends Map<string, infer V> ? V : never>();
  for (const [key, entry] of pending) {
    const translated = cached.get(key)?.trim();
    if (translated) {
      for (const index of entry.indices) result[index]!.headline = { title: translated, language: targetLocale, status: "translated", provider: provider.id };
    } else missing.set(key, entry);
  }

  const groups = new Map<string, typeof missing extends Map<string, infer V> ? V[] : never>();
  for (const entry of missing.values()) {
    const group = groups.get(entry.sourceLanguage) ?? [];
    group.push(entry);
    groups.set(entry.sourceLanguage, group);
  }

  const written: HeadlineTranslation[] = [];
  const failedSources = new Set<string>();
  const batches = [...groups.entries()].flatMap(([sourceLanguage, entries]) => {
    const chunks = [];
    const batchSize = Math.max(1, Math.min(12, provider.batchSize ?? 12));
    for (let start = 0; start < entries.length; start += batchSize) chunks.push({ sourceLanguage, entries: entries.slice(start, start + batchSize) });
    return chunks;
  });
  // Two local model requests at a time keep first-page latency bounded without overwhelming the CPU.
  for (let start = 0; start < batches.length; start += 2) {
    await Promise.all(batches.slice(start, start + 2).map(async ({ sourceLanguage, entries }) => {
      if (failedSources.has(sourceLanguage)) return;
      try {
        const texts = await provider.translateBatch(entries.map((entry) => entry.item.title), sourceLanguage, targetLocale);
        if (texts.length !== entries.length) throw new Error("Translation provider returned the wrong number of headlines");
        texts.forEach((translated, index) => {
          const entry = entries[index]!;
          const clean = translated?.trim();
          if (!clean) return;
          for (const resultIndex of entry.indices) result[resultIndex]!.headline = { title: clean, language: targetLocale, status: "translated", provider: provider.id };
          written.push({ key: entry.key, eventId: entry.item.id, originalTitle: entry.item.title, originalLanguage: entry.item.originalLanguage, originalUrl: entry.item.originalUrl, source: entry.item.source, targetLocale, provider: provider.id, providerVersion: provider.version, translatedTitle: clean });
        });
      } catch (error) {
        failedSources.add(sourceLanguage);
        console.warn(`[headlines] ${provider.id} ${sourceLanguage}→${targetLocale} failed`, error);
      }
    }));
  }
  if (cache && written.length > 0) {
    try {
      await cache.putMany(written);
    } catch (error) {
      console.warn("[headlines] cache write failed", error);
    }
  }
  return result;
}
