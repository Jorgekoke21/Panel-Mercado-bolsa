import type { TimeRange } from "@/domain/time-range";
import type { NodeKey } from "@/knowledge/types";
import type { Universe } from "@/knowledge/universe";
import { findMentions, type Gazetteer } from "@/news/entities";
import { fold } from "@/news/text";

/**
 * ASK MARKETRADAR — enrutador determinista.
 *
 * Primero se entiende la pregunta (intención + entidades + periodo) con reglas; después se RECUPERA
 * información interna relevante; solo entonces se redacta (motor determinista o IA con el context pack).
 * Nunca se envía la base de datos entera al modelo.
 */
export type AskIntent = "why_move" | "relative_move" | "entity_news" | "theme_exposure" | "market_today" | "screen_52w_growth" | "compare" | "learn" | "unknown";

export const INTENT_LABELS: Record<AskIntent, string> = {
  why_move: "Explain a move",
  relative_move: "Move vs sector",
  entity_news: "What is happening",
  theme_exposure: "Related companies",
  market_today: "What changed today",
  screen_52w_growth: "Screen",
  compare: "Compare",
  learn: "Learning mode",
  unknown: "Not understood",
};

export type LearnConcept = "pe" | "fcf_yield" | "rsi" | "market_cap" | "relative_volume" | "revenue_growth" | "operating_margin" | "roe" | "sma200" | "range_52w" | "eps";

export interface ParsedQuestion {
  question: string;
  intent: AskIntent;
  range: TimeRange;
  companies: string[];
  nodes: NodeKey[];
  concept: LearnConcept | null;
  direction: "up" | "down" | null;
  notes: string[];
}

/** Alias adicionales para preguntas en español (y sinónimos coloquiales) que la ontología no cubre. */
const ASK_ALIASES: { re: RegExp; node: NodeKey }[] = [
  { re: /\b(ia|i\.a\.|inteligencia artificial|artificial intelligence|\bai\b)\b/, node: "factor:ai_demand" },
  { re: /\b(demanda (electrica|de electricidad)|electricity demand|power demand|consumo electrico)\b/, node: "factor:electricity_demand" },
  { re: /\b(centros? de datos|data cent(er|re)s?)\b/, node: "factor:data_centers" },
  { re: /\b(mineros?|mineras?|mining) (de|del)? ?cobre\b|\bcopper miners?\b/, node: "subIndustry:15104025" },
  { re: /\b(mineros?|mineras?) (de|del)? ?oro\b|\bgold miners?\b/, node: "subIndustry:15104030" },
  { re: /\bcobre\b/, node: "commodity:copper" },
  { re: /\boro\b/, node: "commodity:gold" },
  { re: /\bplata\b/, node: "commodity:silver" },
  { re: /\b(petroleo|crudo|brent|wti)\b/, node: "commodity:crude_oil" },
  { re: /\bgas natural\b/, node: "commodity:natural_gas" },
  { re: /\buranio\b/, node: "commodity:uranium" },
  { re: /\blitio\b/, node: "commodity:lithium" },
  { re: /\b(tipos de interes|tasas de interes|interest rates)\b/, node: "factor:interest_rates" },
  { re: /\b(aranceles|tariffs?)\b/, node: "factor:trade_barriers" },
  { re: /\binflacion\b/, node: "factor:inflation" },
  { re: /\b(semiconductores|chips|semis)\b/, node: "subIndustry:45301020" },
  { re: /\b(tecnologia|technology|tech)\b/, node: "sector:45" },
  { re: /\b(energia|energy)\b(?! (costs|prices))/, node: "sector:10" },
  { re: /\b(salud|health ?care|sanidad)\b/, node: "sector:35" },
  { re: /\b(financieras?|financials|finanzas)\b/, node: "sector:40" },
  { re: /\b(bancos|banks)\b/, node: "industry:401010" },
  { re: /\b(utilities|electricas|servicios publicos)\b/, node: "sector:55" },
  { re: /\b(industriales|industrials)\b/, node: "sector:20" },
  { re: /\b(materiales|materials)\b/, node: "sector:15" },
  { re: /\b(inmobiliario|real estate|reits?)\b/, node: "sector:60" },
  { re: /\b(consumo basico|consumer staples)\b/, node: "sector:30" },
  { re: /\b(consumo discrecional|consumer discretionary)\b/, node: "sector:25" },
  { re: /\b(comunicaciones|communication services)\b/, node: "sector:50" },
  { re: /\b(aerolineas|airlines)\b/, node: "subIndustry:20302010" },
  { re: /\b(defensa|defense)\b/, node: "subIndustry:20101010" },
  { re: /\b(s&p ?500|s&p|sp500|el mercado|the market|mi mercado)\b/, node: "index:sp500" },
];

const CONCEPTS: { re: RegExp; concept: LearnConcept }[] = [
  { re: /\b(p\/e|pe ratio|per\b|price[- ]to[- ]earnings|precio[- ]beneficio)/, concept: "pe" },
  { re: /\b(fcf yield|free cash flow yield|rentabilidad por flujo de caja libre|fcf)\b/, concept: "fcf_yield" },
  { re: /\brsi\b|relative strength index/, concept: "rsi" },
  { re: /\b(market cap|capitalizacion|capitalización|market capitalization)\b/, concept: "market_cap" },
  { re: /\b(relative volume|volumen relativo)\b/, concept: "relative_volume" },
  { re: /\b(revenue growth|crecimiento de (los )?ingresos|crecimiento de revenue)\b/, concept: "revenue_growth" },
  { re: /\b(operating margin|margen operativo)\b/, concept: "operating_margin" },
  { re: /\broe\b|return on equity|rentabilidad sobre (el )?patrimonio/, concept: "roe" },
  { re: /\b(sma ?200|200[- ]day (moving )?average|media movil de 200|media móvil de 200|moving average)\b/, concept: "sma200" },
  { re: /\b(52[- ]week|52 semanas)\b/, concept: "range_52w" },
  { re: /\b(eps|earnings per share|beneficio por accion|bpa)\b/, concept: "eps" },
];

/** Palabras que coinciden con tickers pero no deben tratarse como tales en una pregunta en minúsculas. */
const COMMON = new Set(["a", "al", "all", "and", "are", "as", "at", "be", "by", "de", "del", "el", "en", "es", "for", "has", "hoy", "in", "is", "it", "la", "las", "los", "low", "mi", "now", "o", "on", "or", "por", "que", "se", "so", "su", "the", "to", "un", "una", "y", "key", "cat", "cost", "well", "fast", "tech", "day", "ma", "ms", "t", "v", "c", "d", "f", "j", "k", "l", "o", "q", "p", "ice", "ed", "el", "es", "on", "gen", "fix", "keys", "tap", "peg", "flex", "ball", "dow", "cf", "cb", "ci", "cl", "dd", "de", "dg", "ge", "gl", "gm", "gs", "hd", "ip", "ir", "it", "kr", "lh", "mo", "ni", "pg", "pm", "rf", "rl", "so", "sw", "tt", "wm", "wy", "hon", "ups"]);

export function parseQuestion(question: string, g: Gazetteer, universe: Universe): ParsedQuestion {
  const q = question.trim().slice(0, 500);
  const f = fold(q);
  const notes: string[] = [];

  // Empresas: tickers (cualquier caja si no es palabra común) + alias en modo sin mayúsculas.
  const companies: string[] = [];
  const addCompany = (id: string) => {
    if (!companies.includes(id)) companies.push(id);
  };
  for (const m of q.matchAll(/\$?\b([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/g)) {
    const raw = m[1] ?? "";
    const upper = raw.toUpperCase();
    const c = universe.byTicker.get(upper);
    if (!c) continue;
    const explicit = raw === upper && raw.length >= 2;
    if (explicit || (!COMMON.has(raw.toLowerCase()) && raw.length >= 3) || m[0].startsWith("$")) addCompany(c.companyId);
  }
  const nodes: NodeKey[] = [];
  const addNode = (n: NodeKey) => {
    if (!nodes.includes(n)) nodes.push(n);
  };
  for (const mention of findMentions(g, q, { caseInsensitive: true })) {
    for (const n of mention.nodes) {
      if (n.startsWith("company:")) addCompany(n.slice(8));
      else if (!n.startsWith("security:")) addNode(n);
    }
  }
  for (const a of ASK_ALIASES) if (a.re.test(f)) addNode(a.node);
  // Nombres de sectores/industrias del universo ("Semiconductors", "Passenger Airlines").
  for (const [code, s] of universe.subIndustries) if (s.name.length > 5 && f.includes(fold(s.name))) addNode(`subIndustry:${code}`);
  for (const [code, s] of universe.industries) if (s.name.length > 5 && f.includes(fold(s.name))) addNode(`industry:${code}`);
  for (const [code, s] of universe.sectors) if (f.includes(fold(s.name))) addNode(`sector:${code}`);
  // Si se nombra una sub-industria, su sector genérico sobra ("semiconductores" también activa "tecnología" por "chips").
  const range: TimeRange = /\b(esta semana|this week|semana|week|7 dias)\b/.test(f) ? "1W" : /\b(este mes|this month|mes|month)\b/.test(f) ? "1M" : /\b(este ano|this year|ytd|en el ano)\b/.test(f) ? "YTD" : "1D";
  const direction = /\b(cae|caen|cayendo|bajando|baja|falling|down|drop\w*|plung\w*|sink\w*|cay[oó])\b/.test(f) ? "down" : /\b(sube|suben|subiendo|rising|up|jump\w*|soar\w*|rall\w*|gain\w*|sub[ií]o)\b/.test(f) ? "up" : null;

  let concept: LearnConcept | null = null;
  for (const c of CONCEPTS) if (c.re.test(f)) {
    concept = c.concept;
    break;
  }

  let intent: AskIntent = "unknown";
  const asksWhy = /\b(por que|porque|why)\b/.test(f);
  const relative = /\b(mas que su (sector|industria)|menos que su (sector|industria)|than (its|the) (sector|industry)|vs (su|its) (sector|industria|industry)|outperform\w*|underperform\w*)\b/.test(f);
  if (concept && /\b(que es|qué es|what is|what's|explain|explica\w*|como se calcula|how is .* calculated|define)\b/.test(f)) intent = "learn";
  else if (/\b(compar\w*|versus|vs\.?|frente a)\b/.test(f) && companies.length >= 2) intent = "compare";
  else if (asksWhy && relative && companies.length >= 1) intent = "relative_move";
  else if (asksWhy && (companies.length >= 1 || nodes.some((n) => /^(sector|industry|subIndustry):/.test(n))) && (direction || /\b(mueve|moving|move|moved|movimiento)\b/.test(f))) intent = "why_move";
  else if (/\b(maximos de 52|52[- ]week highs?|near (its |their )?(52[- ]week )?highs?|cerca de maximos|new highs?)\b/.test(f)) intent = "screen_52w_growth";
  else if (/\b(que empresas|which (s&p 500 )?companies|what companies|empresas del s&p 500|companies (are )?(related|exposed|linked|benefit\w*))\b/.test(f) && nodes.some((n) => /^(factor|commodity|external|theme):/.test(n))) intent = "theme_exposure";
  else if (/\b(que ha cambiado|what('s| has)? changed|what changed|hoy en (el|mi) mercado|market today|resumen del (dia|mercado)|que paso hoy)\b/.test(f)) intent = "market_today";
  else if (companies.length || nodes.length) intent = asksWhy && direction ? "why_move" : "entity_news";
  else if (concept) intent = "learn";

  if (intent === "why_move" && companies.length === 0 && nodes.length) notes.push("Group move: explained with its synthetic index and related events.");
  return { question: q, intent, range, companies, nodes, concept, direction, notes };
}
