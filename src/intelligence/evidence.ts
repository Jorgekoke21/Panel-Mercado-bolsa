import type { ClaimKind } from "@/domain/news";

/**
 * EVIDENCIA y CONTEXTO (grounding).
 *
 * Toda afirmación que MarketRadar muestra — la redacte el motor determinista o un modelo de IA — debe
 * citar evidencia de un "context pack": piezas pequeñas, tipadas y con procedencia, recuperadas de
 * NUESTRA base de datos. Nunca se envía la base de datos entera al modelo: solo este paquete.
 *
 *   MARKET_DATA   calculado por MarketRadar (precios Alpaca, fundamentales SEC, índices sintéticos)
 *   FACT          hecho de una fuente primaria oficial (8-K en EDGAR, comunicado de un banco central)
 *   SOURCE_CLAIM  lo que publica un medio (se atribuye)
 *   INFERENCE     relación del grafo/reglas de MarketRadar
 */
export type EvidenceKind = Exclude<ClaimKind, "AI_INTERPRETATION" | "UNKNOWN">;

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  /** Texto breve y factual (el que se envía al modelo). */
  text: string;
  /** Números que contiene la evidencia (para validar cifras citadas). */
  values: number[];
  source: string;
  /** BCP-47 language of the original material when the claim quotes a source. */
  sourceLanguage?: string;
  url?: string;
  asOf?: string;
}

export interface Claim {
  text: string;
  kind: ClaimKind;
  evidenceIds: string[];
  /** Language code of the preserved source title/body, where known. */
  sourceLanguage?: string;
}

export class ContextPack {
  private readonly items = new Map<string, EvidenceItem>();

  add(item: EvidenceItem): string {
    if (!this.items.has(item.id)) this.items.set(item.id, item);
    return item.id;
  }

  get(id: string): EvidenceItem | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  all(): EvidenceItem[] {
    return [...this.items.values()];
  }

  get size(): number {
    return this.items.size;
  }

  /** Representación compacta para el modelo (sin campos internos). */
  toPrompt(): { id: string; kind: EvidenceKind; text: string; source: string; as_of: string | null }[] {
    return this.all().map((e) => ({ id: e.id, kind: e.kind, text: e.text, source: e.source, as_of: e.asOf ?? null }));
  }
}

/** Formatea un rendimiento en % con signo (fracción ⇒ "+2.8%"). */
export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const v = value * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function pctValue(value: number, digits = 1): number {
  return Math.round(value * 100 * 10 ** digits) / 10 ** digits;
}
