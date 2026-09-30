import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/data/supabase/database.types";
import type { AiCache, AiCacheEntry } from "@/intelligence/cost-guard";

type Db = SupabaseClient<Database>;

/** Caché + auditoría de IA en `ai_outputs` (lado sync, service_role). Solo las salidas "valid" se reutilizan. */
export class SupabaseAiCache implements AiCache {
  constructor(private readonly db: Db) {}

  async get<T>(key: string): Promise<AiCacheEntry<T> | null> {
    const r = await this.db.from("ai_outputs").select("cache_key, task, subject, model, prompt_version, input_hash, output, created_at, expires_at").eq("cache_key", key).eq("status", "valid").maybeSingle();
    if (r.error) throw new Error(`ai_outputs: ${r.error.message}`);
    if (!r.data || (r.data.expires_at && Date.parse(r.data.expires_at) < Date.now())) return null;
    return { key: r.data.cache_key, task: r.data.task, subject: r.data.subject, model: r.data.model, promptVersion: r.data.prompt_version, inputHash: r.data.input_hash, output: r.data.output as T, createdAt: r.data.created_at };
  }

  async set<T>(e: AiCacheEntry<T> & { status: "valid" | "rejected"; validation: unknown; usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }; costUsd: number; provider: string; expiresAt: string | null }): Promise<void> {
    const r = await this.db.from("ai_outputs").upsert(
      {
        cache_key: e.key,
        task: e.task,
        subject: e.subject,
        provider: e.provider,
        model: e.model,
        prompt_version: e.promptVersion,
        input_hash: e.inputHash,
        status: e.status,
        output: e.output as unknown as Json,
        validation: (e.validation ?? {}) as NonNullable<Json>,
        input_tokens: e.usage.inputTokens,
        output_tokens: e.usage.outputTokens,
        cached_input_tokens: e.usage.cachedInputTokens,
        cost_usd: e.costUsd,
        expires_at: e.expiresAt,
      },
      { onConflict: "cache_key" },
    );
    if (r.error) throw new Error(`ai_outputs: ${r.error.message}`);
  }
}
