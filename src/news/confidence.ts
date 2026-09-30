import type { ConfidenceBreakdown, EntityLink, SourceTier } from "@/domain/news";
import { TIER_QUALITY } from "./publishers";

/**
 * CONFIANZA de un evento: "¿cuánto podemos fiarnos de que este hecho ocurrió tal como lo
 * describimos y de que las entidades son las correctas?". NO es una probabilidad de movimiento de
 * precio. Media ponderada de 7 componentes explicables (0–1):
 *
 *   sourceQuality   0.20  mejor fuente del evento (oficial 1 · referencia 0.85 · establecida 0.65 · sin clasificar 0.4)
 *   corroboration   0.20  informes independientes (editores distintos, redacción propia; la sindicación no cuenta):
 *                         1 ⇒ 0.3 · 2 ⇒ 0.55 · 3 ⇒ 0.7 · 4 ⇒ 0.8 · ≥5 ⇒ 0.9 · fuente oficial ⇒ 1
 *   entityMatch     0.15  confianza media de las 3 mejores entidades DIRECTAS específicas (0.5 si solo hay países)
 *   recency         0.10  e^(−horas desde el último artículo / 72)
 *   classification  0.10  certeza media del tipo de evento (metadatos de la fuente ⇒ ≥ 0.9)
 *   agreement       0.10  1 − 2·(proporción minoritaria de titulares con tono opuesto); ×0.6 si hay desmentidos
 *   eventCertainty  0.15  fuente primaria/oficial 1 · mayoría confirmada 0.8 · solo "según fuentes" 0.45
 */
export const CONFIDENCE_WEIGHTS = {
  sourceQuality: 0.2,
  corroboration: 0.2,
  entityMatch: 0.15,
  recency: 0.1,
  classification: 0.1,
  agreement: 0.1,
  eventCertainty: 0.15,
} as const;

export interface ConfidenceInput {
  articles: readonly {
    tier: SourceTier;
    publisherKey: string;
    typeCertainty: number;
    polarity: -1 | 0 | 1;
    unconfirmed: boolean;
    denial: boolean;
    primary: boolean;
  }[];
  independentSources: number;
  hasOfficialSource: boolean;
  links: readonly EntityLink[];
  lastSeenAt: string;
  now: Date;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function corroborationScore(independent: number, official: boolean): number {
  if (official) return 1;
  if (independent <= 0) return 0;
  return [0.3, 0.55, 0.7, 0.8][independent - 1] ?? 0.9;
}

export function computeConfidence(input: ConfidenceInput): ConfidenceBreakdown {
  const notes: string[] = [];
  const bestTier = input.articles.reduce<SourceTier>((best, a) => (a.tier < best ? a.tier : best), 4);
  const sourceQuality = TIER_QUALITY[bestTier];
  notes.push(`Best source tier ${bestTier}`);

  const corroboration = corroborationScore(input.independentSources, input.hasOfficialSource);
  notes.push(input.hasOfficialSource ? "Official primary source" : `${input.independentSources} independent report(s)`);

  const direct = input.links.filter((l) => l.relation === "DIRECT");
  const specific = direct.filter((l) => !l.node.startsWith("country:") && !l.node.startsWith("index:")).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const entityMatch = specific.length ? specific.reduce((s, l) => s + l.confidence, 0) / specific.length : direct.length ? 0.5 : 0.2;
  notes.push(specific.length ? `${specific.length} specific entities matched` : "No specific entity matched");

  const ageHours = Math.max(0, (input.now.getTime() - Date.parse(input.lastSeenAt)) / 3_600_000);
  const recency = Math.exp(-ageHours / 72);

  const classification = input.articles.length ? input.articles.reduce((s, a) => s + a.typeCertainty, 0) / input.articles.length : 0;

  const pos = input.articles.filter((a) => a.polarity > 0).length;
  const neg = input.articles.filter((a) => a.polarity < 0).length;
  const minority = pos + neg > 0 ? Math.min(pos, neg) / (pos + neg) : 0;
  const denials = input.articles.some((a) => a.denial);
  let agreement = 1 - 2 * minority;
  if (denials) agreement *= 0.6;
  if (minority > 0) notes.push(`Sources disagree (${pos} positive vs ${neg} negative headlines)`);
  if (denials) notes.push("A denial was reported");

  const confirmed = input.articles.filter((a) => !a.unconfirmed).length;
  const eventCertainty = input.hasOfficialSource || input.articles.some((a) => a.primary) ? 1 : confirmed === 0 ? 0.45 : confirmed / input.articles.length >= 0.5 ? 0.8 : 0.6;
  if (confirmed === 0) notes.push("Only unconfirmed reports (unnamed sources)");

  const w = CONFIDENCE_WEIGHTS;
  const score =
    w.sourceQuality * sourceQuality +
    w.corroboration * corroboration +
    w.entityMatch * entityMatch +
    w.recency * recency +
    w.classification * classification +
    w.agreement * agreement +
    w.eventCertainty * eventCertainty;

  return {
    sourceQuality: round(sourceQuality),
    corroboration: round(corroboration),
    entityMatch: round(entityMatch),
    recency: round(recency),
    classification: round(classification),
    agreement: round(agreement),
    eventCertainty: round(eventCertainty),
    score: round(score),
    notes,
  };
}

export function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  return score >= 0.72 ? "High" : score >= 0.5 ? "Medium" : "Low";
}

/**
 * IMPORTANCIA (ranking de Top Events, 0–1): relevancia del tipo, amplitud de la cobertura, confianza,
 * peso de mercado de las empresas implicadas y alcance (oficial / de mercado).
 */
export function computeImportance(input: { typeWeight: number; independentSources: number; confidence: number; marketWeight: number; official: boolean; marketWide: boolean; sourceQuality: number }): number {
  const breadth = Math.min(1, Math.log2(1 + input.independentSources) / Math.log2(9));
  // Alcance: los eventos de mercado (macro) puntúan completo; una fuente oficial corporativa (8-K) solo parcialmente,
  // para que los 8-K rutinarios no desplacen a los eventos amplios.
  const scope = input.marketWide ? 1 : input.official ? 0.4 : 0;
  const v = 0.3 * input.typeWeight + 0.3 * breadth + 0.2 * input.confidence + 0.1 * input.marketWeight + 0.1 * scope;
  // Un único medio sin clasificar no puede encabezar Top Events: la calidad de la mejor fuente modula el total.
  const quality = 0.55 + 0.45 * input.sourceQuality;
  return round(Math.min(1, v * quality));
}

/** Recalcula el componente de recencia (y la puntuación) en el momento de mostrar el evento. */
export function refreshConfidence(stored: ConfidenceBreakdown, lastSeenAt: string, now: Date): ConfidenceBreakdown {
  if (!stored || typeof stored.score !== "number") {
    return { sourceQuality: 0, corroboration: 0, entityMatch: 0, recency: 0, classification: 0, agreement: 0, eventCertainty: 0, score: 0, notes: ["Confidence not computed"] };
  }
  const ageHours = Math.max(0, (now.getTime() - Date.parse(lastSeenAt)) / 3_600_000);
  const recency = round(Math.exp(-ageHours / 72));
  const w = CONFIDENCE_WEIGHTS;
  const score =
    w.sourceQuality * stored.sourceQuality +
    w.corroboration * stored.corroboration +
    w.entityMatch * stored.entityMatch +
    w.recency * recency +
    w.classification * stored.classification +
    w.agreement * stored.agreement +
    w.eventCertainty * (stored.eventCertainty ?? 0.8);
  return { ...stored, recency, score: round(score) };
}
