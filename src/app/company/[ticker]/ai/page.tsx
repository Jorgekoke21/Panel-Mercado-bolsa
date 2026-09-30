import Link from "next/link";
import { EventList } from "@/components/news/event-card";
import { ClaimsList, MovePanel } from "@/components/news/intelligence";
import { ChannelTag, ClaimLegend, DirectionMark } from "@/components/news/primitives";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { MetricCard } from "@/components/market/metric-card";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import type { LearnConcept } from "@/intelligence/ask-router";
import { formatCompact, formatPercent, formatRatio, formatInteger } from "@/lib/format";
import { companyPath } from "@/lib/routes";
import { getCompanyIntelligence, getLearnCard, type ImpactItem, LEARN_CONCEPTS } from "@/services/intelligence";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";
import { horizonLabel, mechanismLabel } from "@/i18n/domain";
import { impactSummary } from "@/i18n/templates";
import { toMovePanelData } from "@/intelligence/move-panel-data";
import { localizeEventCards } from "@/translation/server";

function ImpactList({ items, empty, locale }: { items: ImpactItem[]; empty: string; locale: "es" | "en" }) {
  if (items.length === 0) return <p className="px-2.5 py-2 text-2xs text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((i) => (
        <li key={`${i.eventId}-${i.target}`} className="flex flex-col gap-0.5 px-2.5 py-1.5 text-2xs" title={impactSummary(locale, i.direction, i.label, i.mechanism, i.horizon)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <DirectionMark direction={i.direction} label={i.directionLabel} />
            <span className="text-fg">{classificationLabel(locale, i.label)}</span>
            <ChannelTag channel={i.channel} />
            <span className="text-fg-muted">
              {mechanismLabel(locale, i.mechanism)} · {horizonLabel(locale, i.horizon)} · {locale === "es" ? "confianza" : "conf"} {Math.round(i.confidence * 100)}
            </span>
          </div>
          <Link href={`/news/event/${i.eventId}`} className="text-[10px] text-fg-muted hover:text-link">
            {i.eventTitle}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CompanyIntelligencePage({ params, searchParams }: PageProps<"/company/[ticker]/ai">) {
  const { locale, messages } = await getServerMessages();
  const [{ ticker }, query] = await Promise.all([params, searchParams]);
  const header = await loadCompanyHeader(ticker);
  const now = new Date();
  const repos = getRepositories();
  const concept = (LEARN_CONCEPTS.find((c) => c.concept === query.learn)?.concept ?? "pe") as LearnConcept;
  const [intel, learn] = await Promise.all([getCompanyIntelligence(repos, header, now, locale), getLearnCard(repos, header, concept, locale)]);
  const localizedEvents = await localizeEventCards(intel.events, locale);
  const localizedTitleById = new Map(localizedEvents.map((event) => [event.id, event.headline?.language === locale ? event.headline.title : event.title]));
  const localizedMove = (move: typeof intel.move1d) => {
    const data = toMovePanelData(move);
    return { ...data, catalysts: data.catalysts.map((catalyst) => ({ ...catalyst, title: localizedTitleById.get(catalyst.eventId) ?? catalyst.title })) };
  };
  const m = intel.market;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Panel
        tone="ai"
        title={locale === "es" ? "Lo que importa ahora" : "What matters now"}
        subtitle={intel.asOf ? `${locale === "es" ? "sesión" : "session"} ${intel.asOf}` : undefined}
        actions={intel.ai.brief ? <Badge variant="ai" title={`${locale === "es" ? "Modelo" : "Model"} ${intel.ai.model}`}>{locale === "es" ? "Resumen IA" : "AI brief"}</Badge> : <Badge variant="neutral" title={intel.ai.status.reason}>{messages.intelligence.deterministicEngine}</Badge>}
      >
        <p className="px-2.5 pt-2 text-xs text-fg">{intel.headline}</p>
        <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label={locale === "es" ? "Mercado 1D" : "Market 1D"} value={<PerformanceBadge value={m.r1d} />} footnote={`1W ${formatPercent(m.r1w, { signed: true }, locale)}`} />
          <MetricCard label={m.industry ? (locale === "es" ? "vs. industria" : "vs. industry") : messages.common.industry} value={<PerformanceBadge value={m.industry?.r1d ?? null} />} definition={m.industry ? (locale === "es" ? `${classificationLabel(locale, m.industry.name)} 1D: índice sintético de MarketRadar ponderado por capitalización de sus componentes actuales.` : `${m.industry.name} 1D: MarketRadar synthetic cap-weighted index of current constituents.`) : undefined} />
          <MetricCard label={m.sector ? (locale === "es" ? "vs. sector" : "vs. sector") : messages.common.sector} value={<PerformanceBadge value={m.sector?.r1d ?? null} />} definition={m.sector ? (locale === "es" ? `${classificationLabel(locale, m.sector.name)} 1D: índice sintético de MarketRadar ponderado por capitalización.` : `${m.sector.name} 1D: MarketRadar synthetic cap-weighted index.`) : undefined} />
          <MetricCard label={locale === "es" ? "S&P 500 (sintético)" : "S&P 500 (synthetic)"} value={<PerformanceBadge value={m.market} />} />
          <MetricCard label={messages.technical.relativeVolume} value={formatRatio(m.relativeVolume, 1, locale)} definition={locale === "es" ? "Volumen de la última sesión / media de 20 sesiones." : "Last-session volume / 20-session average."} />
          <MetricCard label={locale === "es" ? "Eventos (7d)" : "Events (7d)"} value={formatInteger(intel.eventCount, locale)} />
        </div>
        {intel.themes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
            {locale === "es" ? "Temas principales:" : "Main themes:"}
            {intel.themes.map((t) => (
              <span key={t.label} className="rounded-[3px] border border-border px-1 text-fg-secondary">
                {classificationLabel(locale, t.label)}
                {t.count > 0 && <span className="pl-1 font-mono text-fg-muted">{t.count}</span>}
              </span>
            ))}
          </div>
        )}
        {intel.ai.brief && (
          <div className="border-t border-border px-2.5 py-2 text-2xs">
            <p className="text-fg-secondary">{intel.ai.brief.headline}</p>
            {intel.ai.rejected > 0 && <p className="text-[10px] text-fg-muted">{locale === "es" ? `${intel.ai.rejected} afirmación(es) de IA eliminadas en la validación de evidencia.` : `${intel.ai.rejected} AI claim(s) removed by grounding validation.`}</p>}
          </div>
        )}
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        <MovePanel move={localizedMove(intel.move1d)} title={locale === "es" ? "Movimiento · 1D" : "Explain move · 1D"} />
        <MovePanel move={localizedMove(intel.move1w)} title={locale === "es" ? "Movimiento · 1W" : "Explain move · 1W"} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel tone="ai" title={locale === "es" ? "Posibles efectos positivos" : "Potential positives"} actions={<Badge variant="inferred">{messages.common.inferred}</Badge>}>
          <ImpactList items={intel.positives.map((item) => ({ ...item, eventTitle: localizedTitleById.get(item.eventId) ?? item.eventTitle }))} empty={locale === "es" ? "No hay relaciones potencialmente positivas en eventos recientes." : "No potential positive relationships in recent events."} locale={locale} />
        </Panel>
        <Panel tone="ai" title={locale === "es" ? "Riesgos potenciales" : "Potential risks"} actions={<Badge variant="inferred">{messages.common.inferred}</Badge>}>
          <ImpactList items={intel.risks.map((item) => ({ ...item, eventTitle: localizedTitleById.get(item.eventId) ?? item.eventTitle }))} empty={locale === "es" ? "No hay relaciones potencialmente negativas en eventos recientes." : "No potential negative relationships in recent events."} locale={locale} />
        </Panel>
        <Panel title={locale === "es" ? "Últimos datos fundamentales" : "Latest fundamentals"} actions={<Badge variant="positive">{messages.common.realData}</Badge>} subtitle="SEC XBRL · TTM">
          {intel.fundamentals.length === 0 ? (
            <p className="px-2.5 py-2 text-2xs text-fg-muted">{locale === "es" ? "No hay datos fundamentales SEC sincronizados para este emisor." : "No SEC fundamentals synced for this issuer."}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-2.5 py-2 text-2xs">
              {intel.fundamentals.map((f) => (
                <div key={f.label} className="flex justify-between gap-2">
                  <dt className="text-fg-muted">{f.label}</dt>
                  <dd className="font-mono text-fg-secondary">{f.unit === "percent" ? formatPercent(f.value, { signed: false, digits: 1 }, locale) : formatCompact(f.value, header.security.currency, locale)}</dd>
                </div>
              ))}
            </dl>
          )}
          {intel.fundamentals[0]?.asOf && <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{locale === "es" ? "Último trimestre incluido:" : "Last quarter included:"} {intel.fundamentals[0].asOf}</p>}
        </Panel>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel title={locale === "es" ? "Eventos relevantes" : "Relevant events"} subtitle={locale === "es" ? "empresa · industria · sector · 7 días" : "company · industry · sector · 7 days"}>
          <EventList events={localizedEvents} now={now} />
        </Panel>
        <Panel tone="ai" title={messages.intelligence.claimsEvidence} subtitle={locale === "es" ? "cada afirmación está etiquetada y puede rastrearse" : "every statement is typed and traceable"}>
          <ClaimsList claims={intel.claims} evidence={intel.evidence} />
          <div className="border-t border-border px-2.5 py-1.5">
            <ClaimLegend />
          </div>
        </Panel>
      </div>

      <Panel title={messages.intelligence.learningMode} subtitle={locale === "es" ? `conceptos explicados con datos reales de ${header.security.ticker}` : `concepts explained with ${header.security.ticker}'s real data`}>
        <nav className="flex flex-wrap gap-1 border-b border-border px-2.5 py-1.5" aria-label={locale === "es" ? "Conceptos" : "Concepts"}>
          {LEARN_CONCEPTS.map((c) => (
            <Link key={c.concept} href={`${companyPath(header.security.ticker, "ai")}?learn=${c.concept}`} aria-current={c.concept === concept ? "page" : undefined} className={c.concept === concept ? "rounded-[3px] border border-accent px-1.5 text-[10px] text-link" : "rounded-[3px] border border-border px-1.5 text-[10px] text-fg-secondary hover:text-link"}>
              {locale === "es" ? ({ pe: "¿Qué es P/E?", fcf_yield: "¿Qué es la rentabilidad FCF?", rsi: "¿Qué es RSI?", relative_volume: "Volumen relativo", revenue_growth: "Crecimiento de ingresos", operating_margin: "Margen operativo", roe: "ROE", sma200: "Media de 200 días", range_52w: "Rango de 52 semanas", eps: "BPA" } as Record<string, string>)[c.concept] : c.label}
            </Link>
          ))}
        </nav>
        <div className="grid gap-2 px-2.5 py-2 text-2xs lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-fg">{learn.title}</h3>
            <p className="text-fg-secondary">{learn.definition}</p>
            <p className="text-fg-muted">
              <span className="font-semibold text-fg-secondary">{messages.intelligence.formula} </span>
              {learn.formula}
            </p>
            <p className="text-fg-muted">
              <span className="font-semibold text-fg-secondary">{messages.intelligence.howToRead} </span>
              {learn.howToRead}
            </p>
            <p className="text-[10px] text-fg-muted">{messages.intelligence.caveat} {learn.caveat}</p>
          </div>
          <div>
            <h3 className="pb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{locale === "es" ? `Con datos reales de ${header.security.ticker}` : `With ${header.security.ticker}'s real data`}</h3>
            <ClaimsList claims={learn.example} evidence={learn.pack.all()} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
