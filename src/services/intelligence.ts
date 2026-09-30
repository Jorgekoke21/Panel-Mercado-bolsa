import type { NewsEvent } from "@/domain/news";
import type { SecuritySummary } from "@/domain/reference";
import type { TimeRange } from "@/domain/time-range";
import { INTENT_LABELS, type LearnConcept, type ParsedQuestion, parseQuestion } from "@/intelligence/ask-router";
import type { AiStatus } from "@/intelligence/config";
import { type Claim, ContextPack, type EvidenceItem, pct, pctValue } from "@/intelligence/evidence";
import { type CatalystCandidate, explainMove, type MoveExplanation } from "@/intelligence/explain-move";
import { type LearnCard, buildLearnCard } from "@/intelligence/learn";
import { getWebAiRuntime } from "@/intelligence/runtime";
import { askAnswerSchema, type AskAnswerOutput, companyBriefSchema, type CompanyBriefOutput } from "@/intelligence/schemas";
import type { NodeKey } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { buildGazetteer } from "@/news/entities";
import { eventTypeDef } from "@/news/taxonomy";
import { SEC_SOURCE, getValuationView } from "./company-fundamentals";
import { type CompanyHeaderData, getCompanyHeader } from "./companies";
import { attachMarketData, type Repositories } from "./market-rows";
import { getNewsWebContext, type NewsWebContext } from "./news-context";
import { type EventCardVM, type ImpactVM, impactVM, marketReactions, pulseScore, relevantTo, toCardVM } from "./news";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/i18n/messages";
import { eventTypeLabel, mechanismLabel } from "@/i18n/domain";
import { formatDate, formatPercent } from "@/lib/format";
import { classificationLabel } from "@/i18n/classification";
import { moveWithinRange } from "@/i18n/templates";

export const PROMPT_VERSIONS = { ask: "ask-v1", companyBrief: "company-brief-v1", eventAnalysis: "event-analysis-v1" } as const;

const SOURCE_LABEL = "Alpaca (SIP) end-of-day prices, calculated by MarketRadar";

// --- Explain moves: datos de entrada desde la base ----------------------------------------------------------

function scopeOf(e: NewsEvent, companyNode: NodeKey, groups: { sub?: NodeKey; ind?: NodeKey; sec?: NodeKey }): CatalystCandidate["scope"] | null {
  if (e.links.some((l) => l.node === companyNode && l.relation === "DIRECT")) return "company";
  const touches = (n?: NodeKey) => !!n && (e.links.some((l) => l.node === n) || e.impacts.some((i) => i.target === n));
  if (touches(groups.sub) || touches(groups.ind)) return "industry";
  if (touches(groups.sec)) return "sector";
  if (e.links.some((l) => l.node === "index:sp500") || eventTypeDef(e.type).marketWide) return "market";
  return null;
}

function directionFor(e: NewsEvent, targets: NodeKey[]): CatalystCandidate["direction"] {
  const imp = e.impacts.filter((i) => targets.includes(i.target)).sort((a, b) => b.confidence - a.confidence)[0];
  return imp?.direction ?? "mixed_uncertain";
}

export async function getMoveExplanation(repos: Repositories, security: SecuritySummary, range: TimeRange, now: Date = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<MoveExplanation> {
  const ctx = await getNewsWebContext(repos);
  const c = security.classification;
  const companyNode: NodeKey = `company:${security.companyId}`;
  const groups = { sub: c ? (`subIndustry:${c.subIndustry.code}` as NodeKey) : undefined, ind: c ? (`industry:${c.industry.code}` as NodeKey) : undefined, sec: c ? (`sector:${c.sector.code}` as NodeKey) : undefined };
  const groupNodes = [groups.ind, groups.sec, "index:sp500" as NodeKey].filter((n): n is NodeKey => !!n);
  const [snaps, groupRet, filings] = await Promise.all([ctx.snapshots([security.companyId]), ctx.groupReturns(groupNodes, [range]), repos.fundamentals.getFilings(security.companyId)]);
  const snap = snaps.get(security.companyId) ?? null;
  const asOf = snap?.asOfDate ?? now.toISOString().slice(0, 10);
  const windowDays = range === "1D" ? 3 : range === "1W" ? 10 : 40;
  const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - windowDays * 86_400_000).toISOString();
  const nodes = [companyNode, ...[groups.sub, groups.ind, groups.sec].filter((n): n is NodeKey => !!n), "index:sp500" as NodeKey];
  const events = (await repos.news.eventsForNodes(nodes, { since, limit: 80 })).filter((e) => relevantTo(e, new Set<string>(nodes), true));
  const targets = [companyNode, ...[groups.sub, groups.ind, groups.sec].filter((n): n is NodeKey => !!n)];
  const candidates: CatalystCandidate[] = events.flatMap((e) => {
    const scope = scopeOf(e, companyNode, groups);
    if (!scope) return [];
    let direction = directionFor(e, targets);
    if (scope === "company" && direction === "mixed_uncertain" && e.polarity !== 0 && e.links.some((l) => l.node === companyNode && l.subject)) direction = e.polarity > 0 ? "potential_positive" : "potential_negative";
    return [{ eventId: e.id, title: e.title, type: e.type, lastSeenAt: e.lastSeenAt, firstSeenAt: e.firstSeenAt, scope, direction, confidence: e.confidence.score, official: e.hasOfficialSource, sourceLanguage: e.languages.length === 1 ? e.languages[0] : undefined }];
  });
  const periodStart = Date.parse(`${asOf}T00:00:00Z`) - windowDays * 86_400_000;
  return explainMove({
    ticker: security.ticker,
    companyName: security.companyName,
    range,
    asOfDate: asOf,
    securityReturn: snap?.returns[range] ?? null,
    industry: c && groups.ind ? { name: c.industry.name, return: groupRet.get(groups.ind)?.[range] ?? null } : null,
    sector: c && groups.sec ? { name: c.sector.name, return: groupRet.get(groups.sec)?.[range] ?? null } : null,
    market: { name: "S&P 500 constituents (synthetic)", return: groupRet.get("index:sp500")?.[range] ?? null },
    relativeVolume: snap?.relativeVolume ?? null,
    dailyVolatility: snap?.atr14 && snap.price ? snap.atr14 / snap.price : null,
    rsi14: snap?.rsi14 ?? null,
    events: candidates,
    filings: filings
      .filter((f) => f.form.startsWith("8-K") && Date.parse(f.acceptedAt ?? `${f.filingDate}T12:00:00Z`) >= periodStart)
      .map((f) => ({ accession: f.accessionNumber, form: f.form, filedAt: f.acceptedAt ?? `${f.filingDate}T12:00:00Z`, items: f.items, url: null })),
    source: locale === "es" ? "Precios diarios de cierre de Alpaca (SIP), calculados por MarketRadar" : SOURCE_LABEL,
  }, locale);
}

// --- What matters now (ficha de empresa) ---------------------------------------------------------------

export interface ImpactItem extends ImpactVM {
  eventId: string;
  eventTitle: string;
}

export interface CompanyIntelligence {
  ticker: string;
  name: string;
  asOf: string | null;
  headline: string;
  market: { r1d: number | null; r1w: number | null; relativeVolume: number | null; rsi14: number | null; industry: { name: string; r1d: number | null } | null; sector: { name: string; r1d: number | null } | null; market: number | null };
  move1d: MoveExplanation;
  move1w: MoveExplanation;
  events: EventCardVM[];
  eventCount: number;
  themes: { label: string; count: number; href: string | null }[];
  positives: ImpactItem[];
  risks: ImpactItem[];
  uncertain: ImpactItem[];
  fundamentals: { label: string; value: number | null; unit: "percent" | "currency"; asOf: string | null }[];
  claims: Claim[];
  evidence: EvidenceItem[];
  ai: { status: AiStatus; brief: CompanyBriefOutput | null; model: string | null; rejected: number };
}

export async function getCompanyIntelligence(repos: Repositories, header: CompanyHeaderData, now: Date = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<CompanyIntelligence> {
  const ctx = await getNewsWebContext(repos);
  const { security } = header;
  const c = security.classification;
  const companyNode: NodeKey = `company:${security.companyId}`;
  const groupNodes = c ? ([`subIndustry:${c.subIndustry.code}`, `industry:${c.industry.code}`, `sector:${c.sector.code}`] as NodeKey[]) : [];
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [move1d, move1w, events, fundamentals] = await Promise.all([
    getMoveExplanation(repos, security, "1D", now, locale),
    getMoveExplanation(repos, security, "1W", now, locale),
    repos.news.eventsForNodes([companyNode, ...groupNodes], { since, limit: 60 }).then((list) => list.filter((e) => relevantTo(e, new Set<string>([companyNode, ...groupNodes]), false))),
    repos.fundamentals.listFundamentalSnapshots([security.companyId]),
  ]);
  const snap = (await ctx.snapshots([security.companyId])).get(security.companyId) ?? null;
  const ranked = [...events].sort((a, b) => pulseScore(b, now) - pulseScore(a, now));
  const reactions = await marketReactions(ctx, ranked.slice(0, 6), 3);
  const targets = new Set<NodeKey>([companyNode, ...groupNodes]);
  const impacts: ImpactItem[] = ranked.flatMap((e) => e.impacts.filter((i) => targets.has(i.target)).map((i) => ({ ...impactVM(ctx, i), eventId: e.id, eventTitle: e.title })));
  const top = (dir: ImpactItem["direction"]) => impacts.filter((i) => i.direction === dir).sort((a, b) => b.confidence * b.strength - a.confidence * a.strength).slice(0, 5);

  // Temas: factores y materias primas de los eventos + temas propios de la empresa.
  const themeCounts = new Map<string, { label: string; count: number; href: string | null }>();
  for (const e of ranked) {
    for (const l of e.links) {
      if (!/^(factor|commodity|external):/.test(l.node)) continue;
      const cur = themeCounts.get(l.node) ?? { label: ctx.label(l.node), count: 0, href: ctx.href(l.node) };
      cur.count++;
      themeCounts.set(l.node, cur);
    }
  }
  for (const t of header.themes) if (![...themeCounts.values()].some((x) => x.label === t.name)) themeCounts.set(`theme:${t.slug}`, { label: t.name, count: 0, href: null });
  const themes = [...themeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const fs = fundamentals.get(security.companyId);
  const fundamentalsList = fs
    ? [
        { label: "Revenue (TTM)", value: fs.revenueTtm, unit: "currency" as const, asOf: fs.asOfPeriodEnd },
        { label: "Revenue growth (YoY, TTM)", value: fs.metrics.revenue_growth, unit: "percent" as const, asOf: fs.asOfPeriodEnd },
        { label: "Operating margin (TTM)", value: fs.metrics.operating_margin, unit: "percent" as const, asOf: fs.asOfPeriodEnd },
        { label: "Net margin (TTM)", value: fs.metrics.net_margin, unit: "percent" as const, asOf: fs.asOfPeriodEnd },
        { label: "FCF margin (TTM)", value: fs.metrics.fcf_margin, unit: "percent" as const, asOf: fs.asOfPeriodEnd },
        { label: "ROE (TTM)", value: fs.metrics.roe, unit: "percent" as const, asOf: fs.asOfPeriodEnd },
      ]
    : [];

  // Evidencia y afirmaciones deterministas.
  const pack = new ContextPack();
  for (const e of move1d.pack.all()) pack.add(e);
  const claims: Claim[] = [...move1d.claims.filter((cl) => cl.kind !== "UNKNOWN")];
  for (const f of fundamentalsList) {
    if (f.value === null || f.unit !== "percent") continue;
    const id = pack.add({ id: `md:${security.ticker}:${f.label}`, kind: "MARKET_DATA", text: `${security.ticker} ${f.label} ${pct(f.value)} (period ending ${f.asOf}, SEC filings)`, values: [pctValue(f.value)], source: "SEC XBRL, calculated by MarketRadar", asOf: f.asOf ?? undefined });
    claims.push({ text: `${f.label}: ${pct(f.value)} (period ending ${f.asOf}).`, kind: "MARKET_DATA", evidenceIds: [id] });
  }
  for (const i of [...top("potential_positive"), ...top("potential_negative")].slice(0, 6)) {
    const ev = ranked.find((e) => e.id === i.eventId);
    const id = pack.add({ id: `event:${i.eventId}`, kind: ev?.hasOfficialSource ? "FACT" : "SOURCE_CLAIM", text: `${ev ? eventTypeDef(ev.type).label : "Event"}: ${i.eventTitle}`, values: [], source: ev?.hasOfficialSource ? "official source" : "news reports", asOf: ev?.lastSeenAt });
    const rid = pack.add({ id: `inference:${i.eventId}:${i.target}`, kind: "INFERENCE", text: `${i.directionLabel} for ${i.label} via ${i.mechanism} (${i.channel}, ${i.horizon}): ${i.rationale}`, values: [], source: "MarketRadar relationship graph" });
    claims.push({ text: `${i.directionLabel} for ${i.label}: ${i.mechanism} — related to "${i.eventTitle}".`, kind: "INFERENCE", evidenceIds: [id, rid] });
  }

  const r1d = snap?.returns["1D"] ?? null;
  const indRet = move1d.components.industry !== null && move1d.components.sector !== null && move1d.components.market !== null ? move1d.components.industry + move1d.components.sector + move1d.components.market : null;
  const headlineParts = locale === "es"
    ? [r1d !== null ? `${security.ticker} ${formatPercent(r1d, { signed: true, digits: 1 }, locale)} (1D)` : `${security.ticker}: sin datos reales de precios`]
    : [r1d !== null ? `${security.ticker} ${pct(r1d)} (1D)` : `${security.ticker}: no real price data`];
  if (c && indRet !== null) headlineParts.push(locale === "es" ? `frente a ${classificationLabel(locale, c.industry.name)} ${formatPercent(indRet, { digits: 1 }, locale)}` : `vs ${c.industry.name} ${pct(indRet)}`);
  headlineParts.push(locale === "es" ? `${ranked.length} ${ranked.length === 1 ? "evento relacionado" : "eventos relacionados"} en 7 días` : `${ranked.length} related event${ranked.length === 1 ? "" : "s"} in 7 days`);
  if (themes[0]) headlineParts.push(`${locale === "es" ? "temas principales" : "main themes"}: ${themes.slice(0, 3).map((t) => classificationLabel(locale, t.label)).join(", ")}`);

  // IA opcional (ficha breve) — solo con evidencia del pack.
  const runtime = getWebAiRuntime();
  const status = runtime.status("company_brief");
  let brief: CompanyBriefOutput | null = null;
  let model: string | null = null;
  let rejected = 0;
  if (status.remoteEnabled) {
    const res = await runtime.run({
      feature: "company_brief",
      locale,
      task: "company_brief",
      subject: companyNode,
      promptVersion: PROMPT_VERSIONS.companyBrief,
      schemaName: "company_brief",
      schema: companyBriefSchema,
      instructions: locale === "es" ? `Redacta en español un resumen breve de lo más importante ahora para ${security.companyName} (${security.ticker}), usando solo la evidencia.` : `Write a short 'what matters now' brief for ${security.companyName} (${security.ticker}) from the evidence only.`,
      input: { ticker: security.ticker, company: security.companyName, industry: c?.industry.name ?? null },
      pack,
      tier: "deep",
      claimsOf: (o) => [...o.claims, ...o.potential_positives, ...o.potential_risks].map((x) => ({ text: x.text, kind: x.kind, evidenceIds: x.evidence_ids })),
      ttlHours: 12,
    });
    if (res) {
      brief = res.output;
      model = res.model;
      rejected = res.grounding.rejected.length;
    }
  }

  return {
    ticker: security.ticker,
    name: security.companyName,
    asOf: snap?.asOfDate ?? null,
    headline: `${headlineParts.join(" · ")}.`,
    market: {
      r1d,
      r1w: snap?.returns["1W"] ?? null,
      relativeVolume: snap?.relativeVolume ?? null,
      rsi14: snap?.rsi14 ?? null,
      industry: c ? { name: c.industry.name, r1d: indRet } : null,
      sector: c && move1d.components.sector !== null && move1d.components.market !== null ? { name: c.sector.name, r1d: move1d.components.sector + move1d.components.market } : null,
      market: move1d.components.market,
    },
    move1d,
    move1w,
    events: ranked.slice(0, 6).map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])),
    eventCount: ranked.length,
    themes,
    positives: top("potential_positive"),
    risks: top("potential_negative"),
    uncertain: top("mixed_uncertain").slice(0, 3),
    fundamentals: fundamentalsList,
    claims,
    evidence: pack.all(),
    ai: { status, brief, model, rejected },
  };
}

// --- Learning mode ---------------------------------------------------------------------------------------

export const LEARN_CONCEPTS: { concept: LearnConcept; label: string }[] = [
  { concept: "pe", label: "What is P/E?" },
  { concept: "fcf_yield", label: "What is FCF yield?" },
  { concept: "rsi", label: "What is RSI?" },
  { concept: "relative_volume", label: "Relative volume" },
  { concept: "revenue_growth", label: "Revenue growth" },
  { concept: "operating_margin", label: "Operating margin" },
  { concept: "roe", label: "ROE" },
  { concept: "sma200", label: "200-day average" },
  { concept: "range_52w", label: "52-week range" },
  { concept: "eps", label: "EPS" },
];

export async function getLearnCard(repos: Repositories, header: CompanyHeaderData, concept: LearnConcept, locale: Locale = DEFAULT_LOCALE): Promise<LearnCard> {
  const { security } = header;
  const valuation = await getValuationView(repos, security, header.realMarketData);
  const eps = concept === "eps" ? await repos.fundamentals.getLatestValue(security.companyId, SEC_SOURCE, "eps_diluted", "annual") : null;
  const card = buildLearnCard({
    concept,
    ticker: security.ticker,
    companyName: security.companyName,
    currency: security.currency,
    snapshot: header.realMarketData?.snapshot ?? null,
    ratios: valuation.ratios,
    asOf: valuation.price?.date ?? null,
    priceSource: SOURCE_LABEL,
    eps: eps?.value !== null && eps?.value !== undefined ? { value: eps.value, periodEnd: eps.fiscalPeriodEnd } : null,
  });
  return localizeLearnCard(card, locale);
}

// --- Ask MarketRadar -------------------------------------------------------------------------------------

export type AskBlock =
  | { kind: "move"; title: string; move: MoveExplanation; href: string | null }
  | { kind: "events"; title: string; events: EventCardVM[] }
  | { kind: "table"; title: string; columns: string[]; rows: { cells: (string | number | null)[]; href?: string | null; formats?: ("pct" | "num" | "text" | "money" | "ratio")[] }[]; note?: string }
  | { kind: "learn"; card: LearnCard; ticker: string }
  | { kind: "impacts"; title: string; items: ImpactItem[] };

export interface AskResult {
  question: string;
  parsed: ParsedQuestion;
  intentLabel: string;
  resolved: { node: string; label: string; href: string | null }[];
  answer: { text: string; origin: "deterministic" | "ai"; model: string | null };
  claims: Claim[];
  blocks: AskBlock[];
  evidence: EvidenceItem[];
  unknowns: string[];
  suggestions: string[];
  ai: { status: AiStatus; skipped: string | null; rejectedClaims: number };
}

export const ASK_EXAMPLES = [
  "¿Por qué está cayendo NVIDIA?",
  "¿Qué está pasando con los mineros de cobre?",
  "¿Qué noticias están afectando a Technology?",
  "¿Qué empresas del S&P 500 están relacionadas con el aumento de demanda eléctrica por IA?",
  "¿Qué ha cambiado hoy en mi mercado?",
  "¿Por qué PLTR está subiendo más que su sector?",
  "¿Qué empresas están cerca de máximos de 52 semanas y además tienen crecimiento de revenue?",
  "Compara NVDA, AMD y AVGO.",
  "What is P/E? (AAPL)",
];

function localizeLearnCard(card: LearnCard, locale: Locale): LearnCard {
  if (locale === "en") return card;
  const copy: Record<LearnConcept, Pick<LearnCard, "title" | "definition" | "formula" | "howToRead" | "caveat">> = {
    pe: { title: "P/E (precio/beneficio)", definition: "Cuántos dólares pagan hoy los inversores por cada dólar de beneficio anual de la empresa.", formula: "Capitalización bursátil / beneficio neto de los últimos 12 meses (equivalente a precio / BPA)", howToRead: "Un P/E alto puede reflejar expectativas de crecimiento o menor riesgo. Compáralo con su historial y con empresas similares.", caveat: "Con beneficios negativos o muy bajos, el P/E no es significativo. Los ingresos o gastos extraordinarios lo distorsionan." },
    fcf_yield: { title: "Rentabilidad del flujo de caja libre", definition: "Flujo de caja libre generado durante el último año respecto al valor actual de toda la empresa.", formula: "(Flujo de caja operativo − inversión en capital) de los últimos 12 meses / capitalización bursátil", howToRead: "Una rentabilidad mayor significa más efectivo generado por cada unidad de valor de mercado. Es el inverso del múltiplo precio/FCF.", caveat: "El calendario de inversiones hace que el FCF sea irregular; este método no se aplica a bancos y aseguradoras." },
    rsi: { title: "RSI 14 (índice de fuerza relativa)", definition: "Oscilador de impulso de 0 a 100 que compara las ganancias y pérdidas recientes de 14 sesiones.", formula: "100 − 100 / (1 + ganancia media / pérdida media), 14 sesiones (suavizado de Wilder)", howToRead: "Por encima de 70 suele llamarse sobrecompra y por debajo de 30, sobreventa. Describe el impulso reciente, no el valor.", caveat: "Una tendencia fuerte puede permanecer mucho tiempo por encima de 70 o por debajo de 30." },
    market_cap: { title: "Capitalización bursátil", definition: "Valor de mercado total de las acciones de una empresa.", formula: "Precio por acción × acciones en circulación (por clase de acción)", howToRead: "Se usa para medir el tamaño de las empresas y ponderar índices por capitalización.", caveat: "MarketRadar solo muestra capitalizaciones verificadas; el número de acciones se contrasta con informes de la SEC." },
    relative_volume: { title: "Volumen relativo", definition: "Volumen negociado en la última sesión frente a su nivel habitual.", formula: "Volumen de la última sesión / volumen medio de las 20 sesiones anteriores", howToRead: "Un valor por encima de ~2× puede señalar interés inusual. No indica la dirección del movimiento.", caveat: "Los rebalanceos de índices y los vencimientos de opciones pueden elevar el volumen sin noticias de empresa." },
    revenue_growth: { title: "Crecimiento de ingresos", definition: "Velocidad a la que crecen las ventas respecto al mismo periodo del año anterior.", formula: "Ingresos del periodo / ingresos del mismo periodo del año anterior − 1", howToRead: "Un crecimiento sostenido suele respaldar valoraciones mayores; su desaceleración también puede ser relevante.", caveat: "Las adquisiciones y el efecto de las divisas pueden aumentar o reducir el crecimiento publicado." },
    operating_margin: { title: "Margen operativo", definition: "Parte de los ingresos que queda tras los costes operativos, antes de intereses e impuestos.", formula: "Resultado operativo / ingresos", howToRead: "Un margen mayor puede indicar más poder de fijación de precios o eficiencia. Compáralo dentro de la misma industria.", caveat: "No es comparable para bancos, que tienen una estructura de cuenta de resultados distinta." },
    roe: { title: "ROE (rentabilidad sobre patrimonio)", definition: "Beneficio generado por cada dólar de patrimonio neto de los accionistas.", formula: "Beneficio neto (TTM) / patrimonio neto medio", howToRead: "Un ROE alto puede indicar un negocio sólido o simplemente mucho apalancamiento; revisa también la deuda.", caveat: "Las recompras reducen el patrimonio y pueden elevar el ROE; con patrimonio negativo deja de ser significativo." },
    sma200: { title: "Media móvil de 200 días", definition: "Precio medio de cierre de las últimas 200 sesiones; una línea de tendencia lenta.", formula: "Media de los últimos 200 cierres", howToRead: "Un precio por encima de una SMA 200 ascendente suele interpretarse como tendencia alcista de largo plazo.", caveat: "Es un indicador rezagado: confirma tendencias, no las predice." },
    range_52w: { title: "Rango de 52 semanas", definition: "Precio mínimo y máximo de las últimas 52 semanas.", formula: "Mínimo / máximo de los cierres durante 52 semanas", howToRead: "La posición del precio dentro del rango aporta contexto rápido sobre la tendencia del último año.", caveat: "Se basa en cierres ajustados por desdoblamientos, no en extremos intradía." },
    eps: { title: "BPA (beneficio por acción)", definition: "Beneficio neto atribuible a cada acción.", formula: "Beneficio neto atribuible a ordinarias / media ponderada de acciones diluidas", howToRead: "El crecimiento del BPA es lo que sostiene el precio de la acción a largo plazo.", caveat: "MarketRadar usa BPA diluido publicado en informes SEC; el BPA ajustado (no GAAP) es distinto." },
  };
  return { ...card, ...copy[card.concept] };
}

function localizeAskBlocks(blocks: AskBlock[], locale: Locale): AskBlock[] {
  if (locale === "en") return blocks;
  const titleMap: Record<string, string> = {
    "Recent company events": "Eventos recientes de la empresa", "Possibly related events": "Eventos posiblemente relacionados", Events: "Eventos", "Potential impacts on the entity": "Impactos potenciales en la entidad",
    "S&P 500 companies in related industries (graph relationships, not predictions)": "Empresas del S&P 500 en industrias relacionadas (relaciones del grafo, no predicciones)", "Recent events about the theme": "Eventos recientes sobre el tema", "Sectors — last session (MarketRadar synthetic indices)": "Sectores — última sesión (índices sintéticos de MarketRadar)", "Top events (last 36 h)": "Eventos destacados (últimas 36 h)", "Within 3% of the 52-week high AND positive revenue growth (YoY, TTM)": "A menos del 3 % del máximo de 52 semanas Y con crecimiento positivo de ingresos (interanual, TTM)", "Side by side (MarketRadar data)": "Comparación (datos de MarketRadar)", "Valuation (TTM, SEC + verified market cap)": "Valoración (TTM, SEC + capitalización verificada)", "Recent events": "Eventos recientes",
  };
  const columnMap: Record<string, string> = { Company: "Empresa", Industry: "Industria", Relationship: "Relación", Path: "Ruta", "Market cap": "Capitalización", Sector: "Sector", Ticker: "Ticker", Price: "Precio", "vs 52W high": "vs máximo 52 sem.", "Revenue growth": "Crecimiento de ingresos", "Operating margin": "Margen operativo", Events: "Eventos", "FCF yield": "Rentabilidad FCF", "1D": "1D", "1M": "1M", YTD: "YTD", "1Y": "1A", "P/E": "P/E", "RSI 14": "RSI 14" };
  const noteMap: Record<string, string> = {
    "Relationships come from MarketRadar's curated mechanism graph (see each path). Sign '+' = tends to benefit when the driver rises; '−' = tends to be hurt; '±' = mixed.": "Las relaciones proceden del grafo de mecanismos de MarketRadar (consulta cada ruta). El signo '+' indica beneficio potencial si sube el factor; '−', perjuicio potencial; '±', efecto mixto.",
    "Screen on MarketRadar data: split-adjusted closes (Alpaca) and SEC XBRL fundamentals. Criteria: close ≥ 97% of the 52-week high; revenue growth > 0.": "Filtro con datos de MarketRadar: cierres ajustados por desdoblamientos (Alpaca) y fundamentales SEC XBRL. Criterios: cierre ≥ 97 % del máximo de 52 semanas y crecimiento de ingresos > 0.",
    "Market cap only when VERIFIED. Fundamentals from SEC XBRL (TTM).": "La capitalización solo se muestra si está VERIFICADA. Fundamentales SEC XBRL (TTM).",
  };
  return blocks.map((block) => {
    if (block.kind === "learn") return { ...block, card: localizeLearnCard(block.card, locale) };
    if (block.kind === "move") return { ...block, title: block.title.replace("Explain move", "Explicación del movimiento") };
    if (block.kind === "table") return { ...block, title: titleMap[block.title] ?? block.title, columns: block.columns.map((column) => columnMap[column] ?? column), note: block.note ? noteMap[block.note] ?? block.note : undefined };
    return { ...block, title: titleMap[block.title] ?? block.title };
  });
}

export function summaryOfMove(m: MoveExplanation, name: string, locale: Locale): string {
  const value = (number: number) => formatPercent(number, { signed: true, digits: 1 }, locale);
  const date = formatDate(m.asOfDate, locale);
  if (m.securityReturn === null) return locale === "es" ? `No hay datos de precios reales para ${name}.` : `No real price data for ${name}.`;
  if (locale === "es") {
    const dailyRange = m.driver === "no_unusual_move" ? moveWithinRange(locale) : m.driver === "insufficient_data" ? "No hay datos suficientes para evaluar si el movimiento es inusual." : "El movimiento supera su rango diario habitual.";
    const verdict = m.verdict === "No clear news catalyst found" ? "No se encontró un catalizador claro en las fuentes de MarketRadar." : m.verdict === "No unusual move" ? "" : `${m.verdict === "Likely related" ? "Posible relación" : "Posible relación"} con: ${m.catalysts[0]?.title ?? "evento reciente"}.`;
    return `${m.ticker} ${value(m.securityReturn)} (${m.range}, sesión ${date}). ${dailyRange} ${verdict}`.replace(/\s+/g, " ").trim();
  }
  const driver = m.driver === "no_unusual_move" ? moveWithinRange(locale) : m.driver === "insufficient_data" ? "There is not enough data to assess whether the move is unusual." : `The move looks ${m.driver.replace("_", "-").replace("_", " ")}.`;
  const verdict = m.verdict === "No clear news catalyst found" ? "No clear news catalyst found in MarketRadar's sources." : m.verdict === "No unusual move" ? "" : `${m.verdict}: ${m.catalysts[0]?.title ?? ""}.`;
  return `${m.ticker} ${value(m.securityReturn)} (${m.range}, session ${date}). ${driver} ${verdict}`.replace(/\s+/g, " ").trim();
}

export async function askMarketRadar(repos: Repositories, question: string, now: Date = new Date(), locale: Locale = DEFAULT_LOCALE): Promise<AskResult> {
  const messages = getMessages(locale);
  const ctx = await getNewsWebContext(repos);
  const parsed = parseQuestion(question, buildGazetteer(ctx.universe), ctx.universe);
  const pack = new ContextPack();
  const claims: Claim[] = [];
  const blocks: AskBlock[] = [];
  const unknowns: string[] = [];
  let text = "";
  const sec = (companyId: string) => ctx.securities.find((s) => s.companyId === companyId && s.isPrimary) ?? ctx.securities.find((s) => s.companyId === companyId);
  const resolved = [...parsed.companies.map((id) => `company:${id}`), ...parsed.nodes].map((node) => ({ node, label: ctx.label(node), href: ctx.href(node) }));
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const addMove = (m: MoveExplanation) => {
    for (const e of m.pack.all()) pack.add(e);
    claims.push(...m.claims);
  };

  switch (parsed.intent) {
    case "why_move":
    case "relative_move": {
      if (parsed.companies.length) {
        for (const id of parsed.companies.slice(0, 3)) {
          const s = sec(id);
          if (!s) continue;
          const m = await getMoveExplanation(repos, s, parsed.range, now, locale);
          addMove(m);
          blocks.push({ kind: "move", title: `${s.ticker} · ${parsed.range}`, move: m, href: ctx.href(`company:${id}`) });
          text += `${summaryOfMove(m, s.companyName, locale)} `;
          if (parsed.intent === "relative_move" && m.components.idiosyncratic !== null) text += locale === "es" ? `Rendimiento excedente frente a su industria: ${formatPercent(m.components.idiosyncratic, { digits: 1 }, locale)}. ` : `Excess return vs its industry: ${formatPercent(m.components.idiosyncratic, { digits: 1 }, locale)}. `;
          if (parsed.direction && m.securityReturn !== null && Math.sign(m.securityReturn) !== (parsed.direction === "up" ? 1 : -1)) {
            text += locale === "es" ? `Nota: en los últimos datos de MarketRadar, ${s.ticker} ${m.securityReturn >= 0 ? "sube" : "baja"}, no ${parsed.direction === "up" ? "sube" : "baja"}. ` : `Note: in MarketRadar's latest data ${s.ticker} is ${m.securityReturn >= 0 ? "up" : "down"}, not ${parsed.direction === "up" ? "rising" : "falling"}. `;
          }
        }
        const events = await repos.news.eventsForNodes(parsed.companies.map((id) => `company:${id}` as NodeKey), { since: since7, limit: 6 });
        const reactions = await marketReactions(ctx, events, 3);
        if (events.length) blocks.push({ kind: "events", title: "Recent company events", events: events.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])) });
      } else {
        const groups = parsed.nodes.filter((n) => /^(sector|industry|subIndustry)$/.test(parseNodeKey(n)?.kind ?? ""));
        const rets = await ctx.groupReturns(groups, [parsed.range]);
        for (const g of groups) {
          const r = rets.get(g)?.[parsed.range] ?? null;
          if (r === null) continue;
          const groupLabel = classificationLabel(locale, ctx.label(g));
          const returnText = formatPercent(r, { signed: true, digits: 1 }, locale);
          const indexDescription = locale === "es" ? "índice sintético ponderado por capitalización de MarketRadar" : "MarketRadar synthetic cap-weighted index";
          const id = pack.add({ id: `md:${g}:${parsed.range}`, kind: "MARKET_DATA", text: `${groupLabel} (${indexDescription}) ${parsed.range} ${returnText}`, values: [pctValue(r)], source: locale === "es" ? "Índice sintético de MarketRadar" : "MarketRadar synthetic index" });
          claims.push({ text: locale === "es" ? `${groupLabel}: ${returnText} (${parsed.range}, índice sintético ponderado por capitalización).` : `${groupLabel} ${returnText} (${parsed.range}, synthetic cap-weighted index).`, kind: "MARKET_DATA", evidenceIds: [id] });
          text += locale === "es" ? `${ctx.label(g)} ${formatPercent(r, { digits: 1 }, locale)} (${parsed.range}). ` : `${ctx.label(g)} ${formatPercent(r, { digits: 1 }, locale)} (${parsed.range}). `;
        }
        const events = (await repos.news.eventsForNodes(groups, { since: since7, limit: 8 })).sort((a, b) => pulseScore(b, now) - pulseScore(a, now));
        if (events.length) blocks.push({ kind: "events", title: "Possibly related events", events: events.map((e) => toCardVM(ctx, e)) });
        else unknowns.push(locale === "es" ? "No se encontraron eventos relacionados en los últimos 7 días." : "No related events found in the last 7 days.");
      }
      break;
    }
    case "entity_news": {
      const nodes = [...parsed.companies.map((id) => `company:${id}` as NodeKey), ...parsed.nodes];
      const events = (await repos.news.eventsForNodes(nodes, { since: since7, limit: 30 })).sort((a, b) => pulseScore(b, now) - pulseScore(a, now)).slice(0, 8);
      const reactions = await marketReactions(ctx, events, 3);
      text = locale === "es"
        ? events.length ? `${events.length} ${events.length === 1 ? "evento reciente relacionado con" : "eventos recientes relacionados con"} ${resolved.map((r) => r.label).join(", ")} (últimos 7 días). ` : `No hay eventos relacionados con ${resolved.map((r) => r.label).join(", ")} en los últimos 7 días. `
        : events.length ? `${events.length} recent event${events.length === 1 ? "" : "s"} related to ${resolved.map((r) => r.label).join(", ")} (last 7 days). ` : `No events related to ${resolved.map((r) => r.label).join(", ")} in the last 7 days. `;
      for (const e of events.slice(0, 5)) {
        const eventLabel = eventTypeLabel(locale, e.type);
        const sourceCount = locale === "es" ? `${e.independentSources} ${e.independentSources === 1 ? "fuente" : "fuentes"}` : `${e.independentSources} source${e.independentSources === 1 ? "" : "s"}`;
        const id = pack.add({ id: `event:${e.id}`, kind: e.hasOfficialSource ? "FACT" : "SOURCE_CLAIM", text: `${eventLabel}: ${e.title} (${sourceCount})`, values: [], source: e.hasOfficialSource ? locale === "es" ? "fuente oficial" : "official source" : locale === "es" ? "medios de comunicación" : "news reports", asOf: e.lastSeenAt });
        claims.push({ text: `${eventLabel}: ${e.title}`, kind: e.hasOfficialSource ? "FACT" : "SOURCE_CLAIM", evidenceIds: [id], sourceLanguage: e.languages.length === 1 ? e.languages[0] : undefined });
      }
      if (events.length) blocks.push({ kind: "events", title: "Events", events: events.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])) });
      const set = new Set(nodes);
      const items: ImpactItem[] = events.flatMap((e) => e.impacts.filter((i) => set.has(i.target)).map((i) => ({ ...impactVM(ctx, i), eventId: e.id, eventTitle: e.title })));
      if (items.length) blocks.push({ kind: "impacts", title: "Potential impacts on the entity", items: items.slice(0, 8) });
      const groups = nodes.filter((n) => /^(sector|industry|subIndustry|index)$/.test(parseNodeKey(n)?.kind ?? ""));
      const rets = await ctx.groupReturns(groups, ["1D", "1W"]);
      for (const g of groups) {
        const r = rets.get(g);
        if (!r) continue;
        const groupLabel = classificationLabel(locale, ctx.label(g));
        const day = formatPercent(r["1D"], { signed: true, digits: 1 }, locale);
        const week = formatPercent(r["1W"], { signed: true, digits: 1 }, locale);
        const id = pack.add({ id: `md:${g}:1D`, kind: "MARKET_DATA", text: locale === "es" ? `${groupLabel} (índice sintético de MarketRadar) 1D ${day}, 1W ${week}` : `${groupLabel} (MarketRadar synthetic index) 1D ${day}, 1W ${week}`, values: [r["1D"] ?? 0, r["1W"] ?? 0].map((v) => pctValue(v)), source: locale === "es" ? "Índice sintético de MarketRadar" : "MarketRadar synthetic index" });
        claims.unshift({ text: locale === "es" ? `${groupLabel}: 1D ${day}, 1W ${week}.` : `${groupLabel}: 1D ${day}, 1W ${week}.`, kind: "MARKET_DATA", evidenceIds: [id] });
      }
      break;
    }
    case "theme_exposure": {
      const origins = parsed.nodes.filter((n) => /^(factor|commodity|external)$/.test(parseNodeKey(n)?.kind ?? ""));
      // Recorrido del grafo (≤ 2 saltos) desde el factor/materia prima a industrias con relación positiva o mixta.
      const reached = new Map<NodeKey, { path: string[]; sign: number; mechanism: string; confidence: number }>();
      const queue: { node: NodeKey; path: string[]; sign: number; conf: number; depth: number }[] = origins.map((o) => ({ node: o, path: [ctx.label(o)], sign: 1, conf: 1, depth: 0 }));
      while (queue.length) {
        const cur = queue.shift();
        if (!cur || cur.depth >= 2) continue;
        for (const r of ctx.graph.outgoing(cur.node)) {
          if (r.type !== "DRIVES") continue;
          const sign = cur.sign * r.sign;
          const conf = cur.conf * r.confidence;
          const path = [...cur.path, ctx.label(r.to)];
          if (/^(sector|industry|subIndustry):/.test(r.to)) {
            const prev = reached.get(r.to);
            if (!prev || prev.confidence < conf) reached.set(r.to, { path, sign, mechanism: r.mechanism ?? "", confidence: conf });
          } else queue.push({ node: r.to, path, sign, conf, depth: cur.depth + 1 });
        }
      }
      const groupList = [...reached.entries()].sort((a, b) => b[1].confidence - a[1].confidence).slice(0, 10);
      const companyIds = [...new Set(groupList.flatMap(([g]) => ctx.graph.companiesUnder(g)))];
      const snaps = await ctx.snapshots(companyIds);
      const rows: AskBlock & { kind: "table" } = { kind: "table", title: "S&P 500 companies in related industries (graph relationships, not predictions)", columns: ["Company", "Industry", "Relationship", "Path", "1D", "Market cap"], rows: [], note: "Relationships come from MarketRadar's curated mechanism graph (see each path). Sign '+' = tends to benefit when the driver rises; '−' = tends to be hurt; '±' = mixed." };
      for (const [g, info] of groupList) {
        const members = ctx.graph.companiesUnder(g).map((id) => ({ id, s: snaps.get(id) })).sort((a, b) => (b.s?.marketCap ?? 0) - (a.s?.marketCap ?? 0)).slice(0, 5);
        const path = info.path.map((label) => classificationLabel(locale, label));
        const signLabel = locale === "es" ? info.sign > 0 ? "posible beneficiario" : info.sign < 0 ? "posible perjudicado" : "efecto mixto" : info.sign > 0 ? "potential beneficiary" : info.sign < 0 ? "potentially hurt" : "mixed";
        const relationGraph = locale === "es" ? "grafo de relaciones de MarketRadar" : "MarketRadar relationship graph";
        const mechanism = mechanismLabel(locale, info.mechanism);
        const gid = pack.add({ id: `inference:${g}`, kind: "INFERENCE", text: `${path.join(" → ")} (${mechanism}, ${locale === "es" ? "signo" : "sign"} ${info.sign > 0 ? "+" : info.sign < 0 ? "−" : "±"})`, values: [], source: relationGraph });
        claims.push({ text: `${classificationLabel(locale, ctx.label(g))}: ${path.join(" → ")} (${signLabel}).`, kind: "INFERENCE", evidenceIds: [gid] });
        for (const m of members) {
          const uc = ctx.universe.byCompanyId.get(m.id);
          rows.rows.push({ cells: [uc?.primaryTicker ?? "", ctx.label(g), info.sign > 0 ? "+" : info.sign < 0 ? "−" : "±", info.path.join(" → "), m.s?.returns["1D"] ?? null, m.s?.marketCap ?? null], href: ctx.href(`company:${m.id}`), formats: ["text", "text", "text", "text", "pct", "money"] });
        }
      }
      if (rows.rows.length) blocks.push(rows);
      const events = (await repos.news.eventsForNodes(origins, { since: since7, limit: 20 })).sort((a, b) => pulseScore(b, now) - pulseScore(a, now)).slice(0, 6);
      if (events.length) blocks.push({ kind: "events", title: "Recent events about the theme", events: events.map((e) => toCardVM(ctx, e)) });
      text = locale === "es"
        ? groupList.length ? `${groupList.length} industrias GICS están relacionadas con ${origins.map((o) => ctx.label(o)).join(", ")} en el grafo de relaciones de MarketRadar; abajo se muestran ${rows.rows.length} empresas del S&P 500 con su variación real de 1D.` : `MarketRadar aún no tiene relaciones definidas para ${origins.map((o) => ctx.label(o)).join(", ") || "este tema"}.`
        : groupList.length ? `${groupList.length} GICS industries are linked to ${origins.map((o) => ctx.label(o)).join(", ")} in MarketRadar's relationship graph; ${rows.rows.length} S&P 500 companies listed below with their real 1D moves.` : `MarketRadar has no curated relationships for ${origins.map((o) => ctx.label(o)).join(", ") || "this theme"} yet.`;
      if (!origins.length) unknowns.push(locale === "es" ? "No se reconoció ningún factor o materia prima en la pregunta." : "No factor or commodity recognised in the question.");
      break;
    }
    case "market_today": {
      const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
      const events = (await repos.news.listEvents({ since, limit: 120 })).sort((a, b) => pulseScore(b, now) - pulseScore(a, now)).slice(0, 8);
      const sectorNodes = [...ctx.universe.sectors.keys()].map((code) => `sector:${code}` as NodeKey);
      const rets = await ctx.groupReturns(["index:sp500", ...sectorNodes], ["1D"]);
      const idx = rets.get("index:sp500")?.["1D"] ?? null;
      if (idx !== null) {
        const label = locale === "es" ? "Componentes del S&P 500" : "S&P 500 constituents";
        const synthetic = locale === "es" ? "ponderados por capitalización, sintéticos de MarketRadar" : "MarketRadar synthetic cap-weighted";
        const value = formatPercent(idx, { signed: true, digits: 1 }, locale);
        const id = pack.add({ id: "md:sp500:1D", kind: "MARKET_DATA", text: `${label} (${synthetic}) 1D ${value}`, values: [pctValue(idx)], source: locale === "es" ? "Índice sintético de MarketRadar" : "MarketRadar synthetic index" });
        claims.push({ text: locale === "es" ? `${label} (sintéticos): ${value} en la última sesión.` : `${label} (synthetic): ${value} in the last session.`, kind: "MARKET_DATA", evidenceIds: [id] });
      }
      const sectors = sectorNodes.map((n) => ({ n, r: rets.get(n)?.["1D"] ?? null })).filter((x): x is { n: NodeKey; r: number } => x.r !== null).sort((a, b) => b.r - a.r);
      const best = sectors[0];
      const worst = sectors.at(-1);
      if (best && worst) {
        const bestName = classificationLabel(locale, ctx.label(best.n));
        const worstName = classificationLabel(locale, ctx.label(worst.n));
        const bestReturn = formatPercent(best.r, { signed: true, digits: 1 }, locale);
        const worstReturn = formatPercent(worst.r, { signed: true, digits: 1 }, locale);
        const id = pack.add({ id: "md:sectors:1D", kind: "MARKET_DATA", text: locale === "es" ? `Sectores 1D (sintéticos): mejor ${bestName} ${bestReturn}, peor ${worstName} ${worstReturn}` : `Sector 1D (synthetic): best ${bestName} ${bestReturn}, worst ${worstName} ${worstReturn}`, values: [pctValue(best.r), pctValue(worst.r)], source: locale === "es" ? "Índice sintético de MarketRadar" : "MarketRadar synthetic index" });
        claims.push({ text: locale === "es" ? `Mejor sector: ${bestName} ${bestReturn}; peor: ${worstName} ${worstReturn}.` : `Best sector: ${bestName} ${bestReturn}; worst: ${worstName} ${worstReturn}.`, kind: "MARKET_DATA", evidenceIds: [id] });
      }
      blocks.push({ kind: "table", title: "Sectors — last session (MarketRadar synthetic indices)", columns: ["Sector", "1D"], rows: sectors.map((s) => ({ cells: [ctx.label(s.n), s.r], href: ctx.href(s.n), formats: ["text", "pct"] })) });
      for (const e of events.slice(0, 5)) {
        const eventLabel = eventTypeLabel(locale, e.type);
        const id = pack.add({ id: `event:${e.id}`, kind: e.hasOfficialSource ? "FACT" : "SOURCE_CLAIM", text: `${eventLabel}: ${e.title}`, values: [], source: e.hasOfficialSource ? locale === "es" ? "fuente oficial" : "official source" : locale === "es" ? "medios de comunicación" : "news reports", asOf: e.lastSeenAt });
        claims.push({ text: `${eventLabel}: ${e.title}`, kind: e.hasOfficialSource ? "FACT" : "SOURCE_CLAIM", evidenceIds: [id], sourceLanguage: e.languages.length === 1 ? e.languages[0] : undefined });
      }
      const reactions = await marketReactions(ctx, events, 3);
      if (events.length) blocks.push({ kind: "events", title: "Top events (last 36 h)", events: events.map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])) });
      text = locale === "es"
        ? `${idx !== null ? `Los componentes del S&P 500 variaron ${formatPercent(idx, { digits: 1 }, locale)} en la última sesión. ` : ""}${best && worst ? `Mejor sector: ${ctx.label(best.n)} ${formatPercent(best.r, { digits: 1 }, locale)}; peor: ${ctx.label(worst.n)} ${formatPercent(worst.r, { digits: 1 }, locale)}. ` : ""}${events.length} eventos destacados en las últimas 36 horas.`
        : `${idx !== null ? `S&P 500 constituents ${formatPercent(idx, { digits: 1 }, locale)} in the last session. ` : ""}${best && worst ? `Best sector ${ctx.label(best.n)} ${formatPercent(best.r, { digits: 1 }, locale)}, worst ${ctx.label(worst.n)} ${formatPercent(worst.r, { digits: 1 }, locale)}. ` : ""}${events.length} top events in the last 36 hours.`;
      break;
    }
    case "screen_52w_growth": {
      const { rows } = await attachMarketData(repos, ctx.securities.filter((s) => s.isPrimary));
      const fundamentals = await repos.fundamentals.listFundamentalSnapshots([...new Set(rows.map((r) => r.summary.companyId))]);
      const hits = rows
        .map((r) => ({ r, s: r.snapshot, f: fundamentals.get(r.summary.companyId) }))
        .filter((x) => x.s?.price && x.s.high52w && x.s.price >= x.s.high52w * 0.97 && (x.f?.metrics.revenue_growth ?? 0) > 0)
        .sort((a, b) => (b.f?.metrics.revenue_growth ?? 0) - (a.f?.metrics.revenue_growth ?? 0))
        .slice(0, 25);
      blocks.push({
        kind: "table",
        title: "Within 3% of the 52-week high AND positive revenue growth (YoY, TTM)",
        columns: ["Company", "Price", "vs 52W high", "Revenue growth", "1D"],
        rows: hits.map((x) => ({ cells: [x.r.ticker, x.s?.price ?? null, x.s?.price && x.s.high52w ? x.s.price / x.s.high52w - 1 : null, x.f?.metrics.revenue_growth ?? null, x.s?.returns["1D"] ?? null], href: ctx.href(`company:${x.r.summary.companyId}`), formats: ["text", "num", "pct", "pct", "pct"] })),
        note: "Screen on MarketRadar data: split-adjusted closes (Alpaca) and SEC XBRL fundamentals. Criteria: close ≥ 97% of the 52-week high; revenue growth > 0.",
      });
      const id = pack.add({ id: "md:screen:52w", kind: "MARKET_DATA", text: locale === "es" ? `Resultado del filtro: ${hits.length} empresas a menos del 3 % de su máximo de 52 semanas y con crecimiento positivo de ingresos` : `Screen result: ${hits.length} companies within 3% of their 52-week high with positive revenue growth`, values: [hits.length, 3], source: locale === "es" ? "Filtro de MarketRadar" : "MarketRadar screen" });
      claims.push({ text: locale === "es" ? `${hits.length} empresas del S&P 500 están a menos del 3 % de su máximo de 52 semanas y tienen crecimiento positivo de ingresos.` : `${hits.length} S&P 500 companies are within 3% of their 52-week high and have positive revenue growth.`, kind: "MARKET_DATA", evidenceIds: [id] });
      text = locale === "es" ? `${hits.length} empresas coinciden (ordenadas por crecimiento de ingresos).` : `${hits.length} companies match (shown by revenue growth).`;
      break;
    }
    case "compare": {
      const ids = parsed.companies.slice(0, 5);
      const secs = ids.map(sec).filter((s): s is SecuritySummary => !!s);
      const snaps = await ctx.snapshots(ids);
      const fundamentals = await repos.fundamentals.listFundamentalSnapshots(ids);
      const events = await repos.news.eventsForNodes(ids.map((id) => `company:${id}` as NodeKey), { since: since7, limit: 40 });
      const valuations = await Promise.all(
        secs.map(async (s) => {
          const h = await getCompanyHeader(repos, s.ticker);
          return { s, v: await getValuationView(repos, s, h.kind === "found" ? h.data.realMarketData : null) };
        }),
      );
      const rowsOut: { cells: (string | number | null)[]; href?: string | null; formats?: ("pct" | "num" | "text" | "money" | "ratio")[] }[] = [];
      for (const s of secs) {
        const snap = snaps.get(s.companyId);
        const f = fundamentals.get(s.companyId);
        const nEvents = events.filter((e) => e.links.some((l) => l.node === `company:${s.companyId}` && l.relation === "DIRECT")).length;
        rowsOut.push({ cells: [s.ticker, snap?.returns["1D"] ?? null, snap?.returns["1M"] ?? null, snap?.returns.YTD ?? null, snap?.returns["1Y"] ?? null, snap?.marketCap ?? null, f?.metrics.revenue_growth ?? null, f?.metrics.operating_margin ?? null, snap?.rsi14 ?? null, nEvents], href: ctx.href(`company:${s.companyId}`), formats: ["text", "pct", "pct", "pct", "pct", "money", "pct", "pct", "num", "num"] });
        const oneDay = formatPercent(snap?.returns["1D"], { signed: true, digits: 1 }, locale);
        const ytd = formatPercent(snap?.returns.YTD, { signed: true, digits: 1 }, locale);
        const oneYear = formatPercent(snap?.returns["1Y"], { signed: true, digits: 1 }, locale);
        const revenueGrowth = formatPercent(f?.metrics.revenue_growth, { signed: true, digits: 1 }, locale);
        const operatingMargin = formatPercent(f?.metrics.operating_margin, { signed: true, digits: 1 }, locale);
        const id = pack.add({ id: `md:${s.ticker}:compare`, kind: "MARKET_DATA", text: locale === "es" ? `${s.ticker}: 1D ${oneDay}, YTD ${ytd}, 1A ${oneYear}, crecimiento de ingresos ${revenueGrowth}, margen operativo ${operatingMargin}` : `${s.ticker}: 1D ${oneDay}, YTD ${ytd}, 1Y ${oneYear}, revenue growth ${revenueGrowth}, operating margin ${operatingMargin}`, values: [snap?.returns["1D"], snap?.returns.YTD, snap?.returns["1Y"], f?.metrics.revenue_growth, f?.metrics.operating_margin].filter((v): v is number => typeof v === "number").map((v) => pctValue(v)), source: locale === "es" ? "MarketRadar (Alpaca + SEC)" : "MarketRadar (Alpaca + SEC)" });
        claims.push({ text: locale === "es" ? `${s.ticker}: YTD ${ytd}, crecimiento de ingresos ${revenueGrowth}, margen operativo ${operatingMargin}.` : `${s.ticker}: YTD ${ytd}, revenue growth ${revenueGrowth}, operating margin ${operatingMargin}.`, kind: "MARKET_DATA", evidenceIds: [id] });
      }
      blocks.push({ kind: "table", title: "Side by side (MarketRadar data)", columns: ["Ticker", "1D", "1M", "YTD", "1Y", "Market cap", "Revenue growth", "Operating margin", "RSI 14", "Events 7d"], rows: rowsOut, note: "Market cap only when VERIFIED. Fundamentals from SEC XBRL (TTM)." });
      const pe = valuations.map(({ s, v }) => ({ s, r: v.ratios.find((r) => r.id === "pe") }));
      if (pe.some((x) => x.r?.status === "ok")) blocks.push({ kind: "table", title: "Valuation (TTM, SEC + verified market cap)", columns: ["Ticker", "P/E", "FCF yield"], rows: valuations.map(({ s, v }) => ({ cells: [s.ticker, v.ratios.find((r) => r.id === "pe")?.value ?? null, v.ratios.find((r) => r.id === "fcf_yield")?.value ?? null], formats: ["text", "ratio", "pct"] })) });
      const reactions = await marketReactions(ctx, events.slice(0, 6), 3);
      if (events.length) blocks.push({ kind: "events", title: "Recent events", events: events.slice(0, 6).map((e) => toCardVM(ctx, e, reactions.get(e.id) ?? [])) });
      text = locale === "es" ? `Comparación de ${secs.map((s) => s.ticker).join(", ")} con datos de MarketRadar.` : `Comparison of ${secs.map((s) => s.ticker).join(", ")} with MarketRadar data.`;
      break;
    }
    case "learn": {
      const id = parsed.companies[0] ?? ctx.universe.byTicker.get("AAPL")?.companyId;
      const s = id ? sec(id) : undefined;
      if (!s || !parsed.concept) {
        unknowns.push(locale === "es" ? "No se reconoció el concepto o la empresa." : "Concept or company not recognised.");
        break;
      }
      const lookup = await getCompanyHeader(repos, s.ticker);
      if (lookup.kind !== "found") break;
      const card = await getLearnCard(repos, lookup.data, parsed.concept);
      for (const e of card.pack.all()) pack.add(e);
      claims.push(...card.example);
      blocks.push({ kind: "learn", card: locale === "es" ? localizeLearnCard(card, locale) : card, ticker: s.ticker });
      text = locale === "es" ? `Modo de aprendizaje: ${card.title}. A continuación se muestra un ejemplo con datos reales de ${s.ticker}.` : `${card.title}: ${card.definition} Example with ${s.ticker}'s real data below.`;
      break;
    }
    default:
      unknowns.push(locale === "es" ? "MarketRadar no pudo asociar la pregunta con una empresa, sector, materia prima, factor o intención compatible." : "MarketRadar could not map the question to a company, sector, commodity, factor or supported intent.");
      text = locale === "es" ? "No pude entender la pregunta con las reglas de MarketRadar. Prueba con uno de los ejemplos." : "I could not understand the question with MarketRadar's rules. Try one of the examples.";
  }

  // IA opcional: reescritura de la respuesta SOLO con el context pack (afirmaciones validadas).
  const runtime = getWebAiRuntime();
  const status = runtime.status("ask");
  let answer: AskResult["answer"] = { text: text.trim(), origin: "deterministic", model: null };
  let finalClaims = claims;
  let rejectedClaims = 0;
  let skipped: string | null = status.remoteEnabled ? null : status.reason;
  if (status.remoteEnabled && pack.size > 0) {
    const res = await runtime.run<AskAnswerOutput>({
      feature: "ask",
      locale,
      task: "ask",
      subject: `ask:${parsed.intent}`,
      promptVersion: PROMPT_VERSIONS.ask,
      schemaName: "ask_answer",
      schema: askAnswerSchema,
      instructions: locale === "es" ? "Responde en español usando solo la evidencia. Sé breve. Cita los IDs de evidencia para cada afirmación." : "Answer the user's question using only the evidence. Keep it short. Cite evidence ids for every claim.",
      input: { locale, question: parsed.question, intent: parsed.intent, range: parsed.range, entities: resolved.map((r) => r.label), deterministic_answer: text.trim() },
      pack,
      tier: "fast",
      claimsOf: (o) => o.claims.map((c) => ({ text: c.text, kind: c.kind, evidenceIds: c.evidence_ids })),
      ttlHours: 6,
    });
    if (res) {
      answer = { text: res.output.answer, origin: "ai", model: res.model };
      finalClaims = [...res.grounding.accepted, ...claims.filter((c) => c.kind === "MARKET_DATA")];
      rejectedClaims = res.grounding.rejected.length;
      unknowns.push(...res.output.unknowns);
    } else skipped = runtime.lastSkipReason;
  }

  return {
    question: parsed.question,
    parsed,
    intentLabel: locale === "es" ? ({ why_move: "Explicar un movimiento", relative_move: "Movimiento frente al sector", entity_news: "Qué está pasando", theme_exposure: "Empresas relacionadas", market_today: "Cambios de hoy", screen_52w_growth: "Filtro", compare: "Comparación", learn: "Modo de aprendizaje", unknown: "No entendido" } as const)[parsed.intent] : INTENT_LABELS[parsed.intent],
    resolved,
    answer,
    claims: finalClaims,
    blocks: localizeAskBlocks(blocks, locale),
    evidence: pack.all(),
    unknowns,
    suggestions: [...messages.ask.examples],
    ai: { status, skipped, rejectedClaims },
  };
}

export type { NewsWebContext };
