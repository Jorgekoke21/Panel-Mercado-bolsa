import type { Move } from "@/knowledge/types";
import { fold } from "./text";

/**
 * Léxico financiero mínimo (en + es/fr/de) para:
 *   * polaridad del titular respecto a su sujeto (beats / misses, approves / rejects…),
 *   * dirección del movimiento de un factor o materia prima mencionado ("oil prices surge"),
 *   * marcas de incertidumbre ("reportedly") y desmentidos ("denies").
 * No es análisis de sentimiento: solo señales explícitas en el texto.
 */
const words = (list: string) => new RegExp(`(?<![\\p{L}])(?:${list})(?![\\p{L}])`, "u");

const POSITIVE = words(
  "beats?|beat estimates|tops|surges?|surged|surging|soars?|soared|soaring|jumps?|jumped|jumping|rallying|climbing|rising|gaining|rall(?:y|ies|ied)|gains?|gained|climbs?|climbed|rises|rose|record high|all-time high|raises|raised|upgrades?|upgraded|approves?|approved|approval|wins|won|boosts?|boosted|strong(?:er)?|exceeds?|beats expectations|outperform\\w*|expands?|expanded|accelerat\\w*|rebound\\w*|recover\\w*|dispara|sube|suben|récord|mejora|steigt|steigen|hausse|bondit",
);
const NEGATIVE = words(
  "miss(?:es|ed)?|plunges?|plunged|plunging|slumps?|slumped|slumping|tumbles?|tumbled|tumbling|falls?|fell|falling|sinking|sliding|dropping|drops?|dropped|declines?|declined|sinks?|sank|slides?|slid|downgrades?|downgraded|probe|lawsuit|sued|recalls?|recalled|bans?|banned|halts?|halted|delays?|delayed|warns?|warned|warning|weak(?:er|ness)?|loss(?:es)?|layoffs?|job cuts|fined|rejects?|rejected|blocks?|blocked|crash(?:es|ed)?|plummet\\w*|slashes|slashed|cuts (?:its )?(?:forecast|outlook|guidance)|lowers|lowered|shortfall|default\\w*|bankrupt\\w*|investigation|cae|caen|desploma|baja|pierde|fällt|fallen|bricht ein|chute|recule",
);

export const UNCONFIRMED = /\b(reportedly|report says|sources? (?:say|said|familiar)|people familiar|according to (?:people|sources|a person)|is said to|are said to|considering|weighs|in talks|mulls|explores?|rumou?rs?|unconfirmed|could)\b/i;
export const DENIAL = /\b(denies|denied|deny|refutes?|refuted|false report|dismiss(?:es|ed) reports?|no truth|disputes?|disputed|desmiente|dementi|dément)\b/i;
export const OPINION = /\b(opinion|column|commentary|analysis|explainer|why you should|should you buy|is it time to|stocks? to buy|\d+ stocks?|here's why|what to know|how to|podcast|video|a practical plan)\b|[?]$|^(has|have|is|are|should|can|could|will|would|does|do|did|what|which|who)\b/i;

/** Movimiento de acciones con explicación ("Why Are Carnival Shares Soaring Today"): no es opinión. */
export const MOVE_REPORT = /\b(shares?|stock)\b.*\b(up|down|soar\w*|surg\w*|jump\w*|climb\w*|ris\w*|fall\w*|plung\w*|slid\w*|sink\w*|tumbl\w*|drop\w*|gain\w*|slump\w*|rally\w*)\b/i;

/**
 * Ruido financiero automatizado: movimientos de carteras institucionales (13F), compras/ventas de
 * acciones por fondos, "stocks to watch". No son hechos de la empresa.
 */
export const HOLDINGS_NOISE = /\b(shares? (sold|bought|acquired|purchased) by|(position|stake|holdings?) in .{2,80} (raised|lowered|trimmed|boosted|cut|lifted|increased|decreased|reduced) by|(acquires|takes|buys|sells|trims|boosts|raises|lowers|cuts) (new )?(position|stake|holdings?) in|has \$?[\d.,]+ (million|thousand)? ?(stock )?(position|holdings) in|\d[\d,]* shares of|sells \d[\d,]* shares|buys \d[\d,]* shares|insider (selling|buying|sells|buys)|short interest (update|in))\b/i;

export function polarityOf(title: string): -1 | 0 | 1 {
  const t = fold(title);
  const pos = POSITIVE.test(t);
  const neg = NEGATIVE.test(t);
  if (pos && !neg) return 1;
  if (neg && !pos) return -1;
  return 0;
}

const UP = /(?<![\p{L}])(surge[sd]?|soar(?:s|ed)?|jump(?:s|ed)?|spike[sd]?|rall(?:y|ies|ied)|rise[sn]?|rising|rose|climb(?:s|ed)?|gain(?:s|ed)?|higher|record|hike[sd]?|hikes|raise[sd]?|increase[sd]?|accelerat\w*|hotter|tighten\w*|strengthen\w*|stronger|boom\w*|shortage\w*|cut(?:s)? (?:output|production|supply)|disrupt\w*|sube|suben|dispara|alza|steigt|hausse)(?![\p{L}])/u;
const DOWN = /(?<![\p{L}])(plunge[sd]?|slump(?:s|ed)?|tumble[sd]?|fall(?:s|ing)?|fell|drop(?:s|ped)?|slide[sd]?|slid|sink(?:s)?|sank|lower|decline[sd]?|cut(?:s|ting)?|ease[sd]?|eases|easing|cool(?:s|ed|ing)?|slow(?:s|ed|ing)?|weaken\w*|weaker|glut|surplus|oversuppl\w*|baja|bajan|cae|caen|recorte|fällt|sinkt|baisse)(?![\p{L}])/u;
const FLAT = /(?<![\p{L}])(hold(?:s)? (?:rates )?steady|holds rates|keeps? rates unchanged|leaves? rates unchanged|unchanged|pause[sd]?|on hold|mantiene)(?![\p{L}])/u;

/**
 * Dirección del movimiento de un nodo mencionado: busca verbos de movimiento en una ventana de ±6
 * palabras alrededor de la mención. Si no hay señal ⇒ "unknown" (nunca se adivina).
 */
const PRICE_HEAD = /^(price|prices|futures|benchmark|contracts?|rates?|yields?|index|market|markets|spot)$/;
const LINK_WORDS = /^(to|as|on|at|after|amid|near|hits?|holds?|steadies|extends?|edges?|was|is|are|were|has|have|had|could|may|might|will|would|and|but|while|despite|for|in)$/;

export function moveNear(text: string, start: number, end: number): Move {
  const folded = fold(text);
  const before = folded.slice(0, start).split(/\s+/).slice(-6).join(" ");
  let after = folded.slice(end).split(/\s+/).slice(0, 7).join(" ");
  // "US strategic oil reserve plunges": el núcleo del sintagma es "reserve", no el precio del petróleo.
  // Si tras la mención viene otro sustantivo (ni verbo de movimiento, ni palabra de precio, ni enlace), solo cuenta
  // un adjetivo inmediatamente anterior ("lower oil", "rising yields").
  const next = /^[\s,:;'’-]*([\p{L}]+)/u.exec(folded.slice(end))?.[1];
  if (next && !UP.test(next) && !DOWN.test(next) && !PRICE_HEAD.test(next) && !LINK_WORDS.test(next) && !FLAT.test(next)) {
    const adj = folded.slice(0, start).split(/\s+/).slice(-2).join(" ");
    after = "";
    if (UP.test(adj) && !DOWN.test(adj)) return "up";
    if (DOWN.test(adj) && !UP.test(adj)) return "down";
    return "unknown";
  }
  if (next && PRICE_HEAD.test(next)) after = folded.slice(end).split(/\s+/).slice(0, 8).join(" ");
  const window = `${before} ${after}`;
  if (FLAT.test(window)) return "flat";
  const up = UP.test(after) || UP.test(before);
  const down = DOWN.test(after) || DOWN.test(before);
  if (up && !down) return "up";
  if (down && !up) return "down";
  // Si hay ambos, manda el verbo más cercano después de la mención (estructura sujeto-verbo).
  if (up && down) {
    const upAt = after.search(UP);
    const downAt = after.search(DOWN);
    if (upAt >= 0 && (downAt < 0 || upAt < downAt)) return "up";
    if (downAt >= 0) return "down";
  }
  return "unknown";
}

/** Dirección de los tipos de interés en noticias de bancos centrales ("cuts rates" ⇒ down). */
export function rateMove(title: string): Move {
  const t = fold(title);
  if (/(hold|holds|holding|keeps?|leaves?|pause[sd]?|unchanged|steady|on hold|mantiene)/.test(t) && /\brates?\b|interest|tipos|zins/.test(t)) return "flat";
  if (/\b(rate cuts?|cuts? (?:interest )?rates|lowers? (?:interest )?rates|easing|recorta|senkt|baisse des taux)\b/.test(t)) return "down";
  if (/\b(rate hikes?|hikes? (?:interest )?rates|raises? (?:interest )?rates|tightening|sube los tipos|erhöht|hausse des taux)\b/.test(t)) return "up";
  return "unknown";
}
