import type { Metadata } from "next";
import Link from "next/link";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { EventList } from "@/components/news/event-card";
import { ClaimsList, MovePanel } from "@/components/news/intelligence";
import { ChannelTag, ClaimKindBadge, ClaimLegend, DirectionMark } from "@/components/news/primitives";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { getRepositories } from "@/data/registry";
import { formatCompact, formatNumber } from "@/lib/format";
import { type AskBlock, askMarketRadar } from "@/services/intelligence";
import { toMovePanelData } from "@/intelligence/move-panel-data";
import { getServerMessages } from "@/i18n/server";
import { getMessages, type Locale } from "@/i18n/messages";
import { aiStatusReason, mechanismLabel, horizonLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";
import { impactSummary } from "@/i18n/templates";
import { localizeEventCards } from "@/translation/server";
import { cn } from "@/lib/cn";
import { buttonClass, inputClass } from "@/components/ui/styles";

export const metadata: Metadata = { title: "Ask MarketRadar" };

function Cell({ value, format, locale }: { value: string | number | null; format?: string; locale: Locale }) {
  if (value === null || value === undefined) return <span className="text-fg-muted">—</span>;
  if (typeof value === "number") {
    if (format === "pct") return <PerformanceBadge value={value} />;
    if (format === "money") return <span className="font-mono">{formatCompact(value, "USD", locale)}</span>;
    if (format === "ratio") return <span className="font-mono">{formatNumber(value, 1, locale)}×</span>;
    return <span className="font-mono">{formatNumber(value, value % 1 === 0 ? 0 : 2, locale)}</span>;
  }
  return <span>{value}</span>;
}

function Block({ block, locale }: { block: AskBlock; locale: Locale }) {
  const messages = getMessages(locale);
  switch (block.kind) {
    case "move":
      return <MovePanel move={toMovePanelData(block.move)} title={block.title} />;
    case "events":
      return (
        <Panel title={block.title} actions={<Badge variant="neutral">{messages.common.sourceBased}</Badge>}>
          <EventList events={block.events} />
        </Panel>
      );
    case "impacts":
      return (
        <Panel title={block.title} actions={<Badge variant="inferred">{messages.common.inferred}</Badge>}>
          <ul className="divide-y divide-border/60">
            {block.items.map((i) => (
              <li key={`${i.eventId}-${i.target}`} className="flex flex-col gap-0.5 px-2.5 py-1.5 text-2xs" title={impactSummary(locale, i.direction, i.label, i.mechanism, i.horizon)}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DirectionMark direction={i.direction} label={i.directionLabel} />
                  <span className="text-fg">{classificationLabel(locale, i.label)}</span>
                  <ChannelTag channel={i.channel} />
                  <span className="text-fg-muted">{mechanismLabel(locale, i.mechanism)} · {horizonLabel(locale, i.horizon)} · {messages.intelligence.confidence} {Math.round(i.confidence * 100)}%</span>
                </div>
                <span className="text-[10px] text-fg-muted">{locale === "es" ? "desde:" : "from:"} {i.eventTitle}</span>
              </li>
            ))}
          </ul>
        </Panel>
      );
    case "table":
      return (
        <Panel title={block.title} actions={<Badge variant="positive">{messages.common.realData}</Badge>}>
          <div className="max-h-[32rem] overflow-auto scroll-thin">
            <Table caption={block.title}>
              <THead>
                <tr>
                  {block.columns.map((c, i) => (
                    <Th key={c} numeric={i > 0 && block.rows[0]?.formats?.[i] !== "text"}>
                      {c}
                    </Th>
                  ))}
                </tr>
              </THead>
              <tbody>
                {block.rows.map((r, ri) => (
                  <Tr key={ri}>
                    {r.cells.map((cell, ci) => (
                      <Td key={ci} numeric={ci > 0 && r.formats?.[ci] !== "text"} className={ci === 3 && r.formats?.[ci] === "text" ? "max-w-72 truncate text-[10px] text-fg-muted" : undefined}>
                        {ci === 0 && r.href ? (
                          <Link href={r.href} className="font-mono text-fg hover:text-link">
                            {cell}
                          </Link>
                        ) : (
                        <Cell value={cell} format={r.formats?.[ci]} locale={locale} />
                        )}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          {block.note && <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{block.note}</p>}
        </Panel>
      );
    case "learn":
      return (
        <Panel title={`${messages.intelligence.learningMode} · ${block.card.title}`} subtitle={block.ticker}>
          <div className="flex flex-col gap-1.5 px-2.5 py-2 text-2xs">
            <p className="text-fg-secondary">{block.card.definition}</p>
            <p className="text-fg-muted">
              <span className="font-semibold text-fg-secondary">{messages.intelligence.formula} </span>
              {block.card.formula}
            </p>
            <p className="text-fg-muted">
              <span className="font-semibold text-fg-secondary">{messages.intelligence.howToRead} </span>
              {block.card.howToRead}
            </p>
          </div>
          <ClaimsList claims={block.card.example} evidence={block.card.pack.all()} />
          <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{messages.intelligence.caveat} {block.card.caveat}</p>
        </Panel>
      );
  }
}

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { locale, messages } = await getServerMessages();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 500) : "";
  const result = q ? await askMarketRadar(getRepositories(), q, new Date(), locale) : null;
  const translatedCards = result ? await localizeEventCards(result.blocks.flatMap((block) => block.kind === "events" ? block.events : []), locale) : [];
  const titleById = new Map(translatedCards.map((card) => [card.id, card.headline?.language === locale ? card.headline.title : card.title]));
  const cardsById = new Map(translatedCards.map((card) => [card.id, card]));
  const displayBlocks: AskBlock[] = result?.blocks.map((block) => {
    if (block.kind === "events") return { ...block, events: block.events.map((event) => cardsById.get(event.id) ?? event) };
    if (block.kind === "impacts") return { ...block, items: block.items.map((item) => ({ ...item, eventTitle: titleById.get(item.eventId) ?? item.eventTitle })) };
    if (block.kind === "move") return { ...block, move: { ...block.move, catalysts: block.move.catalysts.map((item) => ({ ...item, title: titleById.get(item.eventId) ?? item.title })) } };
    return block;
  }) ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 lg:p-4">
      <header className="flex flex-col gap-2 rounded-card border-2 border-border-brand bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="w-full text-[10.5px] font-bold tracking-[0.08em] text-fg-muted uppercase">{messages.navigation.tools}</span>
          <h1 className="font-display text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em] text-fg">{messages.ask.title}</h1>
        </div>
        <form action="/ask" method="get" className="flex gap-1.5">
          <input
            name="q"
            defaultValue={q}
            maxLength={500}
            placeholder={locale === "es" ? messages.ask.askSpanishSample : messages.ask.askEnglishSample}
            aria-label={messages.ask.question}
            className={cn(inputClass, "min-w-0 flex-1")}
          />
          <button type="submit" className={buttonClass("ai", "sm", "h-8")}>
            {messages.ask.askButton}
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          {messages.ask.examples.map((e) => (
            <Link key={e} href={`/ask?q=${encodeURIComponent(e)}`} className="rounded-[3px] border border-border px-1.5 py-px text-[10px] text-fg-secondary hover:border-border-brand hover:text-link">
              {e}
            </Link>
          ))}
        </div>
        <p className="text-[10px] text-fg-muted">
          {messages.ask.help}
        </p>
      </header>

      {result && (
        <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-2">
            <Panel
              title={messages.intelligence.answer}
              subtitle={result.intentLabel}
              actions={result.answer.origin === "ai" ? <Badge variant="ai" title={`Model ${result.answer.model}`}>{messages.intelligence.aiValidated}</Badge> : <Badge variant="neutral" title={messages.intelligence.deterministicTitle}>{messages.intelligence.deterministicEngine}</Badge>}
            >
              <p className="px-2.5 py-2 text-xs leading-relaxed text-fg">{result.answer.text}</p>
              {result.resolved.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
                  {messages.intelligence.understood}
                  {result.resolved.map((r) =>
                    r.href ? (
                      <Link key={r.node} href={r.href} className="rounded-[3px] border border-border px-1 text-fg-secondary hover:text-link">
                        {r.label}
                      </Link>
                    ) : (
                      <span key={r.node} className="rounded-[3px] border border-border px-1 text-fg-secondary">
                        {r.label}
                      </span>
                    ),
                  )}
                  <span>· {messages.ask.period} {result.parsed.range}</span>
                </div>
              )}
              {result.unknowns.length > 0 && (
                <ul className="border-t border-border px-2.5 py-1.5 text-[10px] text-warning">
                  {result.unknowns.map((u) => (
                    <li key={u} className="flex items-center gap-1.5">
                      <ClaimKindBadge kind="UNKNOWN" /> {u}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {displayBlocks.map((b, i) => (
              <Block key={i} block={b} locale={locale} />
            ))}
          </div>
          <aside className="flex min-w-0 flex-col gap-2">
            <Panel title={messages.intelligence.claimsEvidence} subtitle={`${result.claims.length} ${messages.common.claims} · ${result.evidence.length} ${messages.common.evidenceItems}`}>
              <ClaimsList claims={result.claims} evidence={result.evidence} />
            </Panel>
            <Panel title={messages.intelligence.provider}>
              <div className="flex flex-col gap-1 px-2.5 py-2 text-[10px] text-fg-muted">
                <span>
                  <Badge variant={result.ai.status.remoteEnabled ? "ai" : "neutral"}>{result.ai.status.remoteEnabled ? messages.ask.aiEnabled : messages.ask.deterministic}</Badge>
                </span>
                <span>{aiStatusReason(locale, result.ai.status.reason)}</span>
                {result.ai.skipped && result.ai.status.remoteEnabled && <span className="text-warning">{messages.ask.aiSkipped}: {aiStatusReason(locale, result.ai.skipped)}</span>}
                {result.ai.rejectedClaims > 0 && <span>{result.ai.rejectedClaims} {messages.ask.rejectedClaims}</span>}
                <span>{result.claims.filter((c) => c.evidenceIds.length > 0).length}/{result.claims.length} {messages.ask.claimsCited}</span>
              </div>
            </Panel>
            <Panel title={messages.intelligence.legend}>
              <div className="px-2.5 py-2">
                <ClaimLegend />
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}
