import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/data/supabase/database.types";
import type { Locale } from "@/i18n/messages";
import type { EventCardVM } from "@/services/news";
import { localizeHeadlines, type HeadlineTranslation, type TranslationCache, type TranslationProvider } from "./headlines";

const DEFAULT_LIBRE_URL = "http://127.0.0.1:5000";
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "translategemma:4b";
const LANGUAGE_NAMES: Record<string, string> = { en: "English", es: "Spanish", de: "German", fr: "French", it: "Italian", pt: "Portuguese" };

export class OllamaTranslateGemmaProvider implements TranslationProvider {
  readonly id = "ollama-translategemma";
  readonly batchSize = 1;
  readonly version: string;
  constructor(private readonly model: string, private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    this.version = model;
  }

  async translateBatch(texts: readonly string[], sourceLanguage: string, targetLocale: Locale): Promise<string[]> {
    const source = LANGUAGE_NAMES[sourceLanguage] ?? (sourceLanguage === "auto" ? "original language" : sourceLanguage);
    const target = LANGUAGE_NAMES[targetLocale];
    const translations: string[] = [];
    for (const original of texts) {
      const prompt = `You are a professional ${source} (${sourceLanguage}) to ${target} (${targetLocale}) translator. Your goal is to accurately convey the meaning and nuances of the original ${source} text while adhering to ${target} grammar, vocabulary, and cultural sensitivities.\nProduce only the ${target} translation, without any additional explanations or commentary. Please translate the following ${source} text into ${target}:\n\n\n${original}`;
      const response = await this.fetcher(new URL("/api/chat", this.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: false, keep_alive: -1, messages: [{ role: "user", content: prompt }], options: { temperature: 0 } }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("message" in body) || !body.message || typeof body.message !== "object" || !("content" in body.message) || typeof body.message.content !== "string") {
        throw new Error("Ollama returned an invalid translation response");
      }
      const translated = body.message.content.trim().replace(/^(["“])([\s\S]*)(["”])$/, "$2");
      if (!translated) throw new Error("Ollama returned an empty translation");
      translations.push(translated);
    }
    return translations;
  }
}

export class LibreTranslateProvider implements TranslationProvider {
  readonly id = "libretranslate";
  constructor(readonly version: string, private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async translateBatch(texts: readonly string[], sourceLanguage: string, targetLocale: Locale): Promise<string[]> {
    const response = await this.fetcher(new URL("/translate", this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: sourceLanguage, target: targetLocale, format: "text" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`LibreTranslate returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("translatedText" in body) || !Array.isArray(body.translatedText) || !body.translatedText.every((text) => typeof text === "string")) {
      throw new Error("LibreTranslate returned an invalid batch response");
    }
    return body.translatedText;
  }
}

export class SupabaseHeadlineCache implements TranslationCache {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getMany(keys: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let start = 0; start < keys.length; start += 100) {
      const { data, error } = await this.db.from("news_headline_translations").select("cache_key, translated_title").in("cache_key", keys.slice(start, start + 100));
      if (error) throw new Error(`Headline cache read: ${error.message}`);
      for (const row of data ?? []) out.set(row.cache_key, row.translated_title);
    }
    return out;
  }

  async putMany(entries: readonly HeadlineTranslation[]): Promise<void> {
    for (let start = 0; start < entries.length; start += 100) {
      const rows = entries.slice(start, start + 100).map((entry) => ({
        cache_key: entry.key,
        event_id: entry.eventId,
        original_title: entry.originalTitle,
        original_language: entry.originalLanguage,
        original_url: entry.originalUrl,
        source: entry.source,
        target_locale: entry.targetLocale,
        provider: entry.provider,
        provider_version: entry.providerVersion,
        translated_title: entry.translatedTitle,
      }));
      const { error } = await this.db.from("news_headline_translations").upsert(rows, { onConflict: "cache_key" });
      if (error) throw new Error(`Headline cache write: ${error.message}`);
    }
  }
}

function translationServices(): { provider: TranslationProvider | null; cache: TranslationCache | null } {
  if (process.env.HEADLINE_TRANSLATION_PROVIDER === "off") return { provider: null, cache: null };
  const provider: TranslationProvider = process.env.HEADLINE_TRANSLATION_PROVIDER === "libretranslate"
    ? new LibreTranslateProvider(process.env.HEADLINE_TRANSLATION_VERSION || "libretranslate-1.9.6-argos-model-1", process.env.HEADLINE_TRANSLATION_URL || DEFAULT_LIBRE_URL)
    : new OllamaTranslateGemmaProvider(process.env.HEADLINE_TRANSLATION_MODEL || DEFAULT_OLLAMA_MODEL, process.env.HEADLINE_TRANSLATION_URL || DEFAULT_OLLAMA_URL);
  const url = process.env.SUPABASE_URL;
  const secret = process.env.HEADLINE_TRANSLATION_MODE === "cache-only"
    ? process.env.SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return { provider, cache: null };
  const db = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { provider, cache: new SupabaseHeadlineCache(db) };
}

/** Shared presentation boundary for World Pulse, entity pages, Ask and event detail. */
export async function localizeEventCards(events: readonly EventCardVM[], locale: Locale): Promise<EventCardVM[]> {
  const { provider, cache } = translationServices();
  return localizeHeadlines(events, locale, provider, cache, {
    cacheOnly: process.env.HEADLINE_TRANSLATION_MODE === "cache-only",
  });
}

export async function localizeEntityContext<T extends { events: EventCardVM[]; impacts: { event: EventCardVM }[] }>(context: T, locale: Locale): Promise<T> {
  const translated = await localizeEventCards([...context.events, ...context.impacts.map((item) => item.event)], locale);
  const byId = new Map(translated.map((card) => [card.id, card]));
  return {
    ...context,
    events: context.events.map((card) => byId.get(card.id) ?? card),
    impacts: context.impacts.map((item) => ({ ...item, event: byId.get(item.event.id) ?? item.event })),
  };
}
