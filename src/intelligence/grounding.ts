import type { ClaimKind } from "@/domain/news";
import type { Claim, ContextPack, EvidenceKind } from "./evidence";

/**
 * VALIDADOR DE GROUNDING — la IA no puede inventar datos.
 *
 * Reglas (una afirmación que no las cumple se RECHAZA y, si procede, se sustituye por UNKNOWN):
 *   1. Debe citar al menos una evidencia existente en el context pack.
 *   2. El tipo de afirmación debe ser coherente con la evidencia citada:
 *        MARKET_DATA ⇒ evidencia MARKET_DATA · FACT ⇒ evidencia FACT · SOURCE_CLAIM ⇒ SOURCE_CLAIM o FACT.
 *   3. Toda CIFRA del texto (%, $, x, números con decimales) debe aparecer en la evidencia citada
 *      (tolerancia de redondeo). "NVIDIA revenue grew 42%" sin un 42 en la evidencia ⇒ rechazada.
 *   4. Una afirmación AI_INTERPRETATION/INFERENCE no puede contener cifras que no estén en su evidencia.
 */
export interface Rejection {
  claim: Claim;
  reason: string;
}

export interface GroundingReport {
  accepted: Claim[];
  rejected: Rejection[];
  /** Fracción de afirmaciones aceptadas. */
  groundedRatio: number;
}

const COMPATIBLE: Record<Exclude<ClaimKind, "UNKNOWN">, EvidenceKind[] | "any"> = {
  MARKET_DATA: ["MARKET_DATA"],
  FACT: ["FACT"],
  SOURCE_CLAIM: ["SOURCE_CLAIM", "FACT"],
  INFERENCE: "any",
  AI_INTERPRETATION: "any",
};

/** Cifras de un texto: "−6.1%", "+2.8 %", "$3.2 billion", "1.7x", "42", "0.35". Ignora años y fechas. */
export function extractNumbers(text: string): number[] {
  const cleaned = text
    .replace(/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(Q[1-4]|H[12]|FY\d{2,4}|[0-9]{1,2}(?:st|nd|rd|th))\b/gi, " ")
    .replace(/\b(1D|1W|1M|3M|6M|YTD|1Y|3Y|5Y|52[- ]week|10-year|2-year|30-year|S&P 500|RSI ?14|SMA ?\d+|EMA ?\d+|ATR ?14|Form \d+-?K|Item \d\.\d{2}|8-K|10-K|10-Q|Nasdaq-100|Russell 2000)\b/gi, " ");
  const out: number[] = [];
  for (const m of cleaned.matchAll(/[-−+]?\$?\d+(?:[.,]\d+)*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/[−]/g, "-").replace(/[$+]/g, "").replace(/,(?=\d{3}\b)/g, "");
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

function matches(n: number, candidates: readonly number[]): boolean {
  return candidates.some((c) => {
    const a = Math.abs(c);
    if (a === n) return true;
    // Tolerancia: redondeo a 1 decimal (0.051), o 1 % relativo para cifras grandes.
    return Math.abs(a - n) <= Math.max(0.051, a * 0.01);
  });
}

export function validateClaims(claims: readonly Claim[], pack: ContextPack): GroundingReport {
  const accepted: Claim[] = [];
  const rejected: Rejection[] = [];
  for (const claim of claims) {
    if (claim.kind === "UNKNOWN") {
      accepted.push(claim);
      continue;
    }
    const cited = claim.evidenceIds.map((id) => pack.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (cited.length === 0) {
      rejected.push({ claim, reason: claim.evidenceIds.length ? `cites unknown evidence (${claim.evidenceIds.join(", ")})` : "no evidence cited" });
      continue;
    }
    const allowed = COMPATIBLE[claim.kind];
    if (allowed !== "any" && !cited.some((e) => allowed.includes(e.kind))) {
      rejected.push({ claim, reason: `${claim.kind} claim must cite ${allowed.join("/")} evidence` });
      continue;
    }
    const available = cited.flatMap((e) => [...e.values, ...extractNumbers(e.text)]);
    const ungrounded = extractNumbers(claim.text).filter((n) => !matches(n, available));
    if (ungrounded.length) {
      rejected.push({ claim, reason: `number(s) not present in cited evidence: ${ungrounded.join(", ")}` });
      continue;
    }
    accepted.push(claim);
  }
  return { accepted, rejected, groundedRatio: claims.length ? accepted.length / claims.length : 1 };
}
