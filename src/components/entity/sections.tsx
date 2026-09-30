import Link from "next/link";
import type { ReactNode } from "react";
import { EventList } from "@/components/news/event-card";
import { eventPath } from "@/lib/event-routes";
import { ChannelTag, DirectionMark } from "@/components/news/primitives";
import { Badge } from "@/components/ui/badge";
import type { EventCardVM, ImpactVM } from "@/services/news";
import { BreadthPanel } from "@/components/market/breadth-panel";
import { ChartCard } from "@/components/market/chart-card";
import { type LadderLine, PerformanceLadder } from "@/components/market/performance-ladder";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import type { BreadthStats } from "@/domain/breadth";
import type { EntityKind } from "@/domain/entity";
import type { Provenance } from "@/domain/provenance";
import { TIME_RANGES, type TimeRange } from "@/domain/time-range";
import { getMessages, DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { entityKindLabel, mechanismLabel, horizonLabel } from "@/i18n/domain";
import { impactSummary } from "@/i18n/templates";
import { classificationLabel } from "@/i18n/classification";

/** Secciones de EntityPage. Cada una es independiente y se compone en la página. */

export function PerformanceSection({
  lines,
  provenance,
  badges,
  title,
  ranges = TIME_RANGES,
  note,
  locale = DEFAULT_LOCALE,
}: {
  lines: LadderLine[];
  provenance: Provenance;
  badges?: ReactNode;
  title?: string;
  ranges?: readonly TimeRange[];
  note?: ReactNode;
  locale?: Locale;
}) {
  const resolvedTitle = title ?? (locale === "es" ? "Rendimiento" : "Performance");
  return (
    <Panel title={resolvedTitle} actions={<>{badges}<DataProvenanceBadge provenance={provenance} /></>}>
      <PerformanceLadder lines={lines} ranges={ranges} locale={locale} />
      {note && <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{note}</p>}
    </Panel>
  );
}

export function ChartSection(props: Parameters<typeof ChartCard>[0]) {
  return <ChartCard {...props} />;
}

export function BreadthSection({ breadth, range, provenance, locale = DEFAULT_LOCALE }: { breadth: BreadthStats; range: TimeRange; provenance: Provenance; locale?: Locale }) {
  return <BreadthPanel breadth={breadth} range={range} provenance={provenance} locale={locale} />;
}

export function ComponentsSection({
  title,
  subtitle,
  actions,
  children,
  id = "components",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Panel id={id} title={title} subtitle={subtitle} actions={actions} bodyClassName="max-h-[36rem] overflow-y-auto scroll-thin">
      {children}
    </Panel>
  );
}

const CONTEXT_EXAMPLES: Record<EntityKind, string> = {
  index: "Macro releases, central-bank decisions and geopolitical events relevant to this market.",
  sector: "Global events with a potential relationship to this sector — trade, regulation, commodities, supply chains.",
  industry: "Events with a potential relationship to this industry and the companies inside it.",
  subIndustry: "Events with a potential relationship to this sub-industry.",
  company: "Global exposures (countries, supply chain, regulation, commodities) and active events potentially related to this company.",
};

/**
 * Contexto global (Fases 4/5): impactos POTENCIALES de eventos recientes sobre esta entidad, con mecanismo,
 * canal, horizonte y confianza. Son inferencias de MarketRadar, nunca predicciones.
 */
export function WorldContextSection({ kind, name, impacts, locale = DEFAULT_LOCALE }: { kind: EntityKind; name: string; impacts?: { event: EventCardVM; impact: ImpactVM }[]; locale?: Locale }) {
  const messages = getMessages(locale);
  const examples: Record<EntityKind, string> = locale === "es" ? {
    index: "Publicaciones macroeconómicas, decisiones de bancos centrales y eventos geopolíticos relevantes para este mercado.",
    sector: "Eventos globales con posibles relaciones con este sector: comercio, regulación, materias primas y cadenas de suministro.",
    industry: "Eventos con posibles relaciones con esta industria y sus empresas.",
    subIndustry: "Eventos con posibles relaciones con esta subindustria.",
    company: "Exposiciones globales (países, cadena de suministro, regulación y materias primas) y eventos activos potencialmente relacionados con esta empresa.",
  } : CONTEXT_EXAMPLES;
  if (!impacts) {
    return (
      <Panel tone="news" title={messages.news.globalContext} subtitle={`${entityKindLabel(locale, kind)} · ${name}`}>
        <EmptyState title={messages.news.globalIntelligenceUnavailable} description={examples[kind]} />
      </Panel>
    );
  }
  return (
    <Panel tone="news" title={messages.news.globalContext} subtitle={`${messages.news.potentialImpacts.replace("{name}", name)}`} actions={<Badge variant="inferred">{messages.common.inferred}</Badge>}>
      {impacts.length === 0 ? (
        <EmptyState compact title={messages.news.noRelatedImpacts} description={examples[kind]} />
      ) : (
        <ul className="divide-y divide-border/60">
          {impacts.map(({ event, impact }) => (
            <li key={`${event.id}-${impact.target}`} className="flex flex-col gap-0.5 px-2.5 py-1.5 text-2xs" title={impactSummary(locale, impact.direction, impact.label, impact.mechanism, impact.horizon)}>
              <div className="flex flex-wrap items-center gap-1.5">
                <DirectionMark direction={impact.direction} label={impact.directionLabel} />
                <span className="text-fg-secondary">{classificationLabel(locale, impact.label)}</span>
                <ChannelTag channel={impact.channel} />
                <span className="text-fg-muted">
                  {mechanismLabel(locale, impact.mechanism)} · {horizonLabel(locale, impact.horizon)} · {messages.intelligence.confidence} {Math.round(impact.confidence * 100)}
                </span>
              </div>
              <Link href={eventPath(event.id)} className="text-[11px] text-fg hover:text-link">
                {event.headline?.language === locale ? event.headline.title : event.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{messages.news.curatedGraph}</p>
    </Panel>
  );
}

export function NewsSection({ name, events, href, locale = DEFAULT_LOCALE }: { name: string; events?: EventCardVM[]; href?: string; locale?: Locale }) {
  const messages = getMessages(locale);
  if (!events) {
    return (
      <Panel tone="news" title={messages.company.news} subtitle={name}>
        <EmptyState phase="4" title={messages.news.noNewsSource} description={messages.news.verifiedNewsWillAppear} />
      </Panel>
    );
  }
  return (
    <Panel
      tone="news"
      title={messages.news.newsAndEvents}
      subtitle={`${name} · 7 ${messages.common.days}`}
      actions={href ? <Link href={href} className="text-[12px] font-bold text-link hover:underline">{locale === "es" ? "Ver todas →" : "All →"}</Link> : undefined}
      bodyClassName="max-h-[40rem] overflow-y-auto scroll-thin"
    >
      <EventList events={events} empty={messages.news.relatedEvents} />
    </Panel>
  );
}
