import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { EventCard } from "@/components/news/event-card";
import { ChannelTag, ClaimKindBadge, ClaimLegend, ConfidenceMeter, DirectionMark, EntityChip, StatusBadge, TimeAgo } from "@/components/news/primitives";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { getRepositories } from "@/data/registry";
import { CONFIDENCE_WEIGHTS } from "@/news/confidence";
import { formatDateTime } from "@/lib/format";
import { getEventDetail } from "@/services/news";
import { getServerMessages } from "@/i18n/server";
import { eventFamilyLabel, eventTypeLabel, eventTypeText, horizonLabel, mechanismLabel } from "@/i18n/domain";
import { eventSummary, impactSummary } from "@/i18n/templates";
import { classificationLabel } from "@/i18n/classification";
import { localizeEventCards } from "@/translation/server";

export const metadata: Metadata = { title: "Event" };

const COMPONENT_LABELS: Record<keyof typeof CONFIDENCE_WEIGHTS, string> = {
  sourceQuality: "Source quality",
  corroboration: "Independent corroboration",
  entityMatch: "Entity match",
  recency: "Recency",
  classification: "Classification certainty",
  agreement: "Agreement between sources",
  eventCertainty: "Event certainty (official vs 'sources say')",
};

export default async function EventPage({ params }: PageProps<"/news/event/[id]">) {
  const { locale, messages } = await getServerMessages();
  const { id } = await params;
  const now = new Date();
  const data = await getEventDetail(getRepositories(), id, now);
  if (!data) notFound();
  const [card, ...related] = await localizeEventCards([data.card, ...data.related], locale);
  if (!card) notFound();
  const summary = eventSummary(locale, card.type, card.articleCount, card.official, card.independentSources);
  const componentLabels = locale === "es" ? {
    sourceQuality: "Calidad de fuente", corroboration: "Corroboración independiente", entityMatch: "Coincidencia de entidad", recency: "Recencia", classification: "Certeza de clasificación", agreement: "Acuerdo entre fuentes", eventCertainty: "Certeza del evento (oficial vs. fuentes)",
  } : COMPONENT_LABELS;

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 lg:p-4">
      <header className="flex flex-col gap-1.5 rounded-card border-2 border-border-brand bg-surface px-3 py-2.5">
        <nav className="text-[10px] text-fg-muted">
          <Link href="/news" className="hover:text-link">
            {messages.news.worldPulse}
          </Link>{" "}
          / {messages.news.event}
        </nav>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" title={eventFamilyLabel(locale, card.family)}>{eventTypeLabel(locale, card.type)}</Badge>
          {card.secondaryLabels.map((l) => (
            <Badge key={l} variant="neutral">
              {eventTypeText(locale, l)}
            </Badge>
          ))}
          <StatusBadge status={card.status} />
          <ClaimKindBadge kind={card.official ? "FACT" : "SOURCE_CLAIM"} />
          {card.unconfirmed && <Badge variant="warning">{messages.news.unconfirmed}</Badge>}
          {card.contradictory && <Badge variant="warning">{messages.news.sourcesDisagree}</Badge>}
        </div>
        <h1 className="font-display text-[24px] leading-[1.15] font-extrabold tracking-[-0.01em] text-fg">{card.headline?.language === locale ? card.headline.title : card.title}</h1>
        {card.headline?.status === "translated" ? (
          <details className="text-2xs text-fg-muted">
            <summary className="w-fit cursor-pointer">Original: {card.originalLanguage?.toUpperCase() ?? "?"}</summary>
            <span className="block pt-0.5">{card.source ? `${card.source} · ` : ""}{card.originalUrl ? <a href={card.originalUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-link">{card.title}</a> : card.title}</span>
          </details>
        ) : card.originalLanguage?.toLowerCase() !== locale ? <p className="text-2xs text-fg-muted">{locale === "es" ? "Original sin traducir" : "Untranslated original"}: {card.originalLanguage?.toUpperCase() ?? "?"}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
          <span>
            {messages.news.firstSeen} {formatDateTime(card.firstSeenAt, locale)} · {messages.news.lastUpdate} <TimeAgo iso={card.lastSeenAt} now={now} />
          </span>
          <span>
            {card.independentSources} {locale === "es" ? (card.independentSources === 1 ? "fuente independiente" : "fuentes independientes") : `independent source${card.independentSources === 1 ? "" : "s"}`} · {card.articleCount} {locale === "es" ? (card.articleCount === 1 ? "artículo" : "artículos") : `article${card.articleCount === 1 ? "" : "s"}`}
          </span>
          <ConfidenceMeter confidence={card.confidence} />
          <span>{locale === "es" ? "Importancia" : "Importance"} {Math.round(card.importance * 100)}/100</span>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <Panel title={locale === "es" ? "Qué ha ocurrido" : "What happened"} actions={<Badge variant={data.aiAnalysis ? "ai" : "neutral"}>{data.aiAnalysis ? (locale === "es" ? "Resumen IA" : "AI summary") : (locale === "es" ? "Resumen MarketRadar" : "MarketRadar summary")}</Badge>}>
            <p className="px-2.5 py-2 text-xs leading-relaxed text-fg-secondary">{summary}</p>
            <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
              {locale === "es" ? "Resumen redactado por MarketRadar a partir de metadatos del evento (tipo, fuentes, entidades y movimientos descritos en titulares). No copia el texto del artículo. Consulta las fuentes originales para más detalles." : "Summary written by MarketRadar from event metadata (type, sources, entities, movements stated in headlines). It does not copy article text. Read the original sources below for details."}
            </p>
          </Panel>

          <Panel title={locale === "es" ? "Mapa de impactos" : "Impact map"} subtitle={messages.news.potentialRelationships} actions={<Badge variant="inferred">{messages.common.inferred}</Badge>}>
            {data.impacts.length === 0 ? (
              <p className="px-2.5 py-3 text-2xs text-fg-muted">{locale === "es" ? "Sin hipótesis de impacto: el evento no indica una dirección para ningún factor de mercado o MarketRadar no tiene un mecanismo definido para este caso." : "No impact hypotheses: the event does not state a direction for any market driver, or MarketRadar has no curated mechanism for it."}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.impacts.map(({ impact: i, companies, groupReturn }) => (
                  <li key={`${i.target}-${i.channel}`} className="flex flex-col gap-1 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-2xs">
                      <DirectionMark direction={i.direction} label={i.directionLabel} />
                      {i.href ? (
                        <Link href={i.href} className="font-semibold text-fg hover:text-link">
                          {classificationLabel(locale, i.label)}
                        </Link>
                      ) : (
                        <span className="font-semibold text-fg">{classificationLabel(locale, i.label)}</span>
                      )}
                      <ChannelTag channel={i.channel} />
                      <span className="text-fg-muted">{messages.intelligence.mechanism}: {mechanismLabel(locale, i.mechanism)}</span>
                      <span className="text-fg-muted">{locale === "es" ? "intensidad" : "strength"} {"●".repeat(i.strength)}{"○".repeat(3 - i.strength)}</span>
                      <span className="text-fg-muted">{messages.intelligence.horizon}: {horizonLabel(locale, i.horizon)}</span>
                      <span className="ml-auto font-mono text-[10px] text-fg-muted" title={locale === "es" ? "Confianza del impacto = confianza del evento × confianza de la relación a lo largo de la ruta" : "Impact confidence = event confidence × relationship confidence along the path"}>{locale === "es" ? "confianza" : "conf"} {Math.round(i.confidence * 100)}</span>
                    </div>
                    <p className="text-[11px] text-fg-muted">
                      <span className="text-inferred">{locale === "es" ? "Ruta:" : "Path:"}</span> {i.path.map((part) => classificationLabel(locale, part)).join(" → ")}
                    </p>
                    <p className="text-[11px] text-fg-secondary">{impactSummary(locale, i.direction, i.label, i.mechanism, i.horizon)}</p>
                    {(companies.length > 0 || groupReturn) && (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs" title="Real market data (last session)">
                        <Badge variant="positive">{messages.common.realData}</Badge>
                        {groupReturn && (
                          <span className="text-fg-muted">
                            {locale === "es" ? "Grupo (sintético)" : "Group (synthetic)"} 1D <PerformanceBadge value={groupReturn.r1d} /> · 1W <PerformanceBadge value={groupReturn.r1w} />
                          </span>
                        )}
                        {companies.map((c) => (
                          <span key={c.label} className="inline-flex items-center gap-1" title={c.name}>
                            {c.href ? (
                              <Link href={c.href} className="font-mono text-fg-secondary hover:text-link">
                                {c.label}
                              </Link>
                            ) : (
                              <span className="font-mono">{c.label}</span>
                            )}
                            <PerformanceBadge value={c.r1d} label="1 day" />
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={messages.news.sources} subtitle={`${data.sources.length} ${locale === "es" ? "guardadas" : "stored"}`}>
            <Table caption={locale === "es" ? "Fuentes del evento" : "Event sources"}>
              <THead>
                <tr>
              <Th>{messages.news.originalHeadline}</Th>
                  <Th>{locale === "es" ? "Editor" : "Publisher"}</Th>
              <Th>{locale === "es" ? "Nivel" : "Tier"}</Th>
                  <Th>{locale === "es" ? "Fecha" : "Time"}</Th>
              <Th numeric>{locale === "es" ? "Copias" : "Copies"}</Th>
                </tr>
              </THead>
              <tbody>
                {data.sources.map((s) => (
                  <Tr key={s.articleId}>
                    <Td className="max-w-md whitespace-normal">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-fg-secondary hover:text-link">
                        {s.title}
                      </a>
                      {s.snippet && <p className="line-clamp-2 text-[10px] text-fg-muted">{s.snippet}</p>}
                      <div className="flex gap-1 pt-0.5">
                        {s.unconfirmed && <Badge variant="warning">{locale === "es" ? "Fuentes sin identificar" : "Unnamed sources"}</Badge>}
                        {s.polarity !== 0 && <Badge variant={s.polarity > 0 ? "positive" : "negative"}>{s.polarity > 0 ? (locale === "es" ? "Tono positivo" : "Positive tone") : (locale === "es" ? "Tono negativo" : "Negative tone")}</Badge>}
                        {s.language && <Badge variant="outline" title={messages.news.originalLanguage}>{s.language.toUpperCase()}</Badge>}
                      </div>
                    </Td>
                    <Td className="text-fg-secondary">{s.publisher}</Td>
                    <Td>
                      <span title={s.tierLabel} className="font-mono text-fg-muted">
                        T{s.tier}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(s.publishedAt, locale)}</Td>
                    <Td numeric className="text-fg-muted" title="Syndicated republications merged into this row">
                      {s.syndicationCount}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
              {locale === "es" ? "MarketRadar solo guarda metadatos y enlaces (no el texto completo). Los extractos solo aparecen para fuentes oficiales de dominio público o con permiso de reutilización. T1 oficial · T2 financiero/agencia principal · T3 establecido · T4 sin clasificar." : "MarketRadar stores metadata and links only (no article bodies). Snippets appear only for public-domain / reuse-permitted official sources. T1 official · T2 major financial/wire · T3 established · T4 unrated."}
            </p>
          </Panel>

          {data.related.length > 0 && (
            <Panel title={messages.news.relatedEvents} subtitle={locale === "es" ? "comparten ≥ 2 entidades · 14 días" : "share ≥ 2 entities · 14 days"}>
              <div className="grid gap-2 p-2 lg:grid-cols-2">
                {related.map((e) => (
                  <EventCard key={e.id} event={e} now={now} compact />
                ))}
              </div>
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-2">
          {card.reactions.length > 0 && (
          <Panel title={locale === "es" ? "Reacción del mercado" : "Market reaction"} actions={<Badge variant="positive">{messages.common.realData}</Badge>}>
              <Table caption={locale === "es" ? "Reacción del mercado" : "Market reaction"}>
                <THead>
                  <tr>
                    <Th>{locale === "es" ? "Entidad" : "Entity"}</Th>
                    <Th numeric>1D</Th>
                    <Th numeric>1W</Th>
                    <Th numeric>{locale === "es" ? "Vol. rel." : "Rel. vol"}</Th>
                  </tr>
                </THead>
                <tbody>
                  {card.reactions.map((r) => (
                    <Tr key={r.node}>
                      <Td>{r.href ? <Link href={r.href} className="text-fg-secondary hover:text-link">{r.label}</Link> : r.label}</Td>
                      <Td numeric>
                        <PerformanceBadge value={r.r1d} />
                      </Td>
                      <Td numeric>
                        <PerformanceBadge value={r.r1w} />
                      </Td>
                      <Td numeric className="text-fg-muted">{r.relativeVolume !== null ? `${r.relativeVolume.toFixed(1)}x` : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{locale === "es" ? "Última sesión (EOD). Los grupos son índices sintéticos de MarketRadar ponderados por capitalización. La covariación no demuestra que el evento causara el movimiento." : "Last session (EOD). Groups are MarketRadar synthetic cap-weighted indices. Co-movement is not proof that the event caused the move."}</p>
            </Panel>
          )}

          <Panel title={locale === "es" ? "Entidades" : "Entities"} subtitle={locale === "es" ? "por qué existe cada relación" : "why each relationship exists"}>
            <div className="flex flex-col gap-2 px-2.5 py-2">
              <div>
                <h3 className="pb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{locale === "es" ? "Menciones directas" : "Direct mentions"}</h3>
                <ul className="flex flex-col gap-1">
                  {data.links.direct.map((l) => (
                    <li key={l.node} className="flex items-start gap-1.5 text-2xs">
                      <EntityChip chip={l} />
                      <span className="text-[10px] text-fg-muted">
                        {l.method} · {Math.round(l.confidence * 100)} · {l.evidence}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="pb-1 text-[10px] font-semibold tracking-wide text-inferred uppercase">{locale === "es" ? "Relaciones inferidas" : "Inferred relationships"}</h3>
                <ul className="flex flex-col gap-1">
                  {data.links.inferred.map((l) => (
                    <li key={l.node} className="flex items-start gap-1.5 text-2xs">
                      <EntityChip chip={l} />
                      <span className="text-[10px] text-fg-muted">{l.evidence}</span>
                    </li>
                  ))}
                  {data.links.inferred.length === 0 && <li className="text-[10px] text-fg-muted">{locale === "es" ? "Ninguna" : "None"}</li>}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel title={locale === "es" ? "Confianza" : "Confidence"} subtitle={`${Math.round(card.confidence.score * 100)}/100 · ${locale === "es" ? ({ High: "Alta", Medium: "Media", Low: "Baja" } as const)[card.confidenceLabel] : card.confidenceLabel}`}>
            <ul className="flex flex-col gap-1 px-2.5 py-2 text-2xs">
              {(Object.keys(CONFIDENCE_WEIGHTS) as (keyof typeof CONFIDENCE_WEIGHTS)[]).map((k) => {
                const v = (card.confidence[k] as number | undefined) ?? 0;
                return (
                  <li key={k} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-fg-secondary">{componentLabels[k]}</span>
                    <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <span className="absolute inset-y-0 left-0 bg-fg-muted" style={{ width: `${Math.round(v * 100)}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-[10px] text-fg-muted">
                      {Math.round(v * 100)} × {CONFIDENCE_WEIGHTS[k]}
                    </span>
                  </li>
                );
              })}
            </ul>
            <ul className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
              {card.confidence.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
            <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
              {locale === "es" ? "Suma ponderada de componentes explicables. Mide la confianza en el evento y sus entidades, no la probabilidad de un movimiento de precio." : "Weighted sum of explainable components. It measures trust in the event and its entities — not the probability of any price move."}
            </p>
          </Panel>
          <Panel title={locale === "es" ? "Cómo leer esta página" : "Reading this page"}>
            <div className="px-2.5 py-2">
              <ClaimLegend />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
