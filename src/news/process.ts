import type { ArticleSignals, EntityLink, EventType, ProcessedArticle, RawArticle, SourceTier } from "@/domain/news";
import type { Move, NodeKey } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { cikKey } from "@/knowledge/universe";
import { classifyText } from "./classify";
import { findMentions, type Gazetteer, mentionsToLinks } from "./entities";
import { DENIAL, HOLDINGS_NOISE, MOVE_REPORT, moveNear, OPINION, polarityOf, rateMove, UNCONFIRMED } from "./lexicon";
import { PRESS_RELEASE_WIRES, publisherTier } from "./publishers";
import { eventTypeDef } from "./taxonomy";
import { cleanText, contentTokens, guessLanguage, languageCode, normalizeTitle, sha1, stripPublisherSuffix } from "./text";
import { canonicalizeUrl, registrableDomain, urlHash } from "./url";

/** Un artículo publicado hace más de estos días al ingerirse se considera antiguo (no crea eventos). */
export const STALE_ARTICLE_DAYS = 7;

export interface ProcessOptions {
  now: Date;
  /** Tier asignado por el adaptador (fuentes oficiales = 1). Si falta, se calcula por dominio. */
  sourceTier?: SourceTier;
  /** macro: todo es relevante · regulator: necesita una entidad de mercado · media: filtro normal. */
  relevanceScope?: "macro" | "regulator" | "media";
}

/** Nodos que son "específicos" para relevancia y clustering (no solo un país o un factor genérico). */
export function isSpecificNode(node: NodeKey): boolean {
  const kind = parseNodeKey(node)?.kind;
  return kind === "company" || kind === "security" || kind === "external" || kind === "commodity" || kind === "subIndustry" || kind === "industry" || kind === "sector" || kind === "index" || (kind === "factor" && node !== "factor:geopolitical_risk");
}

function relevance(type: EventType, certainty: number, links: EntityLink[], tier: SourceTier, flags: ArticleSignals["flags"] & { noise?: boolean }, scope: ProcessOptions["relevanceScope"] = "media", moved = false): { relevant: boolean; reason: string } {
  if (flags.opinion && tier >= 3) return { relevant: false, reason: "opinion/listicle from an unrated or general source" };
  if (flags.noise) return { relevant: false, reason: "automated holdings/insider-trading notice" };
  const specific = links.filter((l) => isSpecificNode(l.node));
  // Entidades "fuertes": empresa, industria, sector, materia prima, índice. Un factor solo (p. ej. "AI") no basta
  // en medios sin clasificar salvo que el texto indique un movimiento explícito o la fuente sea de referencia.
  const strong = specific.filter((l) => !l.node.startsWith("factor:"));
  const factorOk = specific.some((l) => l.node.startsWith("factor:")) && (tier <= 2 || moved);
  const marketEntities = specific.filter((l) => !l.node.startsWith("factor:") && !l.node.startsWith("index:"));
  if (scope === "macro") return { relevant: true, reason: "official macro source (central bank / statistics agency)" };
  if (scope === "regulator") {
    return marketEntities.length > 0 ? { relevant: true, reason: "official/regulatory source about a market entity" } : { relevant: false, reason: "regulatory release without a market entity" };
  }
  if (type === "OTHER") return { relevant: false, reason: "no market-relevant event type" };
  const def = eventTypeDef(type);
  const countries = links.some((l) => l.node.startsWith("country:") && l.confidence >= 0.85);
  if (type === "ELECTION_POLITICS" || type === "GEOPOLITICAL_CONFLICT") {
    return strong.length > 0 || (factorOk && countries) ? { relevant: true, reason: "political/geopolitical news with a market entity" } : { relevant: false, reason: "political/geopolitical news without a market entity" };
  }
  if (type === "MARKET_MOVE") {
    return strong.length > 0 || factorOk ? { relevant: true, reason: "market news with an identified entity" } : { relevant: false, reason: "generic market chatter without entities" };
  }
  if (strong.length > 0) return { relevant: true, reason: "event type + market entity" };
  if (factorOk) return { relevant: true, reason: "event type + market factor with explicit movement" };
  if (def.family === "macro" && certainty >= 0.5 && (countries || tier <= 2)) return { relevant: true, reason: "macro event" };
  return { relevant: false, reason: specific.length ? "only a generic factor (no company, industry, commodity or stated movement)" : "event type without market entity" };
}

const ENERGY = new Set(["commodity:crude_oil", "commodity:natural_gas", "commodity:coal"]);
const METALS = new Set(["commodity:gold", "commodity:silver", "commodity:copper", "commodity:aluminum", "commodity:iron_ore", "commodity:nickel", "commodity:lithium", "commodity:uranium"]);

/** Tipos que las entidades sugieren (refuerzo del clasificador). */
function entityTypeHints(links: readonly EntityLink[]): EventType[] {
  const out = new Set<EventType>();
  for (const l of links) {
    if (ENERGY.has(l.node)) out.add("ENERGY_MARKETS");
    else if (METALS.has(l.node)) out.add("METALS_MINING");
    else if (l.node === "commodity:grains") out.add("AGRICULTURE");
    else if (l.node === "factor:export_controls") out.add("SANCTIONS_EXPORT_CONTROLS");
    else if (l.node === "factor:trade_barriers") out.add("TRADE_TARIFFS");
    else if (l.node === "factor:bond_yields") out.add("RATES_BONDS");
  }
  return [...out];
}

/** Procesa un artículo: URL canónica, hashes, calidad de la fuente y señales deterministas. */
export function processArticle(raw: RawArticle, g: Gazetteer, options: ProcessOptions): ProcessedArticle {
  const title = stripPublisherSuffix(cleanText(raw.title));
  const snippet = raw.snippet ? cleanText(raw.snippet).slice(0, 400) : null;
  const canonicalUrl = canonicalizeUrl(raw.url);
  const host = (() => {
    try {
      return new URL(canonicalUrl).hostname;
    } catch {
      return raw.publisher;
    }
  })();
  const publisherKey = options.sourceTier === 1 ? raw.publisher : registrableDomain(host || raw.publisher);
  const tier: SourceTier = options.sourceTier ?? publisherTier(host, publisherKey);
  const language = languageCode(raw.language) ?? guessLanguage(title);

  const text = snippet ? `${title}. ${snippet}` : title;
  const mentions = findMentions(g, text);
  const links = mentionsToLinks(mentions);
  const classification = classifyText(title, snippet, raw.hints?.eventTypes ?? [], entityTypeHints(links));
  // Un tipo corporativo (GUIDANCE, EARNINGS…) sin ninguna empresa identificada se degrada al mejor tipo no corporativo.
  const hasCompany = links.some((l) => l.node.startsWith("company:") || l.node.startsWith("external:")) || !!raw.hints?.cik;
  if (!hasCompany && eventTypeDef(classification.type).corporate) {
    const alt = (Object.entries(classification.scores) as [EventType, number][]).filter(([t]) => !eventTypeDef(t).corporate).sort((a, b) => b[1] - a[1])[0];
    classification.secondaryTypes = [classification.type, ...classification.secondaryTypes.filter((t) => t !== alt?.[0])].slice(0, 3);
    classification.type = alt?.[0] ?? "OTHER";
    classification.certainty = Math.min(classification.certainty, 0.5);
  }

  // Metadatos estructurados de la fuente: identificación exacta (CIK) y nodos implícitos (feed de la Fed…).
  if (raw.hints?.cik) {
    const company = g.universe.byCik.get(cikKey(raw.hints.cik));
    if (company) {
      const node: NodeKey = `company:${company.companyId}`;
      const existing = links.find((l) => l.node === node);
      if (existing) Object.assign(existing, { method: "cik", confidence: 1, evidence: `SEC CIK ${raw.hints.cik}` });
      else links.unshift({ node, relation: "DIRECT", method: "cik", confidence: 1, evidence: `SEC CIK ${raw.hints.cik}` });
    }
  }
  for (const node of raw.hints?.nodes ?? []) {
    if (!links.some((l) => l.node === node)) links.push({ node, relation: "DIRECT", method: "source_metadata", confidence: 0.95, evidence: `Published by ${raw.publisher}` });
  }

  // Movimientos de materias primas y factores mencionados.
  const moves: ArticleSignals["moves"] = [];
  for (const m of mentions) {
    for (const node of m.nodes) {
      if (!node.startsWith("commodity:") && !node.startsWith("factor:")) continue;
      let move: Move = node === "factor:interest_rates" ? rateMove(title) : "unknown";
      if (move === "unknown") move = moveNear(text, m.start, m.end);
      if (!moves.some((x) => x.node === node)) moves.push({ node, move, evidence: `"${m.text}"` });
    }
  }
  if (classification.type === "CENTRAL_BANK" && !moves.some((m) => m.node === "factor:interest_rates")) {
    const rm = rateMove(title);
    if (rm !== "unknown") moves.push({ node: "factor:interest_rates", move: rm, evidence: "central-bank headline" });
  }

  // Sujeto del titular: empresas mencionadas al principio (el tono del titular solo se les aplica a ellas).
  for (const m of mentions) {
    if (m.start > Math.max(40, title.length * 0.35)) continue;
    for (const node of m.nodes) {
      const l = links.find((x) => x.node === node);
      if (l && (node.startsWith("company:") || node.startsWith("external:"))) l.subject = true;
    }
  }

  const flags = { unconfirmed: UNCONFIRMED.test(title), denial: DENIAL.test(title), opinion: OPINION.test(title) && !MOVE_REPORT.test(title) };
  const noise = HOLDINGS_NOISE.test(title);
  const moved = moves.some((m) => m.move === "up" || m.move === "down");
  const rel = relevance(classification.type, classification.certainty, links, tier, { ...flags, noise }, options.relevanceScope, moved);
  const publishedMs = Date.parse(raw.publishedAt);
  const stale = Number.isFinite(publishedMs) && options.now.getTime() - publishedMs > STALE_ARTICLE_DAYS * 86_400_000;
  const primaryPress = PRESS_RELEASE_WIRES.has(publisherKey);

  return {
    ...raw,
    title,
    snippet,
    language,
    canonicalUrl,
    urlHash: urlHash(canonicalUrl),
    titleHash: sha1(normalizeTitle(title)),
    publisherKey,
    tier,
    stale,
    hints: primaryPress ? { ...raw.hints, primary: true } : raw.hints,
    signals: {
      type: classification.type,
      secondaryTypes: classification.secondaryTypes,
      typeCertainty: raw.hints?.eventTypes?.length ? Math.max(classification.certainty, 0.9) : classification.certainty,
      links,
      polarity: polarityOf(title),
      moves,
      flags,
      tokens: contentTokens(title),
      relevant: rel.relevant && !stale,
      relevanceReason: stale ? `published more than ${STALE_ARTICLE_DAYS} days before ingestion` : rel.reason,
    },
  };
}

/** Empresa sujeto del titular: la de mayor confianza y, a igualdad, la primera mencionada. */
export function primaryCompany(article: Pick<ProcessedArticle, "signals">): NodeKey | null {
  const companies = article.signals.links.filter((l) => l.node.startsWith("company:") && l.relation === "DIRECT");
  const best = companies.reduce<EntityLink | null>((acc, l) => (!acc || l.confidence > acc.confidence + 0.05 ? l : acc), null);
  return best?.node ?? null;
}
