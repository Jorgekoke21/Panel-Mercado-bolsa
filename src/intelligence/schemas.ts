import { z } from "zod";
import { EVENT_TYPES } from "@/domain/news";

/**
 * Esquemas de SALIDA ESTRUCTURADA (Fase 5). Son el contrato con cualquier proveedor de IA:
 *   * OpenAI los recibe como JSON Schema estricto (Structured Outputs) ⇒ no hay parsing de texto libre.
 *   * La respuesta se valida SIEMPRE con zod y después con el validador de grounding.
 * Los nombres de campo están en snake_case (más estables para los modelos). Todo campo es obligatorio;
 * lo que puede faltar se declara nullable (requisito del modo estricto).
 */
export const CLAIM_KINDS = ["FACT", "SOURCE_CLAIM", "MARKET_DATA", "INFERENCE", "AI_INTERPRETATION", "UNKNOWN"] as const;

export const claimSchema = z.strictObject({
  text: z.string().min(1).max(400),
  kind: z.enum(CLAIM_KINDS),
  evidence_ids: z.array(z.string()).max(8),
});

export const impactSchema = z.strictObject({
  target: z.string().describe("Node key from the context, e.g. company:<uuid>, industry:453010, commodity:crude_oil"),
  channel: z.enum(["DIRECT", "SECOND_ORDER", "MACRO", "SUPPLY_CHAIN"]),
  direction: z.enum(["potential_positive", "potential_negative", "mixed_uncertain"]),
  strength: z.number().int().min(1).max(3),
  horizon: z.enum(["days", "weeks", "months", "quarters"]),
  mechanism: z.string().max(200),
  confidence: z.number().min(0).max(1),
  evidence_ids: z.array(z.string()).max(8),
});

/** Análisis de un evento (enriquecimiento opcional de un evento ya agrupado por el motor determinista). */
export const eventAnalysisSchema = z.strictObject({
  event_type: z.enum(EVENT_TYPES),
  summary: z.string().max(600).describe("Neutral, factual summary in your own words. No numbers that are not in the evidence."),
  countries: z.array(z.string()).max(10),
  companies: z.array(z.string()).max(15).describe("Node keys of companies present in the context"),
  industries: z.array(z.string()).max(10),
  commodities: z.array(z.string()).max(8),
  factors: z.array(z.string()).max(8),
  impacts: z.array(impactSchema).max(12),
  claims: z.array(claimSchema).max(12),
  unknowns: z.array(z.string().max(200)).max(6),
});
export type EventAnalysis = z.infer<typeof eventAnalysisSchema>;

/** Clasificación barata (modelo rápido) para eventos con clasificación determinista dudosa. */
export const eventClassificationSchema = z.strictObject({
  event_type: z.enum(EVENT_TYPES),
  secondary_types: z.array(z.enum(EVENT_TYPES)).max(3),
  market_relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type EventClassification = z.infer<typeof eventClassificationSchema>;

/** Respuesta de Ask MarketRadar. */
export const askAnswerSchema = z.strictObject({
  answer: z.string().max(1200).describe("Direct answer. Every figure must come from the evidence."),
  claims: z.array(claimSchema).max(12),
  unknowns: z.array(z.string().max(200)).max(6),
  follow_ups: z.array(z.string().max(160)).max(4),
});
export type AskAnswerOutput = z.infer<typeof askAnswerSchema>;

/** Ficha "What matters now" de una empresa. */
export const companyBriefSchema = z.strictObject({
  headline: z.string().max(200),
  themes: z.array(z.string().max(60)).max(6),
  potential_positives: z.array(claimSchema).max(5),
  potential_risks: z.array(claimSchema).max(5),
  claims: z.array(claimSchema).max(8),
  unknowns: z.array(z.string().max(200)).max(5),
});
export type CompanyBriefOutput = z.infer<typeof companyBriefSchema>;

type JsonSchema = Record<string, unknown>;

/**
 * JSON Schema compatible con el modo ESTRICTO de OpenAI Structured Outputs: todo objeto con
 * `additionalProperties: false` y todas sus propiedades en `required`; sin `$schema`.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema) as JsonSchema;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const obj: JsonSchema = {};
    for (const [k, v] of Object.entries(node as JsonSchema)) {
      if (k === "$schema") continue;
      obj[k] = visit(v);
    }
    if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
      obj.additionalProperties = false;
      obj.required = Object.keys(obj.properties as JsonSchema);
    }
    return obj;
  };
  return visit(raw) as JsonSchema;
}
