import type { EventType } from "@/domain/news";
import { EVENT_TYPE_DEFS } from "./taxonomy";
import { fold } from "./text";

/**
 * Clasificador determinista de eventos por palabras clave ponderadas.
 *
 *   puntuación(tipo) = Σ coincidencias en titular × 2 + coincidencias en snippet × 1
 *                      (palabras débiles ×0.5) + pistas de la fuente × 4
 *
 * Tipo principal = mayor puntuación (MARKET_MOVE solo gana si no hay nada más específico). Tipos
 * secundarios = los que alcanzan ≥ 50 % del principal. La certeza es el margen relativo entre el
 * primero y el segundo, saturado por la puntuación absoluta (un solo término débil ⇒ certeza baja).
 */
interface Compiled {
  type: EventType;
  strong: RegExp | null;
  weak: RegExp | null;
}

function compile(words: readonly string[] | undefined): RegExp | null {
  if (!words || words.length === 0) return null;
  // Límites de palabra Unicode: (?<![\p{L}\p{N}]) … (?![\p{L}\p{N}])
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map((w) => fold(w)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

const COMPILED: Compiled[] = EVENT_TYPE_DEFS.filter((d) => d.type !== "OTHER").map((d) => ({ type: d.type, strong: compile(d.keywords), weak: compile(d.weakKeywords) }));

function count(re: RegExp | null, text: string): number {
  if (!re || !text) return 0;
  re.lastIndex = 0;
  return text.match(re)?.length ?? 0;
}

export interface Classification {
  type: EventType;
  secondaryTypes: EventType[];
  certainty: number;
  scores: Partial<Record<EventType, number>>;
}

export function classifyText(title: string, snippet: string | null | undefined, hintTypes: readonly EventType[] = [], entityTypes: readonly EventType[] = []): Classification {
  const t = fold(title);
  const s = fold(snippet ?? "");
  const scores: Partial<Record<EventType, number>> = {};
  for (const c of COMPILED) {
    const score = count(c.strong, t) * 2 + count(c.weak, t) * 0.75 + count(c.strong, s) + count(c.weak, s) * 0.25;
    if (score > 0) scores[c.type] = score;
  }
  for (const h of hintTypes) scores[h] = (scores[h] ?? 0) + 4;
  // Entidades detectadas (materia prima energética ⇒ ENERGY_MARKETS…): refuerzo moderado.
  for (const h of entityTypes) scores[h] = (scores[h] ?? 0) + 1.5;

  const ranked = (Object.entries(scores) as [EventType, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // MARKET_MOVE es genérico: cede ante cualquier tipo específico con puntuación comparable.
  const specific = ranked.filter(([type]) => type !== "MARKET_MOVE");
  const top = specific[0] && specific[0][1] >= (scores.MARKET_MOVE ?? 0) * 0.5 ? specific[0] : ranked[0];
  if (!top) return { type: "OTHER", secondaryTypes: [], certainty: 0, scores };
  const [type, topScore] = top;
  // Solo palabras débiles (p. ej. una única "interest rate" o "attack"): no basta para clasificar.
  if (topScore < 1 && hintTypes.length === 0) return { type: "OTHER", secondaryTypes: ranked.slice(0, 2).map(([t2]) => t2), certainty: 0.1, scores };
  const others = ranked.filter(([t2]) => t2 !== type);
  const second = others[0]?.[1] ?? 0;
  const secondaryTypes = others.filter(([, v]) => v >= topScore * 0.5).map(([t2]) => t2).slice(0, 3);
  const margin = topScore > 0 ? (topScore - second) / topScore : 0;
  const strength = Math.min(1, topScore / 4);
  const certainty = Math.round((0.5 * margin + 0.5 * strength) * 100) / 100;
  return { type, secondaryTypes, certainty, scores };
}
