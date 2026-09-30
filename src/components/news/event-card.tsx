"use client";

import Link from "next/link";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { EventCardVM, NodeChip } from "@/services/news";
import { ChannelTag, ClaimKindBadge, ConfidenceMeter, DirectionMark, EntityChip, StatusBadge, TimeAgo } from "./primitives";
import { useI18n } from "@/i18n/provider";
import { eventFamilyLabel, eventTypeLabel, eventTypeText, horizonLabel } from "@/i18n/domain";
import { eventSummary, impactSummary } from "@/i18n/templates";
import { classificationLabel } from "@/i18n/classification";
import { eventPath } from "@/lib/event-routes";

function ChipRow({ label, chips, max = 6, ticker }: { label: string; chips: NodeChip[]; max?: number; ticker?: (c: NodeChip) => string | undefined }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <span className="w-16 shrink-0 pt-px text-[9px] font-semibold tracking-wide text-fg-muted uppercase">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {chips.slice(0, max).map((c) => (
          <EntityChip key={c.node} chip={c} short={ticker?.(c)} />
        ))}
        {chips.length > max && <span className="text-[10px] text-fg-muted">+{chips.length - max}</span>}
      </div>
    </div>
  );
}

/**
 * Tarjeta de EVENTO (no de artículo): qué pasó, fuentes, entidades (directas / inferidas), impactos
 * potenciales con horizonte, confianza explicable y la reacción REAL del mercado de las entidades.
 */
export function EventCard({ event, now, compact = false, tickerOf }: { event: EventCardVM; now?: Date; compact?: boolean; tickerOf?: (c: NodeChip) => string | undefined }) {
  const { locale, messages } = useI18n();
  const kind = event.official ? "FACT" : "SOURCE_CLAIM";
  const eventType = eventTypeLabel(locale, event.type);
  const summary = eventSummary(locale, event.type, event.articleCount, event.official, event.independentSources);
  const eventLanguage = event.originalLanguage?.toUpperCase() ?? "?";
  const translated = event.headline?.status === "translated" && event.headline.language === locale;
  const displayTitle = translated ? event.headline!.title : event.title;
  const needsTranslation = event.originalLanguage?.toLowerCase() !== locale;
  return (
    <article className={cn("flex min-w-0 flex-col gap-1.5 rounded-[4px] border border-border bg-surface p-2.5", event.status === "stale" && "opacity-80")}>
      <header className="flex flex-wrap items-center gap-1.5 text-[10px] text-fg-muted">
        <Badge variant="outline" title={`${eventFamilyLabel(locale, event.family)} · ${event.secondaryLabels.map((label) => eventTypeText(locale, label)).join(", ") || (locale === "es" ? "sin tipo secundario" : "no secondary type")}`}>
          {eventType}
        </Badge>
        <StatusBadge status={event.status} />
        <ClaimKindBadge kind={kind} />
        <TimeAgo iso={event.lastSeenAt} now={now} />
        <span className="ml-auto">
          <ConfidenceMeter confidence={event.confidence} />
        </span>
      </header>
      <Link href={eventPath(event.id)} className="text-xs leading-snug font-semibold text-fg hover:text-accent">
        {displayTitle}
      </Link>
      {!compact && <p className="line-clamp-2 text-2xs text-fg-secondary">{summary}</p>}
      {translated ? (
        <details className="text-[9px] text-fg-muted">
          <summary className="w-fit cursor-pointer hover:text-fg-secondary">{locale === "es" ? "Original" : "Original"}: {eventLanguage}</summary>
          <span className="block pt-0.5">{event.source ? `${event.source} · ` : ""}{event.originalUrl ? <a href={event.originalUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">{event.title}</a> : event.title}</span>
        </details>
      ) : needsTranslation ? <span className="text-[9px] text-fg-muted" title={locale === "es" ? "Traducción no disponible; se muestra el titular original." : "Translation unavailable; showing the original headline."}>{locale === "es" ? "Original sin traducir" : "Untranslated original"}: {eventLanguage}</span> : null}
      <div className="flex flex-col gap-1">
        <ChipRow label={messages.common.companies} chips={[...event.companies, ...event.externals]} max={compact ? 4 : 6} ticker={tickerOf} />
        <ChipRow label={messages.common.sectors} chips={event.groups} max={compact ? 3 : 5} />
        {!compact && <ChipRow label={messages.common.countries} chips={event.countries} max={5} />}
        <ChipRow label={messages.common.drivers} chips={[...event.commodities, ...event.factors]} max={compact ? 3 : 5} />
      </div>
      {event.impacts.some((i) => !(i.channel === "DIRECT" && i.direction === "mixed_uncertain")) && (
        <ul className="flex flex-col gap-0.5 border-t border-border/70 pt-1.5">
          {event.impacts.filter((i) => !(i.channel === "DIRECT" && i.direction === "mixed_uncertain")).slice(0, compact ? 2 : 3).map((i) => (
            <li key={`${i.target}-${i.channel}`} className="flex min-w-0 items-center gap-1.5 text-2xs" title={impactSummary(locale, i.direction, i.label, i.mechanism, i.horizon)}>
              <DirectionMark direction={i.direction} label={i.directionLabel} />
              {i.href ? (
                <Link href={i.href} className="truncate text-fg-secondary hover:text-accent">
                  {classificationLabel(locale, i.label)}
                </Link>
              ) : (
                <span className="truncate text-fg-secondary">{classificationLabel(locale, i.label)}</span>
              )}
              <ChannelTag channel={i.channel} />
              <span className="ml-auto shrink-0 text-[10px] text-fg-muted">
                {horizonLabel(locale, i.horizon)} · {Math.round(i.confidence * 100)}%
              </span>
            </li>
          ))}
          <li className="text-[9px] text-inferred">≈ {messages.news.potentialRelationships}</li>
        </ul>
      )}
      {event.reactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/70 pt-1.5 text-2xs" title={messages.news.marketDataHint}>
          <span className="text-[9px] font-semibold tracking-wide text-fg-muted uppercase">{messages.common.market}</span>
          {event.reactions.map((r) => (
            <span key={r.node} className="inline-flex items-center gap-1">
              {r.href ? (
                <Link href={r.href} className={cn("text-fg-secondary hover:text-accent", r.kind === "company" && "font-mono")}>
                  {r.label}
                </Link>
              ) : (
                <span className="text-fg-secondary">{r.label}</span>
              )}
              <PerformanceBadge value={r.r1d} label={locale === "es" ? "1 día" : "1 day"} />
              {r.relativeVolume !== null && r.relativeVolume >= 1.5 && <span className="text-[10px] text-warning">{r.relativeVolume.toFixed(1)}× {locale === "es" ? "vol." : "vol"}</span>}
            </span>
          ))}
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-2 text-[10px] text-fg-muted">
        <span title={messages.news.independentReports}>
          {event.independentSources} {locale === "es" ? (event.independentSources === 1 ? "fuente independiente" : "fuentes independientes") : `independent source${event.independentSources === 1 ? "" : "s"}`} · {event.articleCount} {event.articleCount === 1 ? (locale === "es" ? "artículo" : "article") : messages.common.articles}
        </span>
        {event.official && <Badge variant="official">{messages.news.officialSource}</Badge>}
        {event.unconfirmed && <Badge variant="warning" title={messages.news.reportsUnnamed}>{messages.news.unconfirmed}</Badge>}
        {event.contradictory && <Badge variant="warning" title={messages.news.sourcesDisagree}>{messages.news.sourcesDisagree}</Badge>}
        {event.languages.length > 1 && <span>{event.languages.join(" · ").toUpperCase()}</span>}
        <span title={messages.news.horizon}>{messages.news.horizon}: {horizonLabel(locale, event.horizon)}</span>
      </footer>
    </article>
  );
}

/** Lista compacta (fichas de entidad). */
export function EventList({ events, now, empty }: { events: EventCardVM[]; now?: Date; empty?: string }) {
  const { locale } = useI18n();
  if (events.length === 0) return <p className="px-2.5 py-3 text-2xs text-fg-muted">{empty ?? (locale === "es" ? "No hay eventos relacionados en el periodo seleccionado." : "No related events in the selected window.")}</p>;
  return (
    <div className="grid gap-1.5 p-1.5">
      {events.map((e) => (
        <EventCard key={e.id} event={e} now={now} compact />
      ))}
    </div>
  );
}
