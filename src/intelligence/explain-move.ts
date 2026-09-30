import type { EventType, ImpactDirection } from "@/domain/news";
import type { TimeRange } from "@/domain/time-range";
import { type Claim, ContextPack, pctValue } from "./evidence";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { eventTypeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

/**
 * EXPLAIN MOVES — ¿el movimiento de un valor es propio, de su industria, de su sector o del mercado?
 * ¿Hay algún catalizador en las noticias/filings? NUNCA se afirma causalidad: coincidencia temporal
 * + coherencia de dirección ⇒ "Likely related"; solo coincidencia ⇒ "Possibly related"; nada ⇒
 * "No clear news catalyst found".
 *
 * Descomposición aditiva (aproximada, sin betas):
 *   mercado        = r(S&P 500 constituents, índice sintético)
 *   sector         = r(sector) − r(mercado)
 *   industria      = r(industria) − r(sector)
 *   idiosincrático = r(valor) − r(industria)
 */
export interface MoveInput {
  ticker: string;
  companyName: string;
  range: TimeRange;
  asOfDate: string;
  securityReturn: number | null;
  industry: { name: string; return: number | null } | null;
  sector: { name: string; return: number | null } | null;
  market: { name: string; return: number | null } | null;
  relativeVolume: number | null;
  /** ATR14 / precio: volatilidad diaria típica (para decidir si un 1D es inusual). */
  dailyVolatility: number | null;
  rsi14: number | null;
  /** Eventos candidatos con su relación con el valor. */
  events: CatalystCandidate[];
  /** 8-K del emisor alrededor de la fecha (hecho oficial). */
  filings: { accession: string; form: string; filedAt: string; items: string[]; url: string | null }[];
  source: string;
}

export interface CatalystCandidate {
  eventId: string;
  title: string;
  type: EventType;
  lastSeenAt: string;
  firstSeenAt: string;
  /** Cómo se relaciona con el valor. */
  scope: "company" | "industry" | "sector" | "market";
  /** Dirección potencial para el valor (impacto) o tono del titular. */
  direction: ImpactDirection;
  confidence: number;
  official: boolean;
  sourceLanguage?: string;
}

export type MoveDriver = "company_specific" | "industry_wide" | "sector_wide" | "market_wide" | "mixed" | "no_unusual_move" | "insufficient_data";
export type CatalystVerdict = "Likely related" | "Possibly related" | "No clear news catalyst found" | "No unusual move";

export interface MoveExplanation {
  ticker: string;
  range: TimeRange;
  asOfDate: string;
  securityReturn: number | null;
  components: { market: number | null; sector: number | null; industry: number | null; idiosyncratic: number | null };
  driver: MoveDriver;
  unusual: boolean;
  unusualReason: string;
  relativeVolume: number | null;
  verdict: CatalystVerdict;
  catalysts: { eventId: string; title: string; relation: "Likely related" | "Possibly related"; reason: string; scope: CatalystCandidate["scope"]; filing?: boolean; url?: string | null }[];
  claims: Claim[];
  pack: ContextPack;
  caveat: string;
}

const DRIVER_LABEL: Record<MoveDriver, string> = {
  company_specific: "company-specific",
  industry_wide: "industry-wide",
  sector_wide: "sector-wide",
  market_wide: "market-wide",
  mixed: "mixed",
  no_unusual_move: "no unusual move",
  insufficient_data: "insufficient data",
};

const CORPORATE_CATALYST_TYPES: EventType[] = ["EARNINGS", "GUIDANCE", "MERGER_ACQUISITION", "ANALYST_RATING", "LEGAL", "HEALTHCARE_REGULATORY", "CONTRACT_PARTNERSHIP", "MANAGEMENT_CHANGE", "PRODUCT_TECHNOLOGY", "CYBERSECURITY"];

const sub = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);

export function explainMove(input: MoveInput, locale: Locale = DEFAULT_LOCALE): MoveExplanation {
  const pack = new ContextPack();
  const claims: Claim[] = [];
  const percent = (value: number | null | undefined) => formatPercent(value, { signed: true, digits: 1 }, locale);
  const magnitudePercent = (value: number) => formatPercent(value, { signed: false, digits: 1 }, locale);
  const industryName = input.industry ? classificationLabel(locale, input.industry.name) : null;
  const sectorName = input.sector ? classificationLabel(locale, input.sector.name) : null;
  const marketName = locale === "es" && input.market?.name === "S&P 500 constituents (synthetic)" ? "Componentes del S&P 500 (sintético)" : input.market?.name;
  const driverLabels: Record<MoveDriver, string> = locale === "es" ? {
    company_specific: "específico de la empresa", industry_wide: "de toda la industria", sector_wide: "de todo el sector", market_wide: "de todo el mercado", mixed: "mixto", no_unusual_move: "sin movimiento inusual", insufficient_data: "datos insuficientes",
  } : DRIVER_LABEL;
  const relationship = (value: "Likely related" | "Possibly related") => locale === "es" ? (value === "Likely related" ? "Probablemente relacionado" : "Posiblemente relacionado") : value;
  const r = input.securityReturn;
  const m = input.market?.return ?? null;
  const s = input.sector?.return ?? null;
  const i = input.industry?.return ?? null;
  const components = { market: m, sector: sub(s, m), industry: sub(i, s), idiosyncratic: sub(r, i ?? s ?? m) };

  if (r === null) {
    return { ticker: input.ticker, range: input.range, asOfDate: input.asOfDate, securityReturn: null, components, driver: "insufficient_data", unusual: false, unusualReason: locale === "es" ? "No hay datos de rendimiento del precio" : "No price return available", relativeVolume: input.relativeVolume, verdict: "No clear news catalyst found", catalysts: [], claims: [{ text: locale === "es" ? `No hay datos de rendimiento del precio de ${input.ticker} para ${input.range}.` : `No ${input.range} price return is available for ${input.ticker}.`, kind: "UNKNOWN", evidenceIds: [] }], pack, caveat: "" };
  }

  const secId = pack.add({ id: `md:${input.ticker}:${input.range}`, kind: "MARKET_DATA", text: locale === "es" ? `Rendimiento del precio de ${input.ticker} en ${input.range}: ${percent(r)} (sesión ${formatDate(input.asOfDate, locale)})` : `${input.ticker} ${input.range} price return ${percent(r)} (session ${formatDate(input.asOfDate, locale)})`, values: [pctValue(r)], source: input.source, asOf: input.asOfDate });
  const compIds: string[] = [];
  const syntheticIndexSource = locale === "es" ? "Índice sintético de MarketRadar" : "MarketRadar synthetic index";
  if (input.industry && i !== null) compIds.push(pack.add({ id: `md:industry:${input.range}`, kind: "MARKET_DATA", text: locale === "es" ? `${industryName} (índice sintético ponderado por capitalización de MarketRadar) ${input.range}: ${percent(i)}` : `${industryName} (MarketRadar synthetic cap-weighted index) ${input.range} ${percent(i)}`, values: [pctValue(i)], source: syntheticIndexSource, asOf: input.asOfDate }));
  if (input.sector && s !== null) compIds.push(pack.add({ id: `md:sector:${input.range}`, kind: "MARKET_DATA", text: locale === "es" ? `${sectorName} (índice sintético ponderado por capitalización de MarketRadar) ${input.range}: ${percent(s)}` : `${sectorName} (MarketRadar synthetic cap-weighted index) ${input.range} ${percent(s)}`, values: [pctValue(s)], source: syntheticIndexSource, asOf: input.asOfDate }));
  if (input.market && m !== null) compIds.push(pack.add({ id: `md:market:${input.range}`, kind: "MARKET_DATA", text: locale === "es" ? `${marketName} ${input.range}: ${percent(m)}` : `${marketName} ${input.range} ${percent(m)}`, values: [pctValue(m)], source: syntheticIndexSource, asOf: input.asOfDate }));
  const rvId = input.relativeVolume !== null ? pack.add({ id: `md:${input.ticker}:relvol`, kind: "MARKET_DATA", text: locale === "es" ? `Volumen relativo de ${input.ticker}: ${formatNumber(input.relativeVolume, 1, locale)}× (última sesión frente a la media de 20 sesiones)` : `${input.ticker} relative volume ${formatNumber(input.relativeVolume, 1, locale)}× (last session vs 20-session average)`, values: [Math.round(input.relativeVolume * 10) / 10], source: input.source, asOf: input.asOfDate }) : null;

  // ¿Es inusual? 1D: ≥ 1.5 % y ≥ 1.5× la volatilidad diaria típica, o volumen relativo ≥ 2.
  const vol = input.dailyVolatility ?? 0.02;
  const threshold = input.range === "1D" ? Math.max(0.015, 1.5 * vol) : input.range === "1W" ? Math.max(0.04, 3 * vol) : Math.max(0.08, 5 * vol);
  const bigVolume = (input.relativeVolume ?? 0) >= 2;
  const unusual = Math.abs(r) >= threshold || (input.range === "1D" && bigVolume && Math.abs(r) >= 0.01);
  const unusualReason = unusual
    ? locale === "es" ? `movimiento de ${magnitudePercent(Math.abs(r))} frente al umbral de ${magnitudePercent(threshold)}${bigVolume ? `, volumen relativo ${formatNumber(input.relativeVolume, 1, locale)}×` : ""}` : `size ${magnitudePercent(Math.abs(r))} vs threshold ${magnitudePercent(threshold)}${bigVolume ? `, relative volume ${formatNumber(input.relativeVolume, 1, locale)}×` : ""}`
    : locale === "es" ? `movimiento de ${magnitudePercent(Math.abs(r))}, por debajo del umbral de ${magnitudePercent(threshold)} (≈1,5× el rango diario habitual de la acción, ATR 14)` : `size ${magnitudePercent(Math.abs(r))} is below the ${magnitudePercent(threshold)} threshold (≈1.5× the stock's typical daily range, ATR 14)`;

  // Componente dominante.
  let driver: MoveDriver = "mixed";
  const parts: [MoveDriver, number | null][] = [
    ["company_specific", components.idiosyncratic],
    ["industry_wide", components.industry],
    ["sector_wide", components.sector],
    ["market_wide", components.market],
  ];
  const known = parts.filter((p): p is [MoveDriver, number] => p[1] !== null);
  if (!unusual) driver = "no_unusual_move";
  else if (known.length <= 1) driver = known.length === 1 ? "company_specific" : "insufficient_data";
  else {
    // El componente con mayor contribución en el MISMO sentido que el movimiento.
    const same = known.filter(([, v]) => Math.sign(v) === Math.sign(r)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top = same[0];
    if (top && Math.abs(top[1]) >= 0.5 * Math.abs(r)) driver = top[0];
  }

  claims.push({
    text: locale === "es"
      ? `${input.ticker} se movió ${percent(r)} (${input.range})${industryName && i !== null ? ` frente a ${industryName} ${percent(i)}` : ""}${sectorName && s !== null ? `, ${sectorName} ${percent(s)}` : ""}${marketName && m !== null ? `, ${marketName} ${percent(m)}` : ""}.`
      : `${input.ticker} moved ${percent(r)} (${input.range})${industryName && i !== null ? ` vs ${industryName} ${percent(i)}` : ""}${sectorName && s !== null ? `, ${sectorName} ${percent(s)}` : ""}${marketName && m !== null ? `, ${marketName} ${percent(m)}` : ""}.`,
    kind: "MARKET_DATA",
    evidenceIds: [secId, ...compIds],
  });
  if (rvId && input.relativeVolume !== null) claims.push({ text: locale === "es" ? `Volumen relativo: ${formatNumber(input.relativeVolume, 1, locale)}×.` : `Relative volume ${formatNumber(input.relativeVolume, 1, locale)}×.`, kind: "MARKET_DATA", evidenceIds: [rvId] });
  if (driver !== "no_unusual_move" && driver !== "insufficient_data") {
    claims.push({ text: locale === "es" ? `El movimiento parece ${driverLabels[driver]}: el componente más importante en la misma dirección es ${driver === "company_specific" ? "el rendimiento excedente de la acción frente a su industria" : `el componente ${driverLabels[driver]}`}.` : `The move looks ${driverLabels[driver]}: the largest same-direction component is ${driver === "company_specific" ? "the stock's own excess return over its industry" : `the ${driverLabels[driver]} component`}.`, kind: "INFERENCE", evidenceIds: [secId, ...compIds] });
  } else if (driver === "no_unusual_move") {
    claims.push({ text: locale === "es" ? `Sin movimiento inusual: ${unusualReason}.` : `No unusual move: ${unusualReason}.`, kind: "INFERENCE", evidenceIds: [secId] });
  }

  // Catalizadores.
  const catalysts: MoveExplanation["catalysts"] = [];
  const session = Date.parse(`${input.asOfDate}T21:00:00Z`);
  const windowStart = session - (input.range === "1D" ? 36 : input.range === "1W" ? 8 * 24 : 35 * 24) * 3_600_000;
  const windowEnd = session + 14 * 3_600_000;
  const moveDir: ImpactDirection = r > 0 ? "potential_positive" : "potential_negative";
  if (unusual) {
    for (const f of input.filings) {
      const t = Date.parse(f.filedAt);
      if (t < windowStart || t > windowEnd) continue;
      const earnings = f.items.includes("2.02");
      const id = pack.add({ id: `fact:filing:${f.accession}`, kind: "FACT", text: locale === "es" ? `${input.companyName} presentó el formulario ${f.form} (${f.items.map((x) => `apartado ${x}`).join(", ")}) el ${formatDate(f.filedAt, locale)}` : `${input.companyName} filed Form ${f.form} (${f.items.map((x) => `Item ${x}`).join(", ")}) on ${formatDate(f.filedAt, locale)}`, values: [], source: "SEC EDGAR", url: f.url ?? undefined, asOf: f.filedAt });
      const relation = earnings && driver === "company_specific" ? "Likely related" : "Possibly related";
      catalysts.push({ eventId: `filing:${f.accession}`, title: `Form ${f.form}${earnings ? locale === "es" ? " — resultados de operaciones (resultados)" : " — results of operations (earnings)" : ""}`, relation, reason: locale === "es" ? earnings ? "Informe de resultados presentado ante la SEC durante el periodo del movimiento" : "Informe presentado ante la SEC durante el periodo del movimiento" : earnings ? "Earnings release filed with the SEC in the move window" : "SEC filing in the move window", scope: "company", filing: true, url: f.url });
      claims.push({ text: locale === "es" ? `${relationship(relation)}: ${input.companyName} presentó el formulario ${f.form}${earnings ? " con un comunicado de resultados (apartado 2.02)" : ""} durante el periodo del movimiento.` : `${relation}: ${input.companyName} filed a Form ${f.form}${earnings ? " with an earnings release (Item 2.02)" : ""} within the move window.`, kind: "FACT", evidenceIds: [id] });
    }
    const relevantScopes: CatalystCandidate["scope"][] =
      driver === "company_specific" ? ["company"] : driver === "industry_wide" ? ["company", "industry"] : driver === "sector_wide" ? ["company", "industry", "sector"] : ["company", "industry", "sector", "market"];
    for (const e of input.events) {
      const t = Date.parse(e.lastSeenAt);
      const f0 = Date.parse(e.firstSeenAt);
      if (t < windowStart || f0 > windowEnd || !relevantScopes.includes(e.scope)) continue;
      const aligned = e.direction === moveDir;
      const opposite = e.direction !== "mixed_uncertain" && !aligned;
      if (opposite && e.scope !== "company") continue;
      const corporate = e.scope === "company" && CORPORATE_CATALYST_TYPES.includes(e.type);
      const relation: "Likely related" | "Possibly related" = aligned && e.confidence >= 0.55 && (corporate || e.scope !== "company") && (e.scope === "company" ? driver === "company_specific" : true) ? "Likely related" : "Possibly related";
      const eventLabel = eventTypeLabel(locale, e.type);
      const id = pack.add({ id: `event:${e.eventId}`, kind: e.official ? "FACT" : "SOURCE_CLAIM", text: `${eventLabel}: ${e.title}`, values: [], source: e.official ? (locale === "es" ? "Fuente oficial" : "official source") : (locale === "es" ? "Medios de comunicación" : "news reports"), sourceLanguage: e.sourceLanguage, asOf: e.lastSeenAt });
      const scope = locale === "es" ? ({ company: "empresa", industry: "industria", sector: "sector", market: "mercado" } as const)[e.scope] : e.scope;
      const reason = locale === "es" ? `Evento de ${scope} en el periodo del movimiento; ${aligned ? "dirección coherente con el movimiento" : e.direction === "mixed_uncertain" ? "dirección no indicada" : "dirección opuesta al movimiento"}` : `${eventLabel} event (${e.scope}) in the move window; ${aligned ? "direction consistent with the move" : e.direction === "mixed_uncertain" ? "direction not stated" : "direction opposite to the move"}`;
      catalysts.push({ eventId: e.eventId, title: e.title, relation, reason, scope: e.scope });
      claims.push({ text: `${relationship(relation)}: ${e.title}`, kind: e.official ? "FACT" : "SOURCE_CLAIM", evidenceIds: [id], sourceLanguage: e.sourceLanguage });
    }
  }
  catalysts.sort((a, b) => Number(b.relation === "Likely related") - Number(a.relation === "Likely related"));
  const top = catalysts.slice(0, 6);
  const verdict: CatalystVerdict = !unusual ? "No unusual move" : top.some((c) => c.relation === "Likely related") ? "Likely related" : top.length ? "Possibly related" : "No clear news catalyst found";
  if (unusual && top.length === 0) claims.push({ text: locale === "es" ? "No se encontró un catalizador claro en las fuentes de MarketRadar para este periodo." : "No clear news catalyst found in MarketRadar's sources for this window.", kind: "UNKNOWN", evidenceIds: [] });

  return {
    ticker: input.ticker,
    range: input.range,
    asOfDate: input.asOfDate,
    securityReturn: r,
    components,
    driver,
    unusual,
    unusualReason,
    relativeVolume: input.relativeVolume,
    verdict,
    catalysts: top,
    claims,
    pack,
    caveat: locale === "es" ? "La coincidencia temporal y de dirección no demuestra causalidad. Las líneas de sector, industria y mercado son índices sintéticos de componentes actuales calculados por MarketRadar, no niveles oficiales." : "Timing and direction coincidence is not proof of causation. Sector/industry/market lines are MarketRadar synthetic indices of current constituents, not official index levels.",
  };
}
