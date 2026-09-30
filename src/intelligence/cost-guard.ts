import { createHash } from "node:crypto";
import { type AiConfig, estimateCostUsd } from "./config";
import { estimateTokens, type ModelTier } from "./llm";

/**
 * CONTROL DE COSTES y CACHÉ de la IA.
 *
 *   * Caché: una tarea nunca se repite si no cambian (tarea + versión del prompt + modelo + hash de la
 *     entrada + hash del contexto). Clave = sha256 de todo ello.
 *   * Presupuesto: antes de cada llamada se ESTIMA el coste (tokens ≈ caracteres/4, salida = máximo
 *     configurado) y se rechaza si superaría el tope diario, el mensual o el nº de llamadas por ejecución.
 *   * Contabilidad: cada llamada registra tokens reales y coste estimado (observabilidad).
 */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function cacheKey(parts: { task: string; promptVersion: string; model: string; inputHash: string; contextHash: string }): string {
  return stableHash([parts.task, parts.promptVersion, parts.model, parts.inputHash, parts.contextHash]);
}

export interface SpendLedger {
  /** Gasto estimado (USD) desde una fecha. */
  spentSince(since: Date): Promise<number>;
  record(entry: { task: string; model: string; costUsd: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; at: Date }): Promise<void>;
}

export class MemorySpendLedger implements SpendLedger {
  entries: { task: string; model: string; costUsd: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; at: Date }[] = [];
  async spentSince(since: Date): Promise<number> {
    return this.entries.filter((e) => e.at >= since).reduce((s, e) => s + e.costUsd, 0);
  }
  async record(entry: MemorySpendLedger["entries"][number]): Promise<void> {
    this.entries.push(entry);
  }
}

export interface BudgetDecision {
  allowed: boolean;
  reason: string;
  estimatedCostUsd: number;
}

export class CostGuard {
  calls = 0;
  cacheHits = 0;
  rejectedByBudget = 0;
  spentUsd = 0;
  tokens = { input: 0, output: 0, cached: 0 };

  constructor(
    private readonly config: AiConfig,
    private readonly ledger: SpendLedger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(tier: ModelTier, input: unknown): Promise<BudgetDecision> {
    const model = tier === "fast" ? this.config.models.fast : this.config.models.deep;
    const estimated = estimateCostUsd(this.config.pricing, model, { input: estimateTokens(input) + 400, output: this.config.maxOutputTokens });
    if (estimated === null) return { allowed: false, reason: `No price configured for model ${model} (cannot enforce budget)`, estimatedCostUsd: 0 };
    if (this.calls >= this.config.maxCallsPerRun) return { allowed: false, reason: `AI_MAX_CALLS_PER_RUN (${this.config.maxCallsPerRun}) reached`, estimatedCostUsd: estimated };
    const now = this.now();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [day, month] = await Promise.all([this.ledger.spentSince(dayStart), this.ledger.spentSince(monthStart)]);
    if (day + estimated > this.config.dailyBudgetUsd) return { allowed: false, reason: `Daily budget ${this.config.dailyBudgetUsd} USD would be exceeded (spent ${day.toFixed(4)})`, estimatedCostUsd: estimated };
    if (month + estimated > this.config.monthlyBudgetUsd) return { allowed: false, reason: `Monthly budget ${this.config.monthlyBudgetUsd} USD would be exceeded (spent ${month.toFixed(4)})`, estimatedCostUsd: estimated };
    return { allowed: true, reason: "within budget", estimatedCostUsd: estimated };
  }

  async record(task: string, model: string, usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }, costUsd: number) {
    this.calls++;
    this.spentUsd += costUsd;
    this.tokens.input += usage.inputTokens;
    this.tokens.output += usage.outputTokens;
    this.tokens.cached += usage.cachedInputTokens;
    await this.ledger.record({ task, model, costUsd, ...usage, at: this.now() });
  }

  metrics() {
    return { calls: this.calls, cacheHits: this.cacheHits, rejectedByBudget: this.rejectedByBudget, estimatedCostUsd: Math.round(this.spentUsd * 1e6) / 1e6, tokens: { ...this.tokens } };
  }
}

/** Caché de salidas de IA (validadas). */
export interface AiCacheEntry<T = unknown> {
  key: string;
  task: string;
  subject: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  output: T;
  createdAt: string;
}

export interface AiCache {
  get<T>(key: string): Promise<AiCacheEntry<T> | null>;
  set<T>(entry: AiCacheEntry<T> & { status: "valid" | "rejected"; validation: unknown; usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }; costUsd: number; provider: string; expiresAt: string | null }): Promise<void>;
}

export class MemoryAiCache implements AiCache {
  private readonly map = new Map<string, AiCacheEntry & { status: string }>();
  async get<T>(key: string): Promise<AiCacheEntry<T> | null> {
    const e = this.map.get(key);
    return e && e.status === "valid" ? (e as unknown as AiCacheEntry<T>) : null;
  }
  async set<T>(entry: AiCacheEntry<T> & { status: "valid" | "rejected" }): Promise<void> {
    this.map.set(entry.key, entry as unknown as AiCacheEntry & { status: string });
  }
}
