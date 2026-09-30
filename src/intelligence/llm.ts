import type { z } from "zod";
import { type AiConfig, estimateCostUsd } from "./config";
import { toStrictJsonSchema } from "./schemas";

/**
 * Proveedores de modelos de lenguaje (desacoplados del dominio).
 *
 *   IntelligenceService (tareas: analizar evento, responder, ficha de empresa…)
 *        │  context pack + esquema zod
 *        ▼
 *   LlmProvider ── OpenAIResponsesProvider (Responses API, Structured Outputs estricto)
 *              └─ (futuro) proveedor local compatible (OPENAI_BASE_URL) o cualquier otro
 *
 * El dominio nunca conoce el modelo: pide "fast" o "deep" y recibe JSON ya validado con zod.
 */
export type ModelTier = "fast" | "deep";

export interface LlmRequest<T> {
  task: string;
  schemaName: string;
  schema: z.ZodType<T>;
  system: string;
  /** Entrada estructurada (context pack + pregunta). Se serializa a JSON. */
  input: unknown;
  tier: ModelTier;
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LlmResult<T> {
  output: T;
  model: string;
  usage: LlmUsage;
  costUsd: number;
}

export interface LlmProvider {
  readonly id: string;
  modelFor(tier: ModelTier): string;
  generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}

export class LlmError extends Error {
  override name = "LlmError";
  constructor(
    readonly kind: "refusal" | "invalid_output" | "http" | "budget" | "disabled" | "incomplete",
    message: string,
    readonly usage?: LlmUsage,
  ) {
    super(message);
  }
}

interface ResponsesApiOutput {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string } | null;
}

/** Estimación previa de tokens (≈ 4 caracteres por token) para el control de presupuesto. */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export class OpenAIResponsesProvider implements LlmProvider {
  readonly id = "openai";

  constructor(
    private readonly config: AiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  modelFor(tier: ModelTier): string {
    return tier === "fast" ? this.config.models.fast : this.config.models.deep;
  }

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    if (!this.config.apiKey) throw new LlmError("disabled", "OPENAI_API_KEY is not set");
    const model = this.modelFor(request.tier);
    const response = await this.fetchImpl(`${this.config.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        text: { format: { type: "json_schema", name: request.schemaName, schema: toStrictJsonSchema(request.schema), strict: true } },
        max_output_tokens: request.maxOutputTokens,
        // No se guardan conversaciones en OpenAI.
        store: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const json = (await response.json().catch(() => ({}))) as ResponsesApiOutput;
    if (!response.ok) throw new LlmError("http", `OpenAI HTTP ${response.status}: ${json.error?.message ?? "error"}`);
    const usage: LlmUsage = {
      inputTokens: json.usage?.input_tokens ?? 0,
      cachedInputTokens: json.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
    if (json.status === "incomplete") throw new LlmError("incomplete", `Incomplete response: ${json.incomplete_details?.reason ?? "unknown"}`, usage);
    const content = (json.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []) : []));
    const refusal = content.find((c) => c.type === "refusal");
    if (refusal) throw new LlmError("refusal", refusal.refusal ?? "refused", usage);
    const text = content.find((c) => c.type === "output_text")?.text;
    if (!text) throw new LlmError("invalid_output", "No output_text in response", usage);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError("invalid_output", "Output is not valid JSON", usage);
    }
    const result = request.schema.safeParse(parsed);
    if (!result.success) throw new LlmError("invalid_output", `Schema validation failed: ${result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, usage);
    const cost = estimateCostUsd(this.config.pricing, model, { input: usage.inputTokens, cachedInput: usage.cachedInputTokens, output: usage.outputTokens }) ?? 0;
    return { output: result.data, model, usage, costUsd: cost };
  }
}
