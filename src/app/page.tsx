import Link from "next/link";
import { SyntheticBadge } from "@/components/market/index-badge";
import { BreadthPanel } from "@/components/market/breadth-panel";
import { Heatmap } from "@/components/market/heatmap";
import { MarketTicker } from "@/components/market/market-ticker";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { RankingTable } from "@/components/market/ranking-table";
import { TimeRangeSelector } from "@/components/market/time-range-selector";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { parseTimeRange } from "@/domain/time-range";
import { indexPath, sectorPath } from "@/lib/routes";
import { getDashboardData } from "@/services/dashboard";
import { getServerMessages } from "@/i18n/server";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { locale, messages } = await getServerMessages();
  const range = parseTimeRange((await searchParams).range);
  const data = await getDashboardData(getRepositories(), range);
  const sectorsByReturn = [...data.sectors].sort(
    (a, b) => (b.stats.performance.capWeighted[range] ?? -Infinity) - (a.stats.performance.capWeighted[range] ?? -Infinity),
  );
  const maxAbs = Math.max(0.0001, ...sectorsByReturn.map((s) => Math.abs(s.stats.performance.capWeighted[range] ?? 0)));

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 lg:p-4">
      <MarketTicker items={data.benchmarks.items} provenance={data.benchmarks.provenance} locale={locale} />

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          tone="market"
          surface="data"
          className="self-start"
          title={locale === "es" ? `Mapa ${data.universe.label}` : `${data.universe.label} map`}
          subtitle={locale === "es" ? `${data.universe.securities} valores · sector → empresa · tamaño: capitalización verificada · color: ${timeRangeLabel(locale, range)}` : `${data.universe.securities} securities · sector → company · size: verified market cap · colour: ${timeRangeLabel(locale, range).toLowerCase()}`}
          actions={
            <>
              <TimeRangeSelector current={range} basePath="/" />
              <DataProvenanceBadge provenance={data.marketProvenance} />
            </>
          }
        >
          {data.heatmap.groups.length > 0 ? (
            <Heatmap data={data.heatmap} locale={locale} />
          ) : (
            <EmptyState title={locale === "es" ? "No hay valores en el universo" : "No securities in the universe"} description={locale === "es" ? "Ejecuta la carga inicial (npm run db:reset) para importar los componentes del S&P 500." : "Run the seed (npm run db:reset) to load the S&P 500 constituents."} />
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel
            title={messages.common.sectors}
            subtitle={range}
            actions={<SyntheticBadge methodology="cap_weight" />}
          >
            <ul className="flex flex-col py-1">
              {sectorsByReturn.map((sector) => {
                const value = sector.stats.performance.capWeighted[range] ?? null;
                const width = value === null ? 0 : (Math.abs(value) / maxAbs) * 50;
                return (
                  <li key={sector.id}>
                    <Link href={sectorPath(sector.slug)} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-2 px-2.5 py-0.75 hover:bg-surface-hover">
                      <span className="truncate text-[12px] text-fg-secondary">{classificationLabel(locale, sector.name)}</span>
                      <span className="relative h-2" aria-hidden>
                        <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                        {value !== null && (
                          <span
                            className={value >= 0 ? "absolute inset-y-0 left-1/2 bg-positive/70" : "absolute inset-y-0 right-1/2 bg-negative/70"}
                            style={{ width: `${width}%` }}
                          />
                        )}
                      </span>
                      <PerformanceBadge value={value} label={timeRangeLabel(locale, range)} className="text-2xs" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <BreadthPanel title={`${data.universe.label} ${messages.market.breadth}`} breadth={data.universeStats.breadth} range={range} provenance={data.marketProvenance} locale={locale} />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,25rem),1fr))] gap-2">
        {data.rankings.map((ranking) => (
          <RankingTable key={ranking.definition.id} ranking={ranking} provenance={data.marketProvenance} locale={locale} />
        ))}
      </div>

      <p className="px-0.5 text-[10px] text-fg-muted">
        {locale === "es" ? "Universo: componentes actuales de " : "Universe: current constituents of the "}<Link href={indexPath(data.universe.indexSlug)} className="underline hover:text-link">{data.universe.label}</Link>. {locale === "es" ? "Las cifras sectoriales son índices sintéticos de MarketRadar ponderados por capitalización (capitalización al cierre anterior; solo capitalizaciones verificadas), no niveles oficiales de índices." : "Sector figures are MarketRadar synthetic cap-weighted indices of those constituents (previous-close caps, verified caps only), not official index levels."}
      </p>
    </div>
  );
}
