import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import type { Provenance } from "@/domain/provenance";
import type { RankingColumn } from "@/domain/ranking";
import { timeRangeLabel } from "@/i18n/domain";
import { formatCompact, formatNumber, formatPrice, formatRatio } from "@/lib/format";
import type { RankingResult } from "@/services/market-rows";
import { PerformanceBadge } from "./performance-badge";
import { TickerCell } from "./ticker-cell";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/i18n/messages";
import { rankingTitle } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";

interface RankingTableProps {
  ranking: RankingResult;
  provenance: Provenance;
  showSector?: boolean;
  locale?: Locale;
}

/** Ranking genérico: la definición (config/rankings.ts) decide métrica, orden y columnas. */
export function RankingTable({ ranking, provenance, showSector = true, locale = DEFAULT_LOCALE }: RankingTableProps) {
  const messages = getMessages(locale);
  const { definition, rows } = ranking;
  const returnRange = definition.metric.kind === "return" ? definition.metric.range : "1D";
  const localized = rankingTitle(locale, definition.id, returnRange);
  const title = localized?.title ?? definition.title;
  const description = localized?.description ?? definition.description;
  const columnLabels: Record<RankingColumn, string> = {
    price: messages.market.price, return: locale === "es" ? "Variación" : "Change", volume: messages.market.volume,
    relativeVolume: locale === "es" ? "Vol. rel." : "Rel vol", rsi14: "RSI 14", marketCap: locale === "es" ? "Cap. bursátil" : "Mkt cap",
  };
  return (
    <Panel
      title={title}
      subtitle={description}
      actions={<DataProvenanceBadge provenance={provenance} />}
      bodyClassName="flex flex-col"
    >
      {rows.length === 0 ? (
        <EmptyState compact title={messages.market.noSecuritiesMatch} description={messages.market.noRankingMatches} />
      ) : (
        <Table caption={title}>
          <THead>
            <tr>
              <Th className="w-6">#</Th>
              <Th>{messages.market.symbol}</Th>
              {showSector && <Th className="hidden sm:table-cell">{messages.common.sector}</Th>}
              {definition.columns.map((c) => (
                <Th key={c} numeric>
                  {c === "return" ? `${columnLabels[c]} ${returnRange}` : columnLabels[c]}
                </Th>
              ))}
            </tr>
          </THead>
          <tbody>
            {rows.map(({ row }, i) => {
              const s = row.snapshot;
              return (
                <Tr key={row.summary.securityId}>
                  <Td className="text-fg-muted">{i + 1}</Td>
                  <Td>
                    <TickerCell ticker={row.ticker} name={row.summary.companyName} showName={false} />
                  </Td>
                  {showSector && (
                    <Td className="hidden max-w-28 truncate text-fg-muted sm:table-cell" title={row.summary.classification ? classificationLabel(locale, row.summary.classification.sector.name) : undefined}>
                      {row.summary.classification ? classificationLabel(locale, row.summary.classification.sector.name) : "—"}
                    </Td>
                  )}
                  {definition.columns.map((c) => (
                    <Td key={c} numeric>
                      {c === "price" && formatPrice(s?.price, row.summary.currency, locale)}
                      {c === "return" && <PerformanceBadge value={s?.returns[returnRange]} label={timeRangeLabel(locale, returnRange)} />}
                      {c === "volume" && formatCompact(s?.volume, null, locale)}
                      {c === "relativeVolume" && formatRatio(s?.relativeVolume, 2, locale)}
                      {c === "rsi14" && formatNumber(s?.rsi14, 1, locale)}
                      {c === "marketCap" && formatCompact(s?.marketCap, row.summary.currency, locale)}
                    </Td>
                  ))}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
