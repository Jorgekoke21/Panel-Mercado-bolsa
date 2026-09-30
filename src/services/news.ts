import type { IngestRun, SourceStatus } from "@/data/repositories/news-repository";
import type { EntityLink, EventFamily, EventSource, EventType, ImpactHypothesis, LinkRelation, NewsEvent } from "@/domain/news";
import type { Horizon, NodeKey, NodeKind } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { confidenceLabel } from "@/news/confidence";
import { directionLabel } from "@/news/impact";
import { TIER_LABELS } from "@/news/publishers";
import { EVENT_TYPE_DEFS, eventTypeDef, FAMILY_LABELS } from "@/news/taxonomy";
import type { Repositories } from "./market-rows";
import { getNewsWebContext, type NewsWebContext } from "./news-context";

/**
 * Casos de uso del News Engine para la UI: World Pulse, detalle de evento y noticias por entidad.
 * Todo sale de NUESTRA base (eventos ya procesados) + datos de mercado reales de MarketRadar.
 */

export const PULSE_VIEWS = ["top", "markets", "companies", "sectors", "commodities", "macro", "geopolitics", "regulation", "technology"] as const;
export type PulseView = (typeof PULSE_VIEWS)[number];

export const PULSE_VIEW_LABELS: Record<PulseView, string> = {
  top: "Top events",
  markets: "Markets",
  companies: "Companies",
  sectors: "Sectors",
  commodities: "Commodities",
  macro: "Macro",
  geopolitics: "Geopolitics",
  regulation: "Regulation",
  technology: "Technology",
};

const VIEW_TYPES: Partial<Record<PulseView, EventType[]>> = {
  markets: ["MARKET_MOVE", "RATES_BONDS", "CURRENCY", "CREDIT"],
  macro: EVENT_TYPE_DEFS.filter((d) => d.family === "macro").map((d) => d.type),
  geopolitics: ["GEOPOLITICAL_CONFLICT", "SANCTIONS_EXPORT_CONTROLS", "TRADE_TARIFFS"],
  regulation: ["REGULATION", "ANTITRUST", "HEALTHCARE_REGULATORY", "LEGAL", "ELECTION_POLITICS", "FISCAL_POLICY"],
  technology: ["AI_DATA_CENTERS", "SEMICONDUCTORS", "CYBERSECURITY", "PRODUCT_TECHNOLOGY"],
  companies: EVENT_TYPE_DEFS.filter((d) => d.corporate).map((d) => d.type),
};

export function parsePulseView(value: unknown): PulseView {
  return typeof value === "string" && (PULSE_VIEWS as readonly string[]).includes(value) ? (value as PulseView) : "top";
}

function inView(e: NewsEvent, view: PulseView): boolean {
  if (view === "top") return true;
  if (view === "commodities") return eventTypeDef(e.type).family === "commodities" || e.links.some((l) => l.node.startsWith("commodity:") && l.relation === "DIRECT");
  if (view === "sectors") return e.links.some((l) => l.relation === "DIRECT" && /^(sector|industry|subIndustry):/.test(l.node));
  if (view === "markets") return (VIEW_TYPES.markets ?? []).includes(e.type) || e.links.some((l) => l.node.startsWith("index:") && l.relation === "DIRECT");
  const types = VIEW_TYPES[view] ?? [];
  return types.includes(e.type) || e.secondaryTypes.some((t) => types.includes(t));
}

export interface NodeChip {
  node: NodeKey;
  kind: NodeKind;
  label: string;
  href: string | null;
  relation: LinkRelation;
  method: string;
  confidence: number;
  evidence: string;
}

export interface ImpactVM {
  target: NodeKey;
  label: string;
  href: string | null;
  kind: NodeKind;
  channel: ImpactHypothesis["channel"];
  direction: ImpactHypothesis["direction"];
  directionLabel: string;
  strength: 1 | 2 | 3;
  horizon: Horizon;
  confidence: number;
  mechanism: string;
  rationale: string;
  path: string[];
  origin: ImpactHypothesis["origin"];
}

export interface MarketReaction {
  node: NodeKey;
  label: string;
  href: string | null;
  r1d: number | null;
  r1w: number | null;
  relativeVolume: number | null;
  asOf: string | null;
  kind: "company" | "group";
}

export interface EventCardVM {
  id: string;
  /** Original representative headline; never replaced by a translation. */
  title: string;
  originalLanguage: string | null;
  originalUrl: string | null;
  source: string | null;
  headline?: import("@/translation/headlines").DisplayHeadline;
  type: EventType;
  typeLabel: string;
  family: EventFamily;
  familyLabel: string;
  secondaryLabels: string[];
  status: NewsEvent["status"];
  summary: string;
  summaryOrigin: NewsEvent["summaryOrigin"];
  firstSeenAt: string;
  lastSeenAt: string;
  articleCount: number;
  independentSources: number;
  official: boolean;
  confidence: NewsEvent["confidence"];
  confidenceLabel: "High" | "Medium" | "Low";
  importance: number;
  contradictory: boolean;
  unconfirmed: boolean;
  languages: string[];
  horizon: Horizon;
  companies: NodeChip[];
  groups: NodeChip[];
  countries: NodeChip[];
  commodities: NodeChip[];
  factors: NodeChip[];
  externals: NodeChip[];
  impacts: ImpactVM[];
  reactions: MarketReaction[];
}

const byConf = (a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence;

function chip(ctx: NewsWebContext, l: EntityLink): NodeChip {
  const parsed = parseNodeKey(l.node);
  const kind = parsed?.kind ?? "factor";
  // Empresas: el chip muestra el ticker; el nombre va en la evidencia (tooltip).
  const company = kind === "company" ? ctx.universe.byCompanyId.get(parsed?.key ?? "") : undefined;
  const security = kind === "security" ? ctx.universe.bySecurityId.get(parsed?.key ?? "") : undefined;
  const label = company?.primaryTicker ?? security?.ticker ?? ctx.label(l.node);
  const evidence = company || security ? `${company?.name ?? security?.company.name} · ${l.evidence}` : l.evidence;
  return { node: l.node, kind, label, href: ctx.href(l.node), relation: l.relation, method: l.method, confidence: l.confidence, evidence };
}

export function impactVM(ctx: NewsWebContext, i: ImpactHypothesis): ImpactVM {
  return {
    target: i.target,
    label: ctx.label(i.target),
    href: ctx.href(i.target),
    kind: parseNodeKey(i.target)?.kind ?? "factor",
    channel: i.channel,
    direction: i.direction,
    directionLabel: directionLabel(i.target, i.direction),
    strength: i.strength,
    horizon: i.horizon,
    confidence: i.confidence,
    mechanism: i.mechanism,
    rationale: i.rationale,
    path: i.path.map((n) => ctx.label(n)),
    origin: i.origin,
  };
}

function dominantHorizon(e: NewsEvent): Horizon {
  const counts = new Map<Horizon, number>();
  for (const i of e.impacts.slice(0, 6)) counts.set(i.horizon, (counts.get(i.horizon) ?? 0) + i.confidence);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? eventTypeDef(e.type).horizon;
}

export function toCardVM(ctx: NewsWebContext, e: NewsEvent, reactions: MarketReaction[] = []): EventCardVM {
  const def = eventTypeDef(e.type);
  const of = (re: RegExp, direct = false) => e.links.filter((l) => re.test(l.node) && (!direct || l.relation === "DIRECT")).sort(byConf).map((l) => chip(ctx, l));
  return {
    id: e.id,
    title: e.title,
    originalLanguage: e.originalLanguage ?? null,
    originalUrl: e.originalUrl ?? null,
    source: e.source ?? null,
    type: e.type,
    typeLabel: def.label,
    family: def.family,
    familyLabel: FAMILY_LABELS[def.family],
    secondaryLabels: e.secondaryTypes.map((t) => eventTypeDef(t).label),
    status: e.status,
    summary: e.summary,
    summaryOrigin: e.summaryOrigin,
    firstSeenAt: e.firstSeenAt,
    lastSeenAt: e.lastSeenAt,
    articleCount: e.articleCount,
    independentSources: e.independentSources,
    official: e.hasOfficialSource,
    confidence: e.confidence,
    confidenceLabel: confidenceLabel(e.confidence.score),
    importance: e.importance,
    contradictory: e.contradictory,
    unconfirmed: e.unconfirmed,
    languages: e.languages,
    horizon: dominantHorizon(e),
    companies: of(/^(company|security):/).filter((c, i, all) => all.findIndex((x) => x.label === c.label) === i),
    groups: of(/^(sector|industry|subIndustry|index):/).filter((c, i, all) => all.findIndex((x) => x.label === c.label) === i),
    countries: of(/^country:/),
    commodities: of(/^commodity:/),
    factors: of(/^factor:/),
    externals: of(/^external:/),
    impacts: e.impacts.map((i) => impactVM(ctx, i)),
    reactions,
  };
}

/** Reacción de mercado REAL de las entidades del evento (empresas directas y grupos directos). */
export async function marketReactions(ctx: NewsWebContext, events: readonly NewsEvent[], perEvent = 4): Promise<Map<string, MarketReaction[]>> {
  const companyIds = new Set<string>();
  const groupNodes = new Set<NodeKey>();
  const picks = new Map<string, { companies: string[]; groups: NodeKey[] }>();
  for (const e of events) {
    const companies = e.links.filter((l) => l.relation === "DIRECT" && l.node.startsWith("company:")).sort(byConf).slice(0, perEvent).map((l) => l.node.slice(8));
    const groups = e.links.filter((l) => /^(sector|industry|subIndustry):/.test(l.node) && (l.relation === "DIRECT" || companies.length === 0)).sort(byConf).slice(0, 2).map((l) => l.node);
    picks.set(e.id, { companies, groups });
    for (const c of companies) companyIds.add(c);
    for (const g of groups) groupNodes.add(g);
  }
  const [snaps, groupRet] = await Promise.all([ctx.snapshots([...companyIds]), ctx.groupReturns([...groupNodes], ["1D", "1W"])]);
  const out = new Map<string, MarketReaction[]>();
  for (const [id, p] of picks) {
    const list: MarketReaction[] = [];
    for (const c of p.companies) {
      const s = snaps.get(c);
      const node = `company:${c}` as NodeKey;
      if (s) list.push({ node, label: ctx.universe.byCompanyId.get(c)?.primaryTicker ?? ctx.label(node), href: ctx.href(node), r1d: s.returns["1D"] ?? null, r1w: s.returns["1W"] ?? null, relativeVolume: s.relativeVolume, asOf: s.asOfDate, kind: "company" });
    }
    for (const g of p.groups) {
      const r = groupRet.get(g);
      if (r) list.push({ node: g, label: ctx.label(g), href: ctx.href(g), r1d: r["1D"] ?? null, r1w: r["1W"] ?? null, relativeVolume: null, asOf: null, kind: "group" });
    }
    out.set(id, list);
  }
  return out;
}

const ROUTINE: ReadonlySet<EventType> = new Set(["MANAGEMENT_CHANGE", "CAPITAL_MARKETS", "CONTRACT_PARTNERSHIP", "OTHER", "ANALYST_RATING"]);

/**
 * ¿El evento es relevante para los nodos? Una coincidencia que SOLO procede de la clasificación GICS de OTRA
 * empresa (el 8-K de Workday "pertenece" a Information Technology) no basta para una ficha de empresa y, en fichas
 * de grupo, solo cuenta si el evento no es rutinario.
 */
export function relevantTo(e: NewsEvent, nodes: ReadonlySet<string>, allowClassification: boolean): boolean {
  if (e.impacts.some((i) => nodes.has(i.target))) return true;
  return e.links.some((l) => nodes.has(l.node) && (l.relation === "DIRECT" || l.method !== "classification" || (allowClassification && !ROUTINE.has(e.type))));
}

/** Puntuación del pulso: importancia con decaimiento temporal (vida media 36 h). */
export function pulseScore(e: NewsEvent, now: Date): number {
  const ageH = Math.max(0, (now.getTime() - Date.parse(e.lastSeenAt)) / 3_600_000);
  return e.importance * Math.pow(0.5, ageH / 36);
}

export interface ThemeCount {
  node: NodeKey;
  label: string;
  href: string | null;
  events: number;
}

export interface WorldPulseData {
  view: PulseView;
  events: EventCardVM[];
  counts: Record<PulseView, number>;
  themes: { countries: ThemeCount[]; commodities: ThemeCount[]; factors: ThemeCount[]; companies: ThemeCount[]; groups: ThemeCount[] };
  byFamily: { family: EventFamily; label: string; events: number }[];
  sources: SourceStatus[];
  runs: IngestRun[];
  totalEvents: number;
  windowDays: number;
  asOf: string | null;
  nodeFilter: { node: NodeKey; label: string } | null;
}

function countNodes(ctx: NewsWebContext, events: readonly NewsEvent[], re: RegExp, limit = 8): ThemeCount[] {
  const counts = new Map<NodeKey, number>();
  for (const e of events) for (const l of e.links) if (re.test(l.node) && l.relation === "DIRECT") counts.set(l.node, (counts.get(l.node) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([node, events]) => ({ node, label: ctx.label(node), href: ctx.href(node), events }));
}

export async function getWorldPulse(repos: Repositories, options: { view: PulseView; now?: Date; windowDays?: number; node?: string | null }): Promise<WorldPulseData> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 7;
  const ctx = await getNewsWebContext(repos);
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const nodeFilter = options.node && parseNodeKey(options.node) ? (options.node as NodeKey) : null;
  const [all, sources, runs] = await Promise.all([
    nodeFilter ? repos.news.eventsForNodes([nodeFilter], { since, limit: 200 }) : repos.news.listEvents({ since, limit: 400, order: "importance" }),
    repos.news.listSourceStatus(),
    repos.news.latestRuns(5),
  ]);
  const ranked = [...all].sort((a, b) => pulseScore(b, now) - pulseScore(a, now));
  const counts = Object.fromEntries(PULSE_VIEWS.map((v) => [v, ranked.filter((e) => inView(e, v)).length])) as Record<PulseView, number>;
  const selected = ranked.filter((e) => inView(e, options.view)).slice(0, 36);
  const reactions = await marketReactions(ctx, selected);
  const families = new Map<EventFamily, number>();
  for (const e of all) families.set(eventTypeDef(e.type).family, (families.get(eventTypeDef(e.type).family) ?? 0) + 1);
  return {
    view: options.view,
    events: selected.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])),
    counts,
    themes: {
      countries: countNodes(ctx, all, /^country:/),
      commodities: countNodes(ctx, all, /^commodity:/),
      factors: countNodes(ctx, all, /^factor:/),
      companies: countNodes(ctx, all, /^company:/, 10),
      groups: countNodes(ctx, all, /^(sector|industry|subIndustry):/),
    },
    byFamily: [...families.entries()].sort((a, b) => b[1] - a[1]).map(([family, events]) => ({ family, label: FAMILY_LABELS[family], events })),
    sources,
    runs,
    totalEvents: all.length,
    windowDays,
    asOf: all.reduce<string | null>((m, e) => (!m || e.lastSeenAt > m ? e.lastSeenAt : m), null),
    nodeFilter: nodeFilter ? { node: nodeFilter, label: ctx.label(nodeFilter) } : null,
  };
}

export interface AffectedGroup {
  impact: ImpactVM;
  /** Empresas del universo bajo el nodo afectado (industria/sector), con su 1D real. */
  companies: { label: string; href: string | null; name: string; r1d: number | null }[];
  groupReturn: { r1d: number | null; r1w: number | null } | null;
}

export interface EventDetailData {
  card: EventCardVM;
  sources: (EventSource & { tierLabel: string })[];
  links: { direct: NodeChip[]; inferred: NodeChip[] };
  impacts: AffectedGroup[];
  related: EventCardVM[];
  aiAnalysis: { model: string; createdAt: string; output: unknown } | null;
}

export async function getEventDetail(repos: Repositories, id: string, now: Date = new Date()): Promise<EventDetailData | null> {
  const found = await repos.news.getEvent(id);
  if (!found) return null;
  const ctx = await getNewsWebContext(repos);
  const { event, sources } = found;
  const reactions = await marketReactions(ctx, [event], 8);
  const card = toCardVM(ctx, event, reactions.get(event.id) ?? []);

  // Empresas afectadas por cada impacto sobre un grupo (reacción real 1D).
  const groupTargets = event.impacts.filter((i) => /^(sector|industry|subIndustry):/.test(i.target)).map((i) => i.target);
  const members = new Map<NodeKey, string[]>();
  for (const t of groupTargets) members.set(t, ctx.graph.companiesUnder(t));
  const allMembers = [...new Set([...members.values()].flat())];
  const [snaps, groupRet] = await Promise.all([ctx.snapshots(allMembers), ctx.groupReturns(groupTargets, ["1D", "1W"])]);
  const impacts: AffectedGroup[] = event.impacts.map((i) => {
    const ids = members.get(i.target) ?? [];
    const companies = ids
      .map((cid) => ({ cid, s: snaps.get(cid), c: ctx.universe.byCompanyId.get(cid) }))
      .filter((x) => x.c)
      .sort((a, b) => (b.s?.marketCap ?? 0) - (a.s?.marketCap ?? 0))
      .slice(0, 8)
      .map((x) => ({ label: x.c?.primaryTicker ?? "", name: x.c?.name ?? "", href: ctx.href(`company:${x.cid}`), r1d: x.s?.returns["1D"] ?? null }));
    const g = groupRet.get(i.target);
    return { impact: impactVM(ctx, i), companies, groupReturn: g ? { r1d: g["1D"] ?? null, r1w: g["1W"] ?? null } : null };
  });

  // Eventos relacionados: comparten ≥ 2 entidades específicas en los últimos 14 días.
  const specific = event.links.filter((l) => l.relation === "DIRECT" && /^(company|commodity|external|subIndustry|industry):/.test(l.node)).map((l) => l.node);
  let related: EventCardVM[] = [];
  if (specific.length) {
    const candidates = await repos.news.eventsForNodes(specific, { since: new Date(now.getTime() - 14 * 86_400_000).toISOString(), limit: 40 });
    related = candidates
      .filter((c) => c.id !== event.id)
      .map((c) => ({ c, shared: c.links.filter((l) => specific.includes(l.node)).length }))
      .filter((x) => x.shared >= Math.min(2, specific.length))
      .sort((a, b) => b.shared - a.shared || b.c.importance - a.c.importance)
      .slice(0, 6)
      .map((x) => toCardVM(ctx, x.c));
  }
  const ai = await repos.news.getAiOutput(`event:${event.id}`, "event_analysis");
  return {
    card,
    sources: sources.map((s) => ({ ...s, tierLabel: TIER_LABELS[s.tier] })),
    links: {
      direct: event.links.filter((l) => l.relation === "DIRECT").sort(byConf).map((l) => chip(ctx, l)),
      inferred: event.links.filter((l) => l.relation === "INFERRED").sort(byConf).map((l) => chip(ctx, l)),
    },
    impacts,
    related,
    aiAnalysis: ai ? { model: ai.model, createdAt: ai.createdAt, output: ai.output } : null,
  };
}

// --- Noticias por entidad ----------------------------------------------------------------------------------

export interface EntityNewsSection {
  id: string;
  title: string;
  description: string;
  events: EventCardVM[];
}

export interface EntityNewsData {
  sections: EntityNewsSection[];
  total: number;
}

async function section(repos: Repositories, ctx: NewsWebContext, id: string, title: string, description: string, nodes: readonly NodeKey[], since: string, exclude: Set<string>, limit: number, filter?: (e: NewsEvent) => boolean): Promise<EntityNewsSection> {
  const set = new Set<string>(nodes);
  const events = nodes.length ? await repos.news.eventsForNodes(nodes, { since, limit: limit * 4 }) : [];
  const picked = events.filter((e) => !exclude.has(e.id) && relevantTo(e, set, false) && (!filter || filter(e))).slice(0, limit);
  for (const e of picked) exclude.add(e.id);
  const reactions = await marketReactions(ctx, picked, 3);
  return { id, title, description, events: picked.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])) };
}

/**
 * Noticias de una empresa en capas: empresa → industria → competidores → cadena de suministro → macro.
 * Cada evento aparece una sola vez (en la capa más cercana).
 */
export async function getCompanyNews(repos: Repositories, companyId: string, options: { days?: number; now?: Date; perSection?: number } = {}): Promise<EntityNewsData> {
  const ctx = await getNewsWebContext(repos);
  const company = ctx.universe.byCompanyId.get(companyId);
  if (!company) return { sections: [], total: 0 };
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.days ?? 14) * 86_400_000).toISOString();
  const per = options.perSection ?? 6;
  const self: NodeKey = `company:${companyId}`;
  const seen = new Set<string>();
  const industryNodes: NodeKey[] = [company.subIndustryCode ? `subIndustry:${company.subIndustryCode}` : null, company.industryCode ? `industry:${company.industryCode}` : null].filter((n): n is NodeKey => !!n);
  const peers = ctx.graph.peersOf(companyId).map((id) => `company:${id}` as NodeKey);
  const supply = [...ctx.graph.incoming(self), ...ctx.graph.outgoing(self)].filter((r) => r.type === "SUPPLIES" || r.type === "EXPOSED_TO").map((r) => (r.from === self ? r.to : r.from));
  const macroFactors = [...new Set([...industryNodes, ...(company.sectorCode ? [`sector:${company.sectorCode}` as NodeKey] : [])].flatMap((n) => ctx.graph.incoming(n).filter((r) => r.type === "DRIVES").map((r) => r.from)))];
  const sections = [
    await section(repos, ctx, "company", "Company", `Events that name ${company.name} directly (or via its SEC filings).`, [self], since, seen, per * 2, (e) => e.links.some((l) => l.node === self && l.relation === "DIRECT")),
    await section(repos, ctx, "industry", "Industry", "Events about its GICS industry / sub-industry.", industryNodes, since, seen, per),
    await section(repos, ctx, "competitors", "Competitors", "Events naming companies in the same GICS sub-industry.", peers, since, seen, per, (e) => e.links.some((l) => peers.includes(l.node) && l.relation === "DIRECT")),
    await section(repos, ctx, "supply_chain", "Supply chain & exposure", "Suppliers, customers and countries the company declares exposure to (10-K / official lists).", supply, since, seen, per),
    await section(repos, ctx, "macro", "Macro & commodities", "Events moving factors or commodities that its industry is sensitive to (curated mechanisms).", macroFactors, since, seen, per),
  ];
  return { sections, total: sections.reduce((n, s) => n + s.events.length, 0) };
}

/** Eventos de un grupo (sector / industria / sub-industria): directos, inferidos por clasificación e impactos. */
export async function getGroupNews(repos: Repositories, nodes: readonly NodeKey[], options: { days?: number; now?: Date; limit?: number } = {}): Promise<EventCardVM[]> {
  const ctx = await getNewsWebContext(repos);
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.days ?? 7) * 86_400_000).toISOString();
  const set = new Set<string>(nodes);
  const events = (await repos.news.eventsForNodes(nodes, { since, limit: (options.limit ?? 8) * 4 })).filter((e) => relevantTo(e, set, !nodes.some((n) => n.startsWith("company:"))));
  const ranked = events.sort((a, b) => pulseScore(b, now) - pulseScore(a, now)).slice(0, options.limit ?? 8);
  const reactions = await marketReactions(ctx, ranked, 3);
  return ranked.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? []));
}

/** Impactos potenciales (de eventos recientes) cuyo destino es uno de los nodos: "World context" del grupo. */
export async function getImpactsOn(repos: Repositories, nodes: readonly NodeKey[], options: { days?: number; now?: Date; limit?: number } = {}): Promise<{ event: EventCardVM; impact: ImpactVM }[]> {
  const ctx = await getNewsWebContext(repos);
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.days ?? 7) * 86_400_000).toISOString();
  const set = new Set(nodes);
  const events = await repos.news.eventsForNodes(nodes, { since, limit: 60 });
  const out: { event: EventCardVM; impact: ImpactVM; score: number }[] = [];
  for (const e of events) {
    for (const i of e.impacts) {
      if (!set.has(i.target)) continue;
      out.push({ event: toCardVM(ctx, e), impact: impactVM(ctx, i), score: i.confidence * i.strength * pulseScore(e, now) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 8).map(({ event, impact }) => ({ event, impact }));
}

/** Eventos de alcance de mercado (para la ficha del índice / dashboard). */
export async function getMarketNews(repos: Repositories, options: { days?: number; now?: Date; limit?: number } = {}): Promise<EventCardVM[]> {
  return getGroupNews(repos, ["index:sp500"], options);
}

/**
 * Contexto de una ficha de grupo o índice: eventos relacionados y posibles impactos.
 *   sector / industria / sub-industria: el nodo GICS y sus hijos (una industria incluye sus sub-industrias).
 *   índice: eventos de alcance de mercado; impactos sobre cualquier sector.
 */
export async function getEntityContext(
  repos: Repositories,
  entity: { kind: "sector" | "industry" | "subIndustry"; code: string } | { kind: "index"; slug: string },
  options: { now?: Date; days?: number } = {},
): Promise<{ events: EventCardVM[]; impacts: { event: EventCardVM; impact: ImpactVM }[]; newsHref: string }> {
  const ctx = await getNewsWebContext(repos);
  let nodes: NodeKey[];
  let impactNodes: NodeKey[];
  if (entity.kind === "index") {
    nodes = [`index:${entity.slug}`];
    impactNodes = [...ctx.universe.sectors.keys()].map((c) => `sector:${c}` as NodeKey);
  } else {
    const self = `${entity.kind}:${entity.code}` as NodeKey;
    const children = new Set<NodeKey>();
    for (const c of ctx.universe.companies) {
      const match = entity.kind === "sector" ? c.sectorCode === entity.code : entity.kind === "industry" ? c.industryCode === entity.code : false;
      if (!match) continue;
      if (entity.kind === "sector" && c.industryCode) children.add(`industry:${c.industryCode}`);
      if (c.subIndustryCode) children.add(`subIndustry:${c.subIndustryCode}`);
    }
    nodes = [self, ...children];
    impactNodes = nodes;
  }
  const [events, impacts] = await Promise.all([getGroupNews(repos, nodes, { ...options, limit: 8 }), getImpactsOn(repos, impactNodes, { ...options, limit: 8 })]);
  return { events, impacts, newsHref: `/news?node=${encodeURIComponent(nodes[0] ?? "")}` };
}
