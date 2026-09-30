import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getSyncEnv } from "@/config/sync-env";
import type { Database } from "@/data/supabase/database.types";
import { headlineCacheKey, localizeHeadlines, type HeadlineInput } from "@/translation/headlines";
import { OllamaTranslateGemmaProvider, SupabaseHeadlineCache } from "@/translation/server";

async function main() {
  const env = getSyncEnv();
  const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const provider = new OllamaTranslateGemmaProvider(process.env.HEADLINE_TRANSLATION_MODEL || "translategemma:4b", process.env.HEADLINE_TRANSLATION_URL || "http://127.0.0.1:11434", fetch, 120_000);
  const cache = new SupabaseHeadlineCache(db);
  const { data: events, error } = await db.from("news_events").select("id,title,representative_article_id").neq("fingerprint", "pending").order("importance", { ascending: false }).order("last_seen_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`Headline events: ${error.message}`);
  const ids = [...new Set((events ?? []).flatMap(e => e.representative_article_id === null ? [] : [e.representative_article_id]))];
  const articles = new Map<number, { language: string | null; url: string; publisher: string }>();
  for (let start = 0; start < ids.length; start += 100) {
    const response = await db.from("news_articles").select("id,language,url,publisher").in("id", ids.slice(start, start + 100));
    if (response.error) throw new Error(`Headline sources: ${response.error.message}`);
    for (const article of response.data ?? []) articles.set(article.id, article);
  }
  const items: HeadlineInput[] = (events ?? []).map(event => {
    const article = event.representative_article_id === null ? undefined : articles.get(event.representative_article_id);
    return { id: event.id, title: event.title, originalLanguage: article?.language ?? null, originalUrl: article?.url ?? null, source: article?.publisher ?? null };
  });
  const requestedLimit = Number(process.env.HEADLINE_TRANSLATION_LIMIT || 24);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) throw new Error("HEADLINE_TRANSLATION_LIMIT must be between 1 and 100");
  let pendingCount = 0;
  let failures = 0;
  for (const locale of ["es", "en"] as const) {
    const candidates = items.filter(item => item.originalLanguage?.toLowerCase().split(/[-_]/)[0] !== locale && item.title.trim());
    const cached = await cache.getMany(candidates.map(item => headlineCacheKey(item, locale, provider)));
    const pending = candidates.filter(item => !cached.get(headlineCacheKey(item, locale, provider))?.trim());
    pendingCount += pending.length;
    console.log(`Headlines ${locale}: ${pending.length} pending`);
    if (!process.argv.includes("--plan")) {
      const translated = await localizeHeadlines(pending.slice(0, requestedLimit), locale, provider, cache);
      const succeeded = translated.filter(item => item.headline.status === "translated").length;
      failures += translated.length - succeeded;
      console.log(`Headlines ${locale}: ${succeeded} cached, ${translated.length - succeeded} deferred`);
    }
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `needs_translation=${pendingCount > 0}\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch(() => { console.error("Headline cache update failed; original titles remain available."); process.exitCode = 1; });
