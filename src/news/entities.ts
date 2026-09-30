import type { EntityLink, LinkMethod } from "@/domain/news";
import { COMMODITIES, COMMODITY_CONTEXT } from "@/knowledge/commodities";
import { COUNTRIES } from "@/knowledge/countries";
import { EXTERNAL_COMPANIES } from "@/knowledge/external-companies";
import { FACTORS } from "@/knowledge/factors";
import type { NodeKey } from "@/knowledge/types";
import type { Universe, UniverseCompany } from "@/knowledge/universe";
import { ALIAS_EXCLUSIONS, AMBIGUOUS_WORDS, BARE_TICKER_BLOCK, COMPANY_ALIAS_OVERRIDES, COMPANY_CONTEXT, DESCRIPTOR_SUFFIXES, GENERIC_NAME_SUFFIXES } from "./aliases";
import { GROUP_KEYWORDS, INSTITUTIONS, NAMED_COMPANY_GROUPS } from "./industry-keywords";
import { fold, upperRatio } from "./text";

/**
 * Resolución de entidades DIRECTAS (lo que el texto menciona explícitamente).
 *
 * Algoritmo:
 *   1. Tokeniza el texto conservando mayúsculas y la separación entre tokens.
 *   2. Busca todos los alias del gazetteer (trie por primer token) — empresas, países, instituciones,
 *      materias primas, factores, empresas externas, industrias e índices.
 *   3. Aplica reglas: mayúsculas (nombres propios), contexto obligatorio para alias ambiguos,
 *      exclusiones por homónimos, contexto de mercado para materias primas ("gold medal" ≠ oro).
 *   4. Selección voraz sin solapes: gana la coincidencia más larga y luego la más fiable
 *      ("American Express" gana a "American"; "Taiwan Semiconductor" gana a "Taiwan").
 *   5. Tickers: $CASHTAG, "(NYSE: XOM)", "(NVDA)" y ticker suelto (≥3 letras, lista de bloqueo).
 *
 * Las relaciones INFERIDAS (clasificación, grafo) se calculan después, a nivel de evento.
 */
type CaseRule = "proper" | "exact" | "any";

interface Entry {
  tokens: string[];
  /** true = los tokens van pegados (sin espacio) en el alias: "AT&T", "U.S.". */
  joined: boolean[];
  nodes: NodeKey[];
  method: LinkMethod;
  confidence: number;
  caseRule: CaseRule;
  /** El alias necesita contexto (empresa ambigua ⇒ COMPANY_CONTEXT; materia prima ⇒ contexto de mercado). */
  context?: "company" | "commodity";
  exclusion?: RegExp;
  alias: string;
  /** Prioridad de desempate entre coincidencias de la misma longitud. */
  priority: number;
}

export interface Gazetteer {
  index: Map<string, Entry[]>;
  universe: Universe;
  tickers: Map<string, UniverseCompany>;
}

interface Token {
  text: string;
  folded: string;
  start: number;
  end: number;
  /** El token va pegado (sin espacio) al anterior. */
  joinedToPrev: boolean;
}

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let prevEnd = -1;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    const between = prevEnd >= 0 ? text.slice(prevEnd, start) : " ";
    out.push({ text: m[0], folded: fold(m[0]), start, end: start + m[0].length, joinedToPrev: prevEnd >= 0 && !/\s/.test(between) && between.length <= 2 });
    prevEnd = start + m[0].length;
  }
  return out;
}

function aliasShape(alias: string): { tokens: string[]; joined: boolean[] } {
  const toks = tokenize(alias);
  return { tokens: toks.map((t) => t.folded), joined: toks.map((t) => t.joinedToPrev) };
}

function caseRuleFor(alias: string, defaultRule: CaseRule): CaseRule {
  const letters = alias.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2 && letters === letters.toUpperCase() && alias.length <= 6) return "exact";
  return defaultRule;
}

function addEntry(index: Map<string, Entry[]>, alias: string, spec: Omit<Entry, "tokens" | "joined" | "alias" | "caseRule"> & { caseRule?: CaseRule }) {
  const { tokens, joined } = aliasShape(alias);
  const first = tokens[0];
  if (!first) return;
  const entry: Entry = { ...spec, tokens, joined, alias, caseRule: caseRuleFor(alias, spec.caseRule ?? "proper") };
  const list = index.get(first);
  if (list) list.push(entry);
  else index.set(first, [entry]);
}

/** Alias generados desde el nombre de la base: "Arista Networks" ⇒ ["Arista Networks", "Arista"]. */
export function generatedAliases(name: string): string[] {
  const cleaned = name.replace(/\s*\((?:The)\)\s*$/i, "").replace(/^The\s+/i, "").replace(/[–—]/g, "-").trim();
  const out = new Set<string>([cleaned]);
  let short = cleaned;
  for (let i = 0; i < 3; i++) short = short.replace(GENERIC_NAME_SUFFIXES, "").replace(/,$/, "").trim();
  if (short.length >= 3) out.add(short);
  const shorter = short.replace(DESCRIPTOR_SUFFIXES, "").trim();
  if (shorter.length >= 4 && shorter !== short) out.add(shorter);
  return [...out];
}

export function buildGazetteer(universe: Universe): Gazetteer {
  const index = new Map<string, Entry[]>();

  // Empresas del universo.
  for (const company of universe.companies) {
    const node: NodeKey = `company:${company.companyId}`;
    const override = company.tickers.map((t) => COMPANY_ALIAS_OVERRIDES[t]).find(Boolean) ?? {};
    const blocked = new Set((override.block ?? []).map(fold));
    const ambiguous = new Set((override.ambiguous ?? []).map(fold));
    const curated = new Set((override.add ?? []).map(fold));
    const brands = new Set((override.brands ?? []).map(fold));
    const aliases = new Set<string>([...generatedAliases(company.name), ...(override.add ?? []), ...(override.ambiguous ?? []), ...(override.brands ?? [])]);
    for (const alias of aliases) {
      const key = fold(alias);
      if (blocked.has(key)) continue;
      // Alias generados que son palabras comunes ("American", "General"): se descartan; solo los curados como ambiguos usan contexto.
      if (AMBIGUOUS_WORDS.has(key) && !curated.has(key) && !ambiguous.has(key)) continue;
      const single = !/\s/.test(alias.trim());
      const isAmbiguous = ambiguous.has(key);
      const isBrand = brands.has(key);
      addEntry(index, alias, {
        nodes: [node],
        method: isAmbiguous ? "alias_context" : "alias",
        confidence: isAmbiguous ? 0.65 : isBrand ? 0.7 : single ? 0.88 : 0.93,
        context: isAmbiguous ? "company" : undefined,
        exclusion: ALIAS_EXCLUSIONS[alias],
        priority: 3,
      });
    }
  }
  // Grupos con nombre ("Magnificent Seven").
  for (const [phrase, tickers] of Object.entries(NAMED_COMPANY_GROUPS)) {
    const nodes = tickers.map((t) => universe.byTicker.get(t)).filter((c): c is UniverseCompany => !!c).map((c) => `company:${c.companyId}` as NodeKey);
    if (nodes.length) addEntry(index, phrase, { nodes, method: "alias", confidence: 0.8, priority: 2 });
  }
  // Empresas externas (TSMC, ASML…).
  for (const ext of EXTERNAL_COMPANIES) {
    for (const alias of ext.aliases) addEntry(index, alias, { nodes: [`external:${ext.code}`], method: "alias", confidence: 0.9, priority: 3 });
  }
  // Instituciones (Fed, ECB, OPEC…).
  for (const inst of INSTITUTIONS) {
    for (const alias of inst.phrases) addEntry(index, alias, { nodes: [...inst.nodes], method: "alias", confidence: 0.85, caseRule: inst.caseSensitive ? "exact" : "any", priority: 2 });
  }
  // Países.
  for (const country of COUNTRIES) {
    for (const alias of country.aliases) addEntry(index, alias, { nodes: [`country:${country.code}`], method: "alias", confidence: 0.9, priority: 1 });
    for (const alias of country.weakAliases ?? []) addEntry(index, alias, { nodes: [`country:${country.code}`], method: "alias", confidence: 0.6, priority: 0 });
  }
  // Materias primas.
  for (const c of COMMODITIES) {
    const needsContext = new Set((c.contextRequired ?? []).map(fold));
    for (const alias of c.aliases) {
      addEntry(index, alias, {
        nodes: [`commodity:${c.code}`],
        method: "keyword",
        confidence: needsContext.has(fold(alias)) ? 0.7 : 0.85,
        caseRule: "any",
        context: needsContext.has(fold(alias)) ? "commodity" : undefined,
        exclusion: c.code === "crude_oil" ? /\b(olive|palm|vegetable|cooking|essential|motor|snake|coconut|fish|sesame|castor|cbd|hair) oils?\b/i : c.code === "gold" ? /\bgold (medal|medals|medalist|standard|card|cup|coast|rush)\b|golden|\b(wins?|won|winning|claims?|clinch\w*|individual|team|olympic)\s+(?:first\s+)?(?:individual\s+)?gold\b/i : undefined,
        priority: 1,
      });
    }
  }
  // Factores.
  for (const f of FACTORS) {
    for (const alias of f.aliases) addEntry(index, alias, { nodes: [`factor:${f.code}`], method: "keyword", confidence: 0.75, caseRule: "any", priority: 1 });
  }
  // Sectores, industrias e índices.
  for (const g of GROUP_KEYWORDS) {
    for (const alias of g.phrases) addEntry(index, alias, { nodes: [g.node], method: "keyword", confidence: g.confidence, caseRule: "any", exclusion: g.exclude, priority: 1 });
  }
  return { index, universe, tickers: universe.byTicker };
}

function caseOk(entry: Entry, tokens: Token[], at: number, allCaps: boolean, caseInsensitive = false): boolean {
  const slice = tokens.slice(at, at + entry.tokens.length);
  // Preguntas del usuario (Ask): se aceptan minúsculas salvo siglas de 1–2 letras.
  if (caseInsensitive) return entry.alias.replace(/[^A-Za-z]/g, "").length >= 3 || entry.caseRule === "any";
  switch (entry.caseRule) {
    case "any":
      return true;
    case "exact": {
      const aliasTokens = aliasShape(entry.alias);
      // En titulares en MAYÚSCULAS no se aceptan siglas de 2 letras (US, UK, EU ⇒ "TELL US").
      if (allCaps && entry.alias.replace(/[^A-Za-z]/g, "").length <= 2) return false;
      return slice.every((t, i) => {
        const original = tokenize(entry.alias)[i]?.text ?? aliasTokens.tokens[i] ?? "";
        return t.text === original || (allCaps && t.text === original.toUpperCase());
      });
    }
    case "proper":
      // Cada token alfabético empieza por mayúscula (o es número): "Apple" sí, "apple" no.
      return slice.every((t) => /^[\p{Lu}\p{N}]/u.test(t.text));
  }
}

export interface Mention {
  nodes: NodeKey[];
  method: LinkMethod;
  confidence: number;
  text: string;
  start: number;
  end: number;
}

interface Candidate extends Mention {
  length: number;
  priority: number;
  tokenStart: number;
  tokenEnd: number;
}

const CASHTAG = /\$([A-Z]{1,5}(?:\.[A-Z])?)\b/g;
const EXCHANGE_TICKER = /\b(?:NYSE|NASDAQ|Nasdaq|NasdaqGS|NasdaqGM|NYSE American|Cboe|BATS)\s*:\s*([A-Z]{1,5}(?:\.[A-Z])?)\b/g;
const PAREN_TICKER = /\(([A-Z]{2,5}(?:\.[A-Z])?)\)/g;

/** Menciones directas en un texto (titular y, si existe, snippet). */
export function findMentions(g: Gazetteer, text: string, options: { caseInsensitive?: boolean } = {}): Mention[] {
  const tokens = tokenize(text);
  const allCaps = upperRatio(text) > 0.8;
  const candidates: Candidate[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const entries = g.index.get(tok.folded);
    if (!entries) continue;
    for (const entry of entries) {
      const n = entry.tokens.length;
      if (i + n > tokens.length) continue;
      let ok = true;
      for (let k = 1; k < n; k++) {
        const t = tokens[i + k];
        if (!t || t.folded !== entry.tokens[k] || t.joinedToPrev !== entry.joined[k]) {
          ok = false;
          break;
        }
      }
      if (!ok || !caseOk(entry, tokens, i, allCaps, options.caseInsensitive)) continue;
      const first = tokens[i] as Token;
      const last = tokens[i + n - 1] as Token;
      if (entry.exclusion && entry.exclusion.test(text)) continue;
      if (entry.context === "company" && !options.caseInsensitive && !COMPANY_CONTEXT.test(text)) continue;
      if (entry.context === "commodity") {
        // Contexto de mercado CERCA de la mención (±60 caracteres), no en cualquier parte del texto.
        const around = text.slice(Math.max(0, first.start - 60), last.end + 60);
        if (!COMMODITY_CONTEXT.test(around) && !/(surge|soar|jump|spike|rall(y|ies|ied)|rises|rose|climb|gains|plunge|slump|tumble|falls|fell|drops|slides|slid|sinks|sank|record)/i.test(around)) continue;
        // Nombre propio compuesto ("Gold Star Distribution"): siguiente token en mayúscula que no es palabra de mercado.
        const next = tokens[i + n];
        if (next && /^\p{Lu}/u.test(next.text) && !allCaps && !COMMODITY_CONTEXT.test(next.text) && !/^(Price|Prices|Rises|Falls|Hits|Jumps|Slips|Surges|Drops|Climbs|Output|Demand|Supply|Futures|Market|Rally|Record|Rallies|Extends|Holds|Steadies|Edges|Tops|Near|At)$/.test(next.text)) continue;
      }
      candidates.push({
        nodes: entry.nodes,
        method: entry.method,
        confidence: entry.confidence,
        text: text.slice(first.start, last.end),
        start: first.start,
        end: last.end,
        length: last.end - first.start,
        priority: entry.priority,
        tokenStart: i,
        tokenEnd: i + n - 1,
      });
    }
  }

  // Tickers explícitos.
  const tickerCandidate = (ticker: string, start: number, end: number, method: LinkMethod, confidence: number) => {
    const company = g.tickers.get(ticker.replace("-", "."));
    if (!company) return;
    const nodes: NodeKey[] = [`company:${company.companyId}`];
    // Varias clases (GOOGL/GOOG): el ticker concreto identifica el VALOR, no solo el emisor.
    if (company.tickers.length > 1 && company.securityIds[ticker]) nodes.push(`security:${company.securityIds[ticker]}`);
    candidates.push({ nodes, method, confidence, text: text.slice(start, end), start, end, length: end - start, priority: 4, tokenStart: -1, tokenEnd: -1 });
  };
  for (const m of text.matchAll(CASHTAG)) if (m[1]) tickerCandidate(m[1], m.index ?? 0, (m.index ?? 0) + m[0].length, "cashtag", 0.95);
  for (const m of text.matchAll(EXCHANGE_TICKER)) if (m[1]) tickerCandidate(m[1], m.index ?? 0, (m.index ?? 0) + m[0].length, "exchange_ticker", 0.97);
  for (const m of text.matchAll(PAREN_TICKER)) if (m[1]) tickerCandidate(m[1], m.index ?? 0, (m.index ?? 0) + m[0].length, "ticker", 0.9);
  // Ticker suelto: solo en el TITULAR (no en snippets llenos de siglas) y con contexto bursátil.
  const headline = text.split(/\.\s/)[0] ?? text;
  if (!allCaps && /\b(stock|stocks|shares|earnings|NYSE|Nasdaq|price target|rating|upgrade|downgrade)\b/i.test(headline)) {
    for (const t of tokens.filter((x) => x.end <= headline.length)) {
      if (t.text.length >= 3 && t.text === t.text.toUpperCase() && /^[A-Z]+$/.test(t.text) && !BARE_TICKER_BLOCK.has(t.text) && g.tickers.has(t.text)) {
        tickerCandidate(t.text, t.start, t.end, "ticker", 0.65);
      }
    }
  }

  // Selección voraz sin solapes: primero la más larga, luego prioridad y confianza.
  candidates.sort((a, b) => b.length - a.length || b.priority - a.priority || b.confidence - a.confidence || a.start - b.start);
  const taken: Candidate[] = [];
  for (const c of candidates) {
    if (taken.some((t) => c.start < t.end && t.start < c.end)) {
      // Un ticker explícito que coincide con el mismo emisor refuerza la mención ya elegida.
      continue;
    }
    taken.push(c);
  }
  return taken.sort((a, b) => a.start - b.start).map(({ nodes, method, confidence, text: t, start, end }) => ({ nodes, method, confidence, text: t, start, end }));
}

/** Menciones ⇒ enlaces DIRECT (uno por nodo, con la mejor confianza y la evidencia textual). */
export function mentionsToLinks(mentions: readonly Mention[]): EntityLink[] {
  const byNode = new Map<NodeKey, EntityLink>();
  for (const m of mentions) {
    for (const node of m.nodes) {
      const current = byNode.get(node);
      // Una segunda mención del mismo nodo aumenta ligeramente la confianza (máx. 0.99).
      if (current) {
        current.confidence = Math.min(0.99, Math.max(current.confidence, m.confidence) + 0.03);
        continue;
      }
      byNode.set(node, { node, relation: "DIRECT", method: m.method, confidence: m.confidence, evidence: `"${m.text}"` });
    }
  }
  // Si un país aparece solo por un alias débil y hay otro alias fuerte del mismo país, ya se unifica arriba.
  return [...byNode.values()];
}
