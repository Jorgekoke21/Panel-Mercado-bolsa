import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/news/event-card";
import { ClaimLegend, TimeAgo } from "@/components/news/primitives";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { cn } from "@/lib/cn";
import { formatDateTime, formatInteger } from "@/lib/format";
import { getWorldPulse, parsePulseView, PULSE_VIEW_LABELS, PULSE_VIEWS, type ThemeCount } from "@/services/news";
import { getServerMessages } from "@/i18n/server";
import { eventFamilyLabel, syncStatusLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";
import { localizeEventCards } from "@/translation/server";

export const metadata: Metadata = { title: "World Pulse" };

function ThemeList({ title, items, locale }: { title: string; items: ThemeCount[]; locale: "es" | "en" }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 px-2.5 py-2">
      <h3 className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      <ul className="flex flex-wrap gap-1">
        {items.map((t) => (
          <li key={t.node}>
            <Link href={`/news?node=${encodeURIComponent(t.node)}`} className="inline-flex items-center gap-1 rounded-[3px] border border-border px-1.5 py-px text-[10px] text-fg-secondary hover:border-accent hover:text-accent" title={locale === "es" ? `${t.events} evento(s) mencionan directamente ${t.label}; pulsa para filtrar` : `${t.events} event(s) mention ${t.label} directly — click to filter`}>
              {classificationLabel(locale, t.label)}
              <span className="font-mono text-fg-muted">{t.events}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const { locale, messages } = await getServerMessages();
  const query = await searchParams;
  const view = parsePulseView(query.view);
  const node = typeof query.node === "string" ? query.node : null;
  const now = new Date();
  const data = await getWorldPulse(getRepositories(), { view, node, now });
  const displayEvents = await localizeEventCards(data.events, locale);
  const lastRun = data.runs.find((r) => r.jobType === "news_ingest");
  const viewLabels: Record<(typeof PULSE_VIEWS)[number], string> = locale === "es"
    ? { top: "Destacados", markets: "Mercados", companies: "Empresas", sectors: "Sectores", commodities: "Materias primas", macro: "Macro", geopolitics: "Geopolítica", regulation: "Regulación", technology: "Tecnología" }
    : PULSE_VIEW_LABELS;

  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <header className="flex flex-col gap-1.5 rounded-[4px] border border-border bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[10px] font-semibold tracking-wider text-fg-muted uppercase">{messages.navigation.global}</span>
          <h1 className="text-lg leading-tight font-semibold text-fg">{messages.news.worldPulse}</h1>
          <span className="text-2xs text-fg-muted">
            {formatInteger(data.totalEvents, locale)} {messages.common.events} · {locale === "es" ? `últimos ${data.windowDays} días` : `last ${data.windowDays} days`}{data.asOf && <> · {locale === "es" ? "última actividad" : "latest activity"} <TimeAgo iso={data.asOf} now={now} /></>}
          </span>
        </div>
        <p className="max-w-4xl text-2xs text-fg-secondary">
          {locale === "es" ? <>Los artículos de fuentes oficiales (SEC EDGAR, Fed, BCE, BoE, BLS, BEA, EIA, FDA, FTC, SEC, DOJ, CFTC) y medios globales (vía GDELT) se deduplican y agrupan como <strong className="text-fg">eventos</strong>, vinculados a empresas, sectores, países, materias primas y factores macro de MarketRadar, con impactos potenciales y confianza explicable. Solo se muestra metadato y enlaces: cada evento remite a sus fuentes originales.</> : <>Articles from official sources (SEC EDGAR, Fed, ECB, BoE, BLS, BEA, EIA, FDA, FTC, SEC, DOJ, CFTC) and global media (via GDELT) are deduplicated and clustered into <strong className="text-fg">events</strong>, linked to MarketRadar companies, sectors, countries, commodities and macro factors, with potential impacts and an explainable confidence. Metadata and links only — every event links to its original sources.</>}
        </p>
        <ClaimLegend />
      </header>

      <nav aria-label={messages.news.worldPulse} className="scroll-thin flex overflow-x-auto border-b border-border">
        {PULSE_VIEWS.map((v) => {
          const href = v === "top" ? "/news" : `/news?view=${v}`;
          const active = v === view && !data.nodeFilter;
          return (
            <Link key={v} href={href} aria-current={active ? "page" : undefined} className={cn("-mb-px flex items-center gap-1 border-b-2 px-3 py-1.5 text-2xs font-semibold tracking-wide whitespace-nowrap uppercase", active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg-secondary")}>
              {viewLabels[v]}
              <span className="font-mono text-[10px] text-fg-muted">{data.counts[v]}</span>
            </Link>
          );
        })}
      </nav>

      {data.nodeFilter && (
        <div className="flex items-center gap-2 text-2xs text-fg-secondary">
          <Badge variant="accent">{locale === "es" ? "Filtro" : "Filter"}</Badge>
          {locale === "es" ? "Eventos relacionados con" : "Events related to"} <strong className="text-fg">{data.nodeFilter.label}</strong>
          <Link href="/news" className="text-accent hover:underline">
            {locale === "es" ? "Borrar" : "Clear"}
          </Link>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {data.events.length === 0 ? (
            <Panel title={viewLabels[view]}>
              <EmptyState title={messages.news.noEvents} description={locale === "es" ? "Ejecuta `npm run sync -- news` o espera a la sincronización horaria para incorporar noticias." : "Run `npm run sync -- news` (or wait for the hourly scheduled sync) to ingest news."} />
            </Panel>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
              {displayEvents.map((e) => (
                <EventCard key={e.id} event={e} now={now} />
              ))}
            </div>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-2">
          <Panel title={messages.news.whatWorldTalking} subtitle={messages.news.directMentions}>
            <ThemeList title={locale === "es" ? "Países" : "Countries"} items={data.themes.countries} locale={locale} />
            <ThemeList title={locale === "es" ? "Materias primas" : "Commodities"} items={data.themes.commodities} locale={locale} />
            <ThemeList title={locale === "es" ? "Factores macro y temáticos" : "Macro & thematic factors"} items={data.themes.factors} locale={locale} />
            <ThemeList title={locale === "es" ? "Sectores e industrias" : "Sectors & industries"} items={data.themes.groups} locale={locale} />
            <ThemeList title={locale === "es" ? "Empresas del S&P 500" : "S&P 500 companies"} items={data.themes.companies} locale={locale} />
          </Panel>
          <Panel title={messages.news.eventFamilies}>
            <ul className="px-2.5 py-2 text-2xs">
              {data.byFamily.map((f) => (
                <li key={f.family} className="flex justify-between py-0.5 text-fg-secondary">
                  <span>{eventFamilyLabel(locale, f.family)}</span>
                  <span className="font-mono text-fg-muted">{f.events}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={messages.news.sources} subtitle={messages.news.sourceStatus} actions={lastRun ? <Badge variant="neutral" title={`${locale === "es" ? "Última carga" : "Last ingestion"} ${formatDateTime(lastRun.startedAt, locale)} — ${syncStatusLabel(locale, lastRun.status)}`}>{syncStatusLabel(locale, lastRun.status)}</Badge> : undefined}>
            <ul className="divide-y divide-border/60 text-2xs">
              {data.sources.map((s) => (
                <li key={s.sourceId} className="flex items-center gap-2 px-2.5 py-1" title={`${s.label}\n${s.licenseTerms}${s.lastError ? `\nLast warning: ${s.lastError}` : ""}`}>
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.lastSuccessAt ? (s.lastError ? "bg-warning" : "bg-positive") : "bg-negative")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg-secondary">{s.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-muted">{s.lastSuccessAt ? <TimeAgo iso={s.lastSuccessAt} now={now} /> : messages.common.never}</span>
                </li>
              ))}
            </ul>
            {lastRun && (
              <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
                {locale === "es" ? "Última carga" : "Last run"}: {formatInteger(lastRun.recordsRead, locale)} {locale === "es" ? "artículos leídos" : "articles read"} · {formatInteger(lastRun.recordsWritten, locale)} {locale === "es" ? "nuevos" : "new"} · {String((lastRun.metrics.syndicated as number | undefined) ?? 0)} {locale === "es" ? "copias sindicadas agrupadas" : "syndicated copies merged"} ·{" "}
                {String((lastRun.metrics.eventsCreated as number | undefined) ?? 0)} {locale === "es" ? "eventos creados" : "events created"} · {String((lastRun.metrics.eventsUpdated as number | undefined) ?? 0)} {locale === "es" ? "actualizados" : "updated"}
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
