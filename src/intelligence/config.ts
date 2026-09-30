/**
 * Configuración de la capa de IA (Fase 5). NO importa "server-only" para poder usarse desde el CLI y
 * los tests, pero solo se lee en servidor (ninguna variable lleva prefijo NEXT_PUBLIC_).
 *
 * Doble llave para gastar dinero: hacen falta OPENAI_API_KEY **y** AI_ALLOW_PAID_CALLS=true **y**
 * un presupuesto > 0. Sin cualquiera de ellas MarketRadar funciona con el motor determinista.
 *
 *   AI_PROVIDER            deterministic (defecto) | openai
 *   OPENAI_API_KEY         clave (secreto)
 *   AI_ALLOW_PAID_CALLS    "true" para autorizar llamadas de pago
 *   OPENAI_MODEL_FAST      modelo barato (clasificación)       — defecto gpt-6-luna
 *   OPENAI_MODEL_DEEP      modelo de análisis profundo         — defecto gpt-6.1-sol
 *   AI_DAILY_BUDGET_USD    tope diario (defecto 0 ⇒ nada)
 *   AI_MONTHLY_BUDGET_USD  tope mensual (defecto 0 ⇒ nada)
 *   AI_MAX_CALLS_PER_RUN   llamadas máximas por ejecución del job (defecto 20)
 *   AI_MAX_OUTPUT_TOKENS   tokens de salida por llamada (defecto 1200)
 *   AI_FEATURES            event_enrichment,ask,company_brief,explain_move,learn (defecto: todas)
 */
export const AI_FEATURES = ["event_enrichment", "ask", "company_brief", "explain_move", "learn"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface ModelPrice {
  /** USD por millón de tokens. */
  input: number;
  cachedInput: number;
  output: number;
}

/**
 * Precios de referencia (tier estándar), verificados en https://developers.openai.com/api/docs/pricing
 * el 2026-09-29. Se pueden sobrescribir con AI_PRICING_JSON='{"model":{"input":…,"cachedInput":…,"output":…}}'.
 * Solo se usan para ESTIMAR y limitar el gasto; la factura real la da OpenAI.
 */
export const PRICING_VERIFIED_AT = "2026-09-29";
export const DEFAULT_PRICING: Readonly<Record<string, ModelPrice>> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
};

export interface AiConfig {
  provider: "deterministic" | "openai";
  apiKey: string | null;
  allowPaidCalls: boolean;
  baseUrl: string;
  models: { fast: string; deep: string };
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxCallsPerRun: number;
  maxOutputTokens: number;
  features: ReadonlySet<AiFeature>;
  pricing: Readonly<Record<string, ModelPrice>>;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  let pricing: Record<string, ModelPrice> = { ...DEFAULT_PRICING };
  if (env.AI_PRICING_JSON) {
    try {
      pricing = { ...pricing, ...(JSON.parse(env.AI_PRICING_JSON) as Record<string, ModelPrice>) };
    } catch {
      // Configuración inválida: se ignora (se mantienen los precios por defecto).
    }
  }
  const features = env.AI_FEATURES ? env.AI_FEATURES.split(",").map((f) => f.trim()).filter((f): f is AiFeature => (AI_FEATURES as readonly string[]).includes(f)) : [...AI_FEATURES];
  return {
    provider: env.AI_PROVIDER === "openai" ? "openai" : "deterministic",
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    allowPaidCalls: env.AI_ALLOW_PAID_CALLS === "true",
    baseUrl: env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    models: { fast: env.OPENAI_MODEL_FAST?.trim() || "gpt-6-luna", deep: env.OPENAI_MODEL_DEEP?.trim() || "gpt-6.1-sol" },
    dailyBudgetUsd: num(env.AI_DAILY_BUDGET_USD, 0),
    monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 0),
    maxCallsPerRun: num(env.AI_MAX_CALLS_PER_RUN, 20),
    maxOutputTokens: num(env.AI_MAX_OUTPUT_TOKENS, 1200),
    features: new Set(features),
    pricing,
  };
}

export interface AiStatus {
  /** El proveedor remoto puede usarse para esta función. */
  remoteEnabled: boolean;
  provider: "deterministic" | "openai";
  reason: string;
}

/** ¿Puede usarse la IA remota para una función? Si no, el motivo explica qué falta. */
export function aiStatus(config: AiConfig, feature?: AiFeature): AiStatus {
  const off = (reason: string): AiStatus => ({ remoteEnabled: false, provider: "deterministic", reason });
  if (config.provider !== "openai") return off("AI_PROVIDER is not 'openai' — deterministic MarketRadar engine");
  if (!config.apiKey) return off("OPENAI_API_KEY is not set — deterministic MarketRadar engine");
  if (!config.allowPaidCalls) return off("AI_ALLOW_PAID_CALLS is not 'true' — paid calls are not authorized");
  if (config.dailyBudgetUsd <= 0 || config.monthlyBudgetUsd <= 0) return off("AI budget is 0 — set AI_DAILY_BUDGET_USD and AI_MONTHLY_BUDGET_USD");
  if (feature && !config.features.has(feature)) return off(`AI feature '${feature}' is disabled in AI_FEATURES`);
  return { remoteEnabled: true, provider: "openai", reason: `OpenAI enabled (${config.models.fast} / ${config.models.deep})` };
}

export function estimateCostUsd(pricing: Readonly<Record<string, ModelPrice>>, model: string, usage: { input: number; cachedInput?: number; output: number }): number | null {
  const p = pricing[model];
  if (!p) return null;
  const cached = usage.cachedInput ?? 0;
  return ((usage.input - cached) * p.input + cached * p.cachedInput + usage.output * p.output) / 1_000_000;
}
