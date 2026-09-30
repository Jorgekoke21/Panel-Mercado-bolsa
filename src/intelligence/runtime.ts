import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { z } from "zod";
import { type AiConfig, type AiFeature, aiStatus, readAiConfig } from "./config";
import { type AiCache, cacheKey, CostGuard, MemoryAiCache, type SpendLedger, stableHash } from "./cost-guard";
import type { Claim, ContextPack } from "./evidence";
import { type GroundingReport, validateClaims } from "./grounding";
import { LlmError, type LlmProvider, type ModelTier, OpenAIResponsesProvider } from "./llm";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";

/**
 * Runtime de IA: una única puerta para cualquier tarea con modelo.
 *
 *   ¿función habilitada + clave + autorización de pago + presupuesto? ─no─► null (se usa el determinista)
 *   ¿en caché (tarea+prompt+modelo+entrada+contexto)? ─sí─► salida cacheada (0 coste)
 *   ¿cabe en el presupuesto (estimación previa)? ─no─► null + motivo
 *   llamada ─► JSON estricto ─► zod ─► grounding (afirmaciones sin evidencia fuera) ─► resultado
 */
export const SYSTEM_RULES = [
  "You are MarketRadar's analysis engine for financial-market context.",
  "Use ONLY the evidence items provided in the input (each has an id). Do not use outside knowledge for facts.",
  "Never introduce numbers, prices, percentages, dates or facts that are not present in the cited evidence.",
  "Every claim must cite evidence_ids. Kinds: FACT = official primary source; SOURCE_CLAIM = what a media outlet reports (attribute it); MARKET_DATA = MarketRadar-computed data; INFERENCE = MarketRadar graph relationship; AI_INTERPRETATION = your own interpretation.",
  "Never assert causality between news and price moves: use 'possibly related' or 'likely related' and explain the evidence.",
  "Political and geopolitical topics: neutral, factual, non-partisan; separate facts, statements and analysis; focus on economic and market relationships.",
  "If the evidence is insufficient, say so and list it under unknowns. This is not investment advice.",
].join("\n");

export interface AiTaskRequest<T> {
  locale?: Locale;
  feature: AiFeature;
  task: string;
  subject: string;
  promptVersion: string;
  schemaName: string;
  schema: z.ZodType<T>;
  instructions: string;
  input: unknown;
  pack: ContextPack;
  tier: ModelTier;
  /** Extrae las afirmaciones de la salida para validarlas contra el pack. */
  claimsOf: (output: T) => Claim[];
  /** Proporción mínima de afirmaciones con evidencia para aceptar la salida. */
  minGrounded?: number;
  ttlHours?: number;
}

export interface AiTaskResult<T> {
  output: T;
  model: string;
  cached: boolean;
  grounding: GroundingReport;
  costUsd: number;
}

export interface AiRuntimeDeps {
  config: AiConfig;
  provider: LlmProvider;
  cache: AiCache;
  ledger: SpendLedger;
  now?: () => Date;
}

export class AiRuntime {
  readonly guard: CostGuard;
  lastSkipReason: string | null = null;

  constructor(readonly deps: AiRuntimeDeps) {
    this.guard = new CostGuard(deps.config, deps.ledger, deps.now);
  }

  status(feature?: AiFeature) {
    return aiStatus(this.deps.config, feature);
  }

  async run<T>(req: AiTaskRequest<T>): Promise<AiTaskResult<T> | null> {
    const status = aiStatus(this.deps.config, req.feature);
    if (!status.remoteEnabled) {
      this.lastSkipReason = status.reason;
      return null;
    }
    const model = this.deps.provider.modelFor(req.tier);
    const locale = req.locale ?? DEFAULT_LOCALE;
    const inputHash = stableHash({ input: req.input, locale });
    const key = cacheKey({ task: req.task, promptVersion: req.promptVersion, model, inputHash, contextHash: stableHash(req.pack.toPrompt()) });
    const hit = await this.deps.cache.get<T>(key);
    if (hit) {
      this.guard.cacheHits++;
      return { output: hit.output, model: hit.model, cached: true, grounding: validateClaims(req.claimsOf(hit.output), req.pack), costUsd: 0 };
    }
    const payload = { locale, instructions: req.instructions, evidence: req.pack.toPrompt(), input: req.input };
    const budget = await this.guard.check(req.tier, payload);
    if (!budget.allowed) {
      this.guard.rejectedByBudget++;
      this.lastSkipReason = budget.reason;
      return null;
    }
    try {
      const languageRule = locale === "es" ? "Write all user-facing prose in Spanish. Preserve financial tickers, acronyms, IDs, evidence IDs, and structured enum values exactly as provided." : "Write all user-facing prose in English. Preserve financial tickers, acronyms, IDs, evidence IDs, and structured enum values exactly as provided.";
      const result = await this.deps.provider.generate({ task: req.task, schemaName: req.schemaName, schema: req.schema, system: `${SYSTEM_RULES}\n${languageRule}`, input: payload, tier: req.tier, maxOutputTokens: this.deps.config.maxOutputTokens });
      await this.guard.record(req.task, result.model, result.usage, result.costUsd);
      const grounding = validateClaims(req.claimsOf(result.output), req.pack);
      const valid = grounding.groundedRatio >= (req.minGrounded ?? 0.6);
      const now = (this.deps.now ?? (() => new Date()))();
      await this.deps.cache.set({
        key,
        task: req.task,
        subject: req.subject,
        model: result.model,
        promptVersion: req.promptVersion,
        inputHash,
        output: result.output,
        createdAt: now.toISOString(),
        status: valid ? "valid" : "rejected",
        validation: { groundedRatio: grounding.groundedRatio, rejected: grounding.rejected.map((r) => ({ text: r.claim.text, reason: r.reason })) },
        usage: result.usage,
        costUsd: result.costUsd,
        provider: this.deps.provider.id,
        expiresAt: req.ttlHours ? new Date(now.getTime() + req.ttlHours * 3_600_000).toISOString() : null,
      });
      if (!valid) {
        this.lastSkipReason = `AI output rejected by grounding (${Math.round(grounding.groundedRatio * 100)}% of claims supported)`;
        return null;
      }
      return { output: result.output, model: result.model, cached: false, grounding, costUsd: result.costUsd };
    } catch (error) {
      if (error instanceof LlmError && error.usage) await this.guard.record(req.task, model, error.usage, 0);
      this.lastSkipReason = error instanceof Error ? error.message : String(error);
      return null;
    }
  }
}

/**
 * Registro de gasto persistente en disco (JSON Lines) compartido por la web local y el CLI: el tope
 * diario/mensual sobrevive a reinicios. En la migración a Cloud se sustituirá por una tabla.
 */
export class FileSpendLedger implements SpendLedger {
  constructor(private readonly path = resolve(process.cwd(), "data/logs/ai-usage.jsonl")) {}

  async spentSince(since: Date): Promise<number> {
    if (!existsSync(this.path)) return 0;
    let total = 0;
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as { at: string; costUsd: number };
        if (Date.parse(e.at) >= since.getTime()) total += e.costUsd;
      } catch {
        // línea corrupta: se ignora
      }
    }
    return total;
  }

  async record(entry: { task: string; model: string; costUsd: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; at: Date }): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify({ ...entry, at: entry.at.toISOString() })}\n`, "utf8");
  }
}

let webRuntime: AiRuntime | null = null;

/** Runtime de la app web (proceso único): caché en memoria + registro de gasto en disco. */
export function getWebAiRuntime(): AiRuntime {
  webRuntime ??= createAiRuntime(readAiConfig(), new MemoryAiCache());
  return webRuntime;
}

export function createAiRuntime(config: AiConfig, cache: AiCache, ledger: SpendLedger = new FileSpendLedger(), fetchImpl?: typeof fetch): AiRuntime {
  return new AiRuntime({ config, provider: new OpenAIResponsesProvider(config, fetchImpl), cache, ledger });
}
