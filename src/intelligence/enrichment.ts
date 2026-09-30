import type { EventSource, EventType, NewsEvent } from "@/domain/news";
import { eventTypeDef } from "@/news/taxonomy";
import { type Claim, ContextPack } from "./evidence";
import type { EventAnalysis } from "./schemas";

/**
 * ENRIQUECIMIENTO CON IA de eventos (opcional, de pago). Estrategia de coste:
 *
 *   ingesta → filtros deterministas → dedup → clustering → relevancia → (solo entonces) IA
 *
 *   * Nunca "1 artículo = 1 llamada": la unidad es el EVENTO ya agrupado.
 *   * FAST (modelo barato): re-clasificación de eventos relevantes con clasificación dudosa.
 *   * DEEP (modelo de análisis): solo los eventos más importantes (corroborados u oficiales, no rutinarios).
 *   * Caché: no se repite si no cambian entrada + contexto + versión del prompt + modelo (un evento que no
 *     recibe artículos nuevos no se vuelve a analizar).
 */
export interface EnrichmentPlan {
  deep: string[];
  fast: string[];
  skipped: { id: string; reason: string }[];
}

const ROUTINE: EventType[] = ["MANAGEMENT_CHANGE", "CAPITAL_MARKETS", "CONTRACT_PARTNERSHIP", "ANALYST_RATING", "OTHER"];

export function planEnrichment(events: readonly NewsEvent[], options: { maxDeep: number; maxFast: number; minImportance?: number }): EnrichmentPlan {
  const minImportance = options.minImportance ?? 0.55;
  const sorted = [...events].sort((a, b) => b.importance - a.importance);
  const deep: string[] = [];
  const fast: string[] = [];
  const skipped: EnrichmentPlan["skipped"] = [];
  for (const e of sorted) {
    if (e.status === "stale") {
      skipped.push({ id: e.id, reason: "stale event" });
      continue;
    }
    const corroborated = e.independentSources >= 2 || e.hasOfficialSource;
    if (deep.length < options.maxDeep && e.importance >= minImportance && corroborated && !ROUTINE.includes(e.type)) {
      deep.push(e.id);
      continue;
    }
    if (fast.length < options.maxFast && e.importance >= minImportance - 0.1 && e.confidence.classification < 0.5) {
      fast.push(e.id);
      continue;
    }
    skipped.push({ id: e.id, reason: e.importance < minImportance ? "below importance threshold" : !corroborated ? "single unofficial source" : ROUTINE.includes(e.type) ? "routine corporate event" : "budget cap" });
  }
  return { deep, fast, skipped };
}

/** Context pack de un evento: fuentes (atribuidas), entidades y relaciones del motor determinista. */
export function eventContextPack(event: NewsEvent, sources: readonly EventSource[], label: (node: string) => string): ContextPack {
  const pack = new ContextPack();
  for (const s of sources.slice(0, 12)) {
    pack.add({ id: `src:${s.articleId}`, kind: s.tier === 1 ? "FACT" : "SOURCE_CLAIM", text: `${s.publisher} (${s.publishedAt.slice(0, 10)}): "${s.title}"${s.snippet ? ` — ${s.snippet}` : ""}`, values: [], source: s.publisher, url: s.url, asOf: s.publishedAt });
  }
  for (const l of event.links.slice(0, 20)) {
    pack.add({ id: `entity:${l.node}`, kind: l.relation === "DIRECT" ? "SOURCE_CLAIM" : "INFERENCE", text: `${label(l.node)} [${l.node}] — ${l.relation} (${l.method}): ${l.evidence}`, values: [], source: "MarketRadar entity resolution" });
  }
  for (const i of event.impacts.slice(0, 12)) {
    pack.add({ id: `impact:${i.target}`, kind: "INFERENCE", text: `${label(i.target)} [${i.target}]: ${i.direction} via ${i.mechanism} (${i.channel}, ${i.horizon}) — ${i.rationale}`, values: [], source: "MarketRadar relationship graph" });
  }
  pack.add({ id: "event:meta", kind: "INFERENCE", text: `Deterministic classification: ${eventTypeDef(event.type).label}; ${event.independentSources} independent source(s); ${event.hasOfficialSource ? "official source present" : "no official source"}${event.contradictory ? "; sources disagree" : ""}${event.unconfirmed ? "; unconfirmed reports" : ""}`, values: [event.independentSources], source: "MarketRadar News Engine" });
  return pack;
}

export function analysisClaims(a: EventAnalysis): Claim[] {
  return [...a.claims.map((c) => ({ text: c.text, kind: c.kind, evidenceIds: c.evidence_ids })), { text: a.summary, kind: "AI_INTERPRETATION" as const, evidenceIds: a.claims.flatMap((c) => c.evidence_ids).slice(0, 4) }];
}

/**
 * Impactos de la IA aceptables: destino presente en el contexto (no inventa entidades) y evidencia citada existente.
 */
export function acceptedAiImpacts(a: EventAnalysis, pack: ContextPack, allowedTargets: ReadonlySet<string>) {
  return a.impacts.filter((i) => allowedTargets.has(i.target) && i.evidence_ids.length > 0 && i.evidence_ids.every((id) => pack.has(id)));
}
