import type { ArticleSignals, EntityLink, EventStatus, EventType, NewsEvent, SourceTier } from "@/domain/news";
import { FACTOR_BY_CODE } from "@/knowledge/factors";
import type { RelationGraph } from "@/knowledge/graph";
import type { Move, NodeKey } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { classificationNodes } from "@/knowledge/universe";
import { computeConfidence, computeImportance } from "./confidence";
import { computeImpacts } from "./impact";
import { isSpecificNode } from "./process";
import { PRESS_RELEASE_WIRES, TIER_QUALITY } from "./publishers";
import { EVENT_TYPE_DEF, eventTypeDef } from "./taxonomy";
import { sha1 } from "./text";

/** Artículo de un evento tal como se guarda (señales ya calculadas). */
export interface EventArticle {
  id: number;
  url: string;
  title: string;
  publisher: string;
  publisherKey: string;
  tier: SourceTier;
  publishedAt: string;
  language: string | null;
  sourceId: string;
  syndicationCount: number;
  snippet: string | null;
  primary: boolean;
  signals: Pick<ArticleSignals, "type" | "secondaryTypes" | "typeCertainty" | "links" | "polarity" | "moves" | "flags">;
}

export interface AssembleContext {
  graph: RelationGraph;
  now: Date;
  /** Peso de mercado de un emisor (0–1), p. ej. percentil de capitalización. */
  companyWeight?: (companyId: string) => number;
}

const DEVELOPING_MS = 6 * 3_600_000;
const ACTIVE_MS = 48 * 3_600_000;

export function eventStatus(firstSeenAt: string, lastSeenAt: string, now: Date): EventStatus {
  const last = Date.parse(lastSeenAt);
  if (now.getTime() - last > ACTIVE_MS) return "stale";
  if (now.getTime() - Date.parse(firstSeenAt) < DEVELOPING_MS) return "developing";
  return "active";
}

/** Informes independientes: editores distintos con redacción propia; notas de prensa cuentan como la fuente primaria. */
export function independentReports(articles: readonly Pick<EventArticle, "publisherKey" | "tier">[]): number {
  const keys = new Set<string>();
  for (const a of articles) keys.add(PRESS_RELEASE_WIRES.has(a.publisherKey) ? "press-release" : a.publisherKey);
  return keys.size;
}

function voteType(articles: readonly EventArticle[]): { type: EventType; secondary: EventType[] } {
  const votes = new Map<EventType, number>();
  for (const a of articles) {
    const w = TIER_QUALITY[a.tier] * (0.5 + a.signals.typeCertainty);
    votes.set(a.signals.type, (votes.get(a.signals.type) ?? 0) + w);
    for (const s of a.signals.secondaryTypes) votes.set(s, (votes.get(s) ?? 0) + w * 0.4);
  }
  const ranked = [...votes.entries()].filter(([t]) => t !== "OTHER" || votes.size === 1).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const [top] = ranked;
  if (!top) return { type: "OTHER", secondary: [] };
  return { type: top[0], secondary: ranked.slice(1).filter(([, v]) => v >= top[1] * 0.35).map(([t]) => t).slice(0, 3) };
}

function mergeDirectLinks(articles: readonly EventArticle[]): EntityLink[] {
  const byNode = new Map<NodeKey, { link: EntityLink; support: number }>();
  for (const a of articles) {
    for (const l of a.signals.links) {
      if (l.relation !== "DIRECT") continue;
      const cur = byNode.get(l.node);
      if (!cur) byNode.set(l.node, { link: { ...l }, support: 1 });
      else {
        cur.support++;
        const subject = cur.link.subject || l.subject;
        if (l.confidence > cur.link.confidence) cur.link = { ...l };
        if (subject) cur.link.subject = true;
      }
    }
  }
  const total = articles.length;
  return [...byNode.values()]
    .map(({ link, support }) => ({ ...link, confidence: Math.min(0.99, Math.round((link.confidence + 0.04 * (support - 1)) * 1000) / 1000), evidence: support > 1 ? `${link.evidence} · in ${support}/${total} articles` : link.evidence }))
    .filter((l) => l.confidence >= 0.6 || l.method === "source_metadata");
}

function inferLinks(direct: readonly EntityLink[], type: EventType, secondary: readonly EventType[], graph: RelationGraph): EntityLink[] {
  const out = new Map<NodeKey, EntityLink>();
  const directNodes = new Set(direct.map((l) => l.node));
  const add = (l: EntityLink) => {
    if (directNodes.has(l.node)) return;
    const cur = out.get(l.node);
    if (!cur || l.confidence > cur.confidence) out.set(l.node, l);
  };
  for (const l of direct) {
    const parsed = parseNodeKey(l.node);
    if (!parsed) continue;
    if (parsed.kind === "company") {
      const company = graph.universe.byCompanyId.get(parsed.key);
      if (!company) continue;
      for (const node of classificationNodes(company)) {
        add({ node, relation: "INFERRED", method: "classification", confidence: Math.round(l.confidence * 0.9 * 1000) / 1000, evidence: `${company.name} is classified in GICS ${graph.label(node)}`, via: l.node });
      }
    }
    if (parsed.kind === "external") {
      for (const r of graph.outgoing(l.node)) if (r.type === "LOCATED_IN") add({ node: r.to, relation: "INFERRED", method: "graph", confidence: 0.8, evidence: `${graph.label(l.node)} is based in ${graph.label(r.to)}`, via: l.node });
    }
    if (l.node === "factor:china_demand") add({ node: "country:CN", relation: "INFERRED", method: "graph", confidence: 0.8, evidence: "China demand refers to the Chinese economy", via: l.node });
    if (parsed.kind === "subIndustry" || parsed.kind === "industry") {
      // Industria mencionada ⇒ su sector.
      const members = graph.companiesUnder(l.node).map((id) => graph.universe.byCompanyId.get(id)).filter(Boolean);
      const sector = members[0]?.sectorCode;
      if (sector) add({ node: `sector:${sector}`, relation: "INFERRED", method: "classification", confidence: Math.round(l.confidence * 0.85 * 1000) / 1000, evidence: `${graph.label(l.node)} belongs to the ${graph.label(`sector:${sector}`)} sector`, via: l.node });
    }
  }
  const types = [type, ...secondary];
  for (const t of types) {
    const def = EVENT_TYPE_DEF.get(t);
    if (!def) continue;
    for (const f of def.factors) {
      const factor = FACTOR_BY_CODE.get(f.slice("factor:".length));
      add({ node: f, relation: "INFERRED", method: "macro_scope", confidence: t === type ? 0.75 : 0.55, evidence: `${def.label} events relate to ${factor?.name ?? f}` });
    }
  }
  const countries = direct.filter((l) => l.node.startsWith("country:"));
  if (eventTypeDef(type).marketWide && (countries.length === 0 || countries.some((l) => l.node === "country:US"))) add({ node: "index:sp500", relation: "INFERRED", method: "macro_scope", confidence: 0.6, evidence: `${eventTypeDef(type).label} events can affect the overall market` });
  return [...out.values()];
}

function aggregateMoves(articles: readonly EventArticle[]): NewsEvent["moves"] {
  const byNode = new Map<NodeKey, { up: number; down: number; flat: number; evidence: string }>();
  for (const a of articles) {
    for (const m of a.signals.moves) {
      const cur = byNode.get(m.node) ?? { up: 0, down: 0, flat: 0, evidence: m.evidence };
      if (m.move === "up") cur.up++;
      else if (m.move === "down") cur.down++;
      else if (m.move === "flat") cur.flat++;
      byNode.set(m.node, cur);
    }
  }
  return [...byNode.entries()].map(([node, c]) => {
    let move: Move = "unknown";
    if (c.flat > c.up && c.flat > c.down) move = "flat";
    else if (c.up > 0 && c.down === 0) move = "up";
    else if (c.down > 0 && c.up === 0) move = "down";
    else if (c.up >= 2 * c.down && c.up > 0) move = "up";
    else if (c.down >= 2 * c.up && c.down > 0) move = "down";
    return { node, move, evidence: c.evidence };
  });
}

function representative(articles: readonly EventArticle[]): EventArticle {
  const sorted = [...articles].sort((a, b) => a.tier - b.tier || Number(b.primary) - Number(a.primary) || Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.url.localeCompare(b.url));
  return sorted[0] as EventArticle;
}

export interface AssembledEvent extends Omit<NewsEvent, "id"> {
  representativeArticleId: number;
}

export function assembleEvent(articles: readonly EventArticle[], ctx: AssembleContext): AssembledEvent {
  if (articles.length === 0) throw new Error("assembleEvent: no articles");
  const rep = representative(articles);
  const { type, secondary } = voteType(articles);
  const def = eventTypeDef(type);
  const direct = mergeDirectLinks(articles);
  const inferred = inferLinks(direct, type, secondary, ctx.graph);
  const links = [...direct, ...inferred].sort((a, b) => Number(a.relation === "INFERRED") - Number(b.relation === "INFERRED") || b.confidence - a.confidence);

  const times = articles.map((a) => Date.parse(a.publishedAt)).filter(Number.isFinite);
  const firstSeenAt = new Date(Math.min(...times)).toISOString();
  const lastSeenAt = new Date(Math.max(...times)).toISOString();
  const hasOfficialSource = articles.some((a) => a.tier === 1);
  const independent = independentReports(articles);

  const pos = articles.filter((a) => a.signals.polarity > 0).length;
  const neg = articles.filter((a) => a.signals.polarity < 0).length;
  const polarity: -1 | 0 | 1 = pos > neg * 2 ? 1 : neg > pos * 2 ? -1 : 0;
  const contradictory = (pos > 0 && neg > 0 && Math.min(pos, neg) / (pos + neg) >= 0.3) || (articles.some((a) => a.signals.flags.denial) && articles.some((a) => !a.signals.flags.denial));
  const unconfirmed = !hasOfficialSource && !articles.some((a) => a.primary) && articles.every((a) => a.signals.flags.unconfirmed);

  const confidence = computeConfidence({
    articles: articles.map((a) => ({ tier: a.tier, publisherKey: a.publisherKey, typeCertainty: a.signals.typeCertainty, polarity: a.signals.polarity, unconfirmed: a.signals.flags.unconfirmed, denial: a.signals.flags.denial, primary: a.primary })),
    independentSources: independent,
    hasOfficialSource,
    links,
    lastSeenAt,
    now: ctx.now,
  });
  const moves = aggregateMoves(articles);
  const titles = [...new Set(articles.map((a) => a.title))].slice(0, 12);
  const impacts = computeImpacts({ type, secondaryTypes: secondary, links, moves, polarity, confidence: confidence.score, titles }, ctx.graph);

  const companies = direct.filter((l) => l.node.startsWith("company:")).map((l) => l.node.slice("company:".length));
  const marketWeight = ctx.companyWeight && companies.length ? Math.max(...companies.map((id) => ctx.companyWeight?.(id) ?? 0)) : 0;
  const importance = computeImportance({ typeWeight: def.weight, independentSources: independent, confidence: confidence.score, marketWeight, official: hasOfficialSource, marketWide: def.marketWide, sourceQuality: confidence.sourceQuality });

  const specific = direct.filter((l) => isSpecificNode(l.node)).sort((a, b) => b.confidence - a.confidence);
  const fingerprintNodes = specific.slice(0, 4).map((l) => l.node).sort();
  const fingerprint = sha1(`${type}|${fingerprintNodes.join(",")}|${firstSeenAt.slice(0, 10)}`).slice(0, 16);

  return {
    fingerprint,
    type,
    secondaryTypes: secondary,
    title: rep.title,
    originalLanguage: rep.language,
    originalUrl: rep.url,
    source: rep.publisher,
    summary: deterministicSummary({ type, articles, independent, hasOfficialSource, direct, moves, contradictory, unconfirmed, graph: ctx.graph }),
    summaryOrigin: "deterministic",
    status: eventStatus(firstSeenAt, lastSeenAt, ctx.now),
    firstSeenAt,
    lastSeenAt,
    articleCount: articles.reduce((n, a) => n + 1 + Math.max(0, a.syndicationCount - 1), 0),
    independentSources: independent,
    hasOfficialSource,
    confidence,
    importance,
    contradictory,
    unconfirmed,
    languages: [...new Set(articles.map((a) => a.language).filter((l): l is string => !!l))].sort(),
    links,
    impacts,
    moves,
    polarity,
    representativeArticleId: rep.id,
  };
}

/**
 * Resumen PROPIO y factual (no copia texto de terceros): qué tipo de evento, cuántas fuentes, qué
 * entidades y qué movimientos se mencionan explícitamente. Distingue hecho oficial de afirmación de medios.
 */
function deterministicSummary(p: {
  type: EventType;
  articles: readonly EventArticle[];
  independent: number;
  hasOfficialSource: boolean;
  direct: readonly EntityLink[];
  moves: NewsEvent["moves"];
  contradictory: boolean;
  unconfirmed: boolean;
  graph: RelationGraph;
}): string {
  const def = eventTypeDef(p.type);
  const official = p.articles.filter((a) => a.tier === 1).map((a) => a.publisher);
  const who = p.hasOfficialSource ? `Official release from ${[...new Set(official)].slice(0, 2).join(", ")}` : `Reported by ${p.independent} independent source${p.independent === 1 ? "" : "s"}`;
  const top = p.direct
    .filter((l) => isSpecificNode(l.node) || l.node.startsWith("country:"))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((l) => p.graph.label(l.node));
  const moves = p.moves.filter((m) => m.move === "up" || m.move === "down").map((m) => `${p.graph.label(m.node)} ${m.move === "up" ? "higher" : "lower"}`);
  const parts = [`${def.label} event. ${who}.`];
  if (top.length) parts.push(`Entities named: ${top.join(", ")}.`);
  if (moves.length) parts.push(`Movements stated in headlines: ${moves.join(", ")}.`);
  if (p.unconfirmed) parts.push("Reports rely on unnamed sources; not officially confirmed.");
  if (p.contradictory) parts.push("Sources disagree on the direction or the facts.");
  return parts.join(" ");
}
