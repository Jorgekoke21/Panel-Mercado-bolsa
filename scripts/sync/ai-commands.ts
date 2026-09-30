/**
 * AI Intelligence (Fase 5) — NUNCA gasta dinero sin autorización explícita.
 *
 *   ai-status
 *       Configuración efectiva (proveedor, modelos, presupuestos, funciones), gasto registrado y motivo si está desactivada.
 *   ai-enrich [--days 3] [--deep 5] [--fast 10] [--plan]
 *       Selecciona eventos (FAST: clasificación dudosa · DEEP: los más importantes), estima el coste y, SOLO si
 *       OPENAI_API_KEY + AI_ALLOW_PAID_CALLS=true + presupuesto > 0, llama al modelo. --plan nunca llama.
 *       Las salidas se validan (JSON estricto + zod + grounding) y se cachean en ai_outputs.
 */
import { SupabaseNewsRepository } from "@/data/supabase/supabase-news-repository";
import type { MarketRadarSupabase } from "@/data/supabase/server-client";
import { aiStatus, estimateCostUsd, PRICING_VERIFIED_AT, readAiConfig } from "@/intelligence/config";
import { acceptedAiImpacts, analysisClaims, eventContextPack, planEnrichment } from "@/intelligence/enrichment";
import { estimateTokens } from "@/intelligence/llm";
import { createAiRuntime, FileSpendLedger } from "@/intelligence/runtime";
import { eventAnalysisSchema, eventClassificationSchema } from "@/intelligence/schemas";
import { buildRelationGraph } from "@/knowledge/graph";
import { buildUniverse } from "@/knowledge/universe";
import { SupabaseReferenceRepository } from "@/data/supabase/supabase-reference-repository";
import { parseNodeKey } from "@/knowledge/types";
import { SupabaseAiCache } from "@/sync/ai-cache";
import { argValue, type CommandDeps } from "./shared";

export const AI_COMMANDS = ["ai-status", "ai-enrich"] as const;

const PROMPTS = { deep: "event-analysis-v1", fast: "event-classification-v1" } as const;

export async function runAiCommand(command: string, args: readonly string[], deps: CommandDeps): Promise<void> {
  const { db, log } = deps;
  const config = readAiConfig();
  const status = aiStatus(config, "event_enrichment");
  const ledger = new FileSpendLedger();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (command === "ai-status") {
    log(`provider: ${config.provider} · remote enabled: ${status.remoteEnabled} · ${status.reason}`);
    log(`OPENAI_API_KEY: ${config.apiKey ? "set" : "not set"} · AI_ALLOW_PAID_CALLS: ${config.allowPaidCalls}`);
    log(`models: fast ${config.models.fast} · deep ${config.models.deep} (prices verified ${PRICING_VERIFIED_AT}; override with AI_PRICING_JSON)`);
    log(`budgets: daily ${config.dailyBudgetUsd} USD · monthly ${config.monthlyBudgetUsd} USD · max calls/run ${config.maxCallsPerRun} · max output tokens ${config.maxOutputTokens}`);
    log(`features: ${[...config.features].join(", ")}`);
    log(`spent (estimated, data/logs/ai-usage.jsonl): today ${(await ledger.spentSince(dayStart)).toFixed(4)} USD · this month ${(await ledger.spentSince(monthStart)).toFixed(4)} USD`);
    const outputs = await db.from("ai_outputs").select("status, cost_usd, input_tokens, output_tokens");
    const rows = outputs.data ?? [];
    log(`ai_outputs: ${rows.length} (${rows.filter((r) => r.status === "valid").length} valid, ${rows.filter((r) => r.status === "rejected").length} rejected) · tokens in ${rows.reduce((s, r) => s + r.input_tokens, 0)} out ${rows.reduce((s, r) => s + r.output_tokens, 0)}`);
    return;
  }

  // ai-enrich
  const days = Number(argValue(args, "--days") ?? 3);
  const repo = new SupabaseNewsRepository(db as unknown as MarketRadarSupabase, () => now);
  const events = await repo.listEvents({ since: new Date(now.getTime() - days * 86_400_000).toISOString(), limit: 400 });
  const plan = planEnrichment(events, { maxDeep: Number(argValue(args, "--deep") ?? 5), maxFast: Number(argValue(args, "--fast") ?? 10) });
  const securities = await new SupabaseReferenceRepository(db as unknown as MarketRadarSupabase).listSecurities();
  const graph = buildRelationGraph(buildUniverse(securities));
  const label = (n: string) => graph.label(n as never);

  // Estimación previa (sin llamadas): tokens de entrada del context pack + salida máxima.
  let estimate = 0;
  const packs = new Map<string, ReturnType<typeof eventContextPack>>();
  for (const id of [...plan.deep, ...plan.fast]) {
    const found = await repo.getEvent(id);
    if (!found) continue;
    const pack = eventContextPack(found.event, found.sources, label);
    packs.set(id, pack);
    const model = plan.deep.includes(id) ? config.models.deep : config.models.fast;
    estimate += estimateCostUsd(config.pricing, model, { input: estimateTokens(pack.toPrompt()) + 600, output: config.maxOutputTokens }) ?? 0;
  }
  log(`candidates: ${events.length} events (${days} days) → deep ${plan.deep.length} · fast ${plan.fast.length} · skipped ${plan.skipped.length}`);
  log(`estimated worst-case cost of this run: ${estimate.toFixed(4)} USD (${config.models.deep} / ${config.models.fast})`);
  if (args.includes("--plan") || !status.remoteEnabled) {
    log(args.includes("--plan") ? "plan only: no calls made." : `no calls made: ${status.reason}`);
    return;
  }

  const runtime = createAiRuntime(config, new SupabaseAiCache(db), ledger);
  const startedAt = new Date().toISOString();
  let applied = 0;
  for (const id of [...plan.deep, ...plan.fast]) {
    const found = await repo.getEvent(id);
    const pack = packs.get(id);
    if (!found || !pack) continue;
    const deep = plan.deep.includes(id);
    const input = { event_id: id, title: found.event.title, deterministic_type: found.event.type, first_seen: found.event.firstSeenAt };
    if (deep) {
      const res = await runtime.run({ feature: "event_enrichment", task: "event_analysis", subject: `event:${id}`, promptVersion: PROMPTS.deep, schemaName: "event_analysis", schema: eventAnalysisSchema, instructions: "Analyse this market event. Use node keys exactly as given in the evidence for companies, industries, commodities and factors.", input, pack, tier: "deep", claimsOf: analysisClaims, ttlHours: 24 * 14 });
      if (!res) {
        log(`  ${id}: skipped (${runtime.lastSkipReason})`);
        continue;
      }
      const allowed = new Set(found.event.links.map((l) => l.node as string).concat(found.event.impacts.map((i) => i.target as string)));
      const impacts = acceptedAiImpacts(res.output, pack, allowed);
      await db.from("news_events").update({ summary: res.output.summary, summary_origin: "ai" }).eq("id", id);
      await db.from("news_event_impacts").delete().eq("event_id", id).eq("origin", "ai");
      if (impacts.length)
        await db.from("news_event_impacts").insert(
          impacts.map((i) => ({ event_id: id, target: i.target, target_kind: parseNodeKey(i.target)?.kind ?? "unknown", channel: i.channel, direction: i.direction, strength: i.strength, horizon: i.horizon, confidence: Math.min(i.confidence, found.event.confidence.score), mechanism: i.mechanism.slice(0, 200), rationale: `AI interpretation (${res.model}), evidence: ${i.evidence_ids.join(", ")}`, path: [i.target], relation_ids: [], origin: "ai" })),
        );
      applied++;
      log(`  ${id}: analysed${res.cached ? " (cache)" : ""} · ${impacts.length} AI impacts accepted · ${res.grounding.rejected.length} claims rejected`);
    } else {
      const res = await runtime.run({ feature: "event_enrichment", task: "event_classification", subject: `event:${id}`, promptVersion: PROMPTS.fast, schemaName: "event_classification", schema: eventClassificationSchema, instructions: "Classify the event into the MarketRadar taxonomy. Cite nothing; classification only.", input, pack, tier: "fast", claimsOf: () => [], minGrounded: 0, ttlHours: 24 * 14 });
      if (!res) continue;
      if (res.output.confidence >= 0.7 && res.output.event_type !== found.event.type) {
        await db.from("news_events").update({ event_type: res.output.event_type, secondary_types: res.output.secondary_types }).eq("id", id);
        applied++;
      }
    }
  }
  const m = runtime.guard.metrics();
  await db.from("sync_runs").insert({ provider: "openai", job_type: "ai_enrichment", scope: `events:${days}d`, status: "succeeded", started_at: startedAt, finished_at: new Date().toISOString(), records_read: plan.deep.length + plan.fast.length, records_written: applied, requests_made: m.calls, metrics: m, params: { deep: plan.deep.length, fast: plan.fast.length } });
  log(`AI calls ${m.calls} · cache hits ${m.cacheHits} · budget rejections ${m.rejectedByBudget} · tokens in ${m.tokens.input} out ${m.tokens.output} · estimated cost ${m.estimatedCostUsd} USD`);
}
