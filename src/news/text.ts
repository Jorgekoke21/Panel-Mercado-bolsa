import { createHash } from "node:crypto";

/**
 * Utilidades de texto del News Engine: normalización de titulares, tokens para clustering, hashes y
 * una detección de idioma mínima (solo si la fuente no la declara).
 */

export function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

/** Quita acentos y pasa a minúsculas (para comparar, nunca para mostrar). */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanText(value: string): string {
  return stripTags(decodeEntities(decodeEntities(value))).replace(/[​­]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Titular sin el sufijo del editor: "Trump Proposed Weapon Sales To Xi | News Radio 610" ⇒
 * "Trump Proposed Weapon Sales To Xi". Solo se corta un sufijo corto tras " | ", " - " o " — ".
 */
export function stripPublisherSuffix(title: string): string {
  let out = title.trim();
  for (let i = 0; i < 2; i++) {
    const match = /^(.{20,}?)\s+(?:\||-|–|—|::)\s+([^|–—]{2,45})$/.exec(out);
    if (!match?.[1] || !match[2]) break;
    const suffix = match[2].trim();
    // Un sufijo de editor es corto y no parece una frase (pocas palabras, sin verbo típico de titular).
    if (suffix.split(/\s+/).length > 6) break;
    out = match[1].trim();
  }
  return out;
}

/** Titular normalizado para detectar republicaciones (mismo texto en distintos sitios). */
export function normalizeTitle(title: string): string {
  return fold(stripPublisherSuffix(cleanText(title)))
    .replace(/[“”"'’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}%$.]+/gu, " ")
    .replace(/\s\.|\.\s|\.$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those into over under after before about amid " +
    "than then so not no up down out off new says said say will would could should may might can has have had do does did just more most less least also " +
    "how what why when where who which while s vs via per report reports reported update live latest today week year years day days news " +
    // es
    "el la los las un una unos unas y o de del al en por para con sin sobre que se su sus es son fue como mas más ya este esta estos estas lo " +
    // fr
    "le les des du un une et ou en au aux pour par sur avec dans est sont qui que ce cette ces se sa son ses plus " +
    // de
    "der die das den dem des ein eine einer und oder mit von zu im in am auf für ist sind wird werden nach bei aus über nicht auch " +
    // it/pt
    "il lo gli di da con per che non sono della delle dei o os as um uma com não"
  ).split(/\s+/),
);

/** Sufijos ingleses frecuentes (stemming ligero para que "tariffs" ≈ "tariff"). */
function stem(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith("ies") && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 6) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 5 && /(ch|sh|x|ss)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Tokens de contenido de un titular (sin stopwords, con stemming ligero; números conservados). */
export function contentTokens(title: string): string[] {
  const tokens = normalizeTitle(title)
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
  return [...new Set(tokens)];
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const t of new Set(a)) if (setB.has(t)) inter++;
  return inter / (new Set([...a, ...b]).size || 1);
}

/** Coeficiente de solapamiento: |A∩B| / min(|A|,|B|) (útil cuando un conjunto es mucho menor). */
export function overlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const t of new Set(a)) if (setB.has(t)) inter++;
  return inter / Math.min(new Set(a).size, setB.size);
}

const LANGUAGE_HINTS: Record<string, RegExp> = {
  es: /\b(el|los|las|del|una|para|por|con|según|sobre|más|años)\b/g,
  fr: /\b(les|des|une|pour|avec|dans|sur|selon|plus|aux)\b/g,
  de: /\b(der|die|das|und|mit|für|auf|nicht|eine|über|wird)\b/g,
  it: /\b(gli|della|delle|per|con|sono|dopo|anche|nel)\b/g,
  pt: /\b(os|das|dos|uma|para|com|não|após|pelo)\b/g,
  en: /\b(the|and|for|with|from|after|over|says|will|its|to)\b/g,
};

/** Idioma aproximado por palabras funcionales (solo como respaldo). */
export function guessLanguage(text: string): string | null {
  const lower = ` ${fold(text)} `;
  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, re] of Object.entries(LANGUAGE_HINTS)) {
    const count = lower.match(re)?.length ?? 0;
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return bestCount >= 1 ? best : null;
}

/** Nombres de idioma de GDELT ⇒ ISO 639-1. */
const LANGUAGE_NAMES: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", chinese: "zh", japanese: "ja", korean: "ko",
  russian: "ru", arabic: "ar", dutch: "nl", turkish: "tr", hindi: "hi", indonesian: "id", polish: "pl", swedish: "sv", ukrainian: "uk", hebrew: "he",
};

export function languageCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(v)) return v;
  if (/^[a-z]{2}-/.test(v)) return v.slice(0, 2);
  return LANGUAGE_NAMES[v] ?? null;
}

/** Fracción de letras en mayúsculas (titulares en MAYÚSCULAS desactivan la detección de tickers sueltos). */
export function upperRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return 0;
  return letters.replace(/[^A-Z]/g, "").length / letters.length;
}
