import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityHeader } from "@/components/entity/entity-header";
import { EntityGrid, EntityPage } from "@/components/entity/entity-page";
import {
  BreadthSection,
  ComponentsSection,
  NewsSection,
  PerformanceSection,
  WorldContextSection,
} from "@/components/entity/sections";
import { CompanyTable } from "@/components/market/company-table";
import { GroupFundamentalsPanel } from "@/components/market/group-fundamentals-panel";
import { Heatmap } from "@/components/market/heatmap";
import { SyntheticBadge } from "@/components/market/index-badge";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { RankingTable } from "@/components/market/ranking-table";
import { formatMoneyAggregate } from "@/components/market/sector-card";
import { TimeRangeSelector } from "@/components/market/time-range-selector";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { ComparisonPanel } from "@/components/market/comparison-panel";
import { getRepositories } from "@/data/registry";
import { getEntityContext } from "@/services/news";
import { getComparison } from "@/services/relative-performance";
import { parseTimeRange, type TimeRange } from "@/domain/time-range";
import { companiesPath, industryPath, sectorPath } from "@/lib/routes";
import { getSectorPageData } from "@/services/classification";
import { getGroupFundamentals } from "@/services/group-fundamentals";
import { getServerMessages } from "@/i18n/server";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";
import { localizeEntityContext } from "@/translation/server";
import { formatInteger } from "@/lib/format";

import type { ClassificationGroup } from "@/services/market-rows";

export async function generateMetadata({ params }: PageProps<"/sector/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function SectorPage({ params, searchParams }: PageProps<"/sector/[slug]">) {
  const { locale, messages } = await getServerMessages();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const range = parseTimeRange(query.range);
  const data = await getSectorPageData(getRepositories(), slug, range);
  if (!data) notFound();
  const { sector, stats, provenance } = data;
  const fundamentals = await getGroupFundamentals(getRepositories(), data.rows.map((r) => r.summary));
  const comparison = await getComparison(getRepositories(), [
    { kind: "sector", key: sector.id, label: sector.name, detail: "sector" },
    { kind: "index" as const, key: "sp500", label: "S&P 500 constituents", detail: "synthetic, not the official S&P 500" },
  ]);
  const industryCount = data.industryGroups.reduce((n, g) => n + g.industries.length, 0);

  const context = await localizeEntityContext(await getEntityContext(getRepositories(), { kind: "sector" as const, code: sector.code }), locale);
  return (
    <EntityPage>
      <EntityHeader
        kind="sector"
        locale={locale}
        title={classificationLabel(locale, sector.name)}
        code={`${sector.taxonomyCode} ${sector.code}`}
        crumbs={[]}
        badges={<Badge variant="outline">{sector.taxonomyCode} {locale === "es" ? "sector" : "sector"}</Badge>}
        meta={
          <>
            <span>{formatInteger(stats.performance.count, locale)} {locale === "es" ? "valores" : "securities"}</span>
            <span>{formatInteger(data.industryGroups.length, locale)} {locale === "es" ? "grupos de industrias" : "industry groups"}</span>
            <span>{formatInteger(industryCount, locale)} {locale === "es" ? "industrias" : "industries"}</span>
            <span>
              {locale === "es" ? "Capitalización bursátil agregada:" : "Aggregate market cap:"} <span className="num font-mono text-fg-secondary">{formatMoneyAggregate(stats.performance.marketCap, locale)}</span>{" "}
              {provenance.isDemo ? (
                <span className="text-demo">(demo)</span>
              ) : (
                <span className="text-fg-muted" title={locale === "es" ? "Solo se suman capitalizaciones verificadas; los valores sin capitalización verificada se excluyen y no se estiman." : "Sum of verified security market caps only; securities without a verified cap are excluded, never estimated."}>
                  ({locale === "es" ? "solo capitalizaciones verificadas" : "verified caps only"})
                </span>
              )}
            </span>
          </>
        }
        aside={
          <>
            <PerformanceBadge value={stats.performance.capWeighted[range]} variant="pill" arrow label={timeRangeLabel(locale, range)} className="text-sm" />
            <TimeRangeSelector current={range} basePath={sectorPath(sector.slug)} />
          </>
        }
      />

      {stats.performance.count === 0 ? (
        <Panel title={messages.navigation.companies}>
          <EmptyState title={locale === "es" ? "Aún no hay valores en este sector" : "No securities in this sector yet"} description={locale === "es" ? "El universo actual no contiene empresas clasificadas aquí." : "The current universe has no companies classified here."} />
        </Panel>
      ) : (
        <>
          <EntityGrid
            main={
              <>
                <PerformanceSection
                  provenance={provenance}
                  locale={locale}
                  badges={<SyntheticBadge methodology="cap_weight" />}
                  lines={[
                    { label: classificationLabel(locale, sector.name), detail: locale === "es" ? "Índice sintético de MarketRadar · ponderado por capitalización (capitalizaciones del cierre anterior)" : "MarketRadar synthetic index · cap weight (previous-close caps)", returns: stats.performance.capWeighted, emphasis: true },
                    { label: `${classificationLabel(locale, sector.name)} (${locale === "es" ? "ponderación igual" : "equal weight"})`, detail: locale === "es" ? "Índice sintético de MarketRadar · ponderación igual (rebalanceo diario)" : "MarketRadar synthetic index · equal weight (daily rebalance)", returns: stats.performance.equalWeighted },
                  ]}
                  note={locale === "es" ? "Una gran diferencia entre rendimientos ponderados por capitalización e igualitarios indica que unas pocas empresas grandes impulsan el sector." : "A large gap between cap- and equal-weighted returns means a few large companies are driving the sector."}
                />
                <ComparisonPanel title={locale === "es" ? `Índice ${classificationLabel(locale, sector.name)} de MarketRadar frente a componentes del S&P 500` : `MarketRadar ${sector.name} index vs S&P 500 constituents`} data={comparison} />
              </>
            }
            aside={
              <>
                <BreadthSection breadth={stats.breadth} range={range} provenance={provenance} locale={locale} />
                <GroupFundamentalsPanel data={fundamentals} scope={classificationLabel(locale, sector.name)} locale={locale} />
              </>
            }
          />

          <EntityGrid
            main={
              <Panel title={locale === "es" ? "Mapa de calor" : "Heatmap"} subtitle={locale === "es" ? "industria → empresa · tamaño: capitalización verificada" : "industry → company · size: verified market cap"} actions={<DataProvenanceBadge provenance={provenance} />}>
                <Heatmap data={data.heatmap} aspectRatio={2.2} locale={locale} />
              </Panel>
            }
            aside={
              <Panel title={messages.common.industries} subtitle={`${industryCount}`} actions={<SyntheticBadge methodology="cap_weight" />} bodyClassName="max-h-[28rem] overflow-y-auto scroll-thin">
                <Table caption={locale === "es" ? "Industrias de este sector" : "Industries in this sector"}>
                  <THead>
                    <tr>
                      <Th>{messages.common.industry}</Th>
                      <Th numeric>#</Th>
                      <Th numeric>{range}</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {data.industryGroups.map((group) => (
                      <GroupRows key={group.id} name={classificationLabel(locale, group.name)} industries={group.industries} range={range} locale={locale} />
                    ))}
                  </tbody>
                </Table>
              </Panel>
            }
          />

          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,25rem),1fr))] gap-2">
            {data.rankings.map((ranking) => (
              <RankingTable key={ranking.definition.id} ranking={ranking} provenance={provenance} showSector={false} locale={locale} />
            ))}
          </div>

          <ComponentsSection
            title={messages.navigation.companies}
            subtitle={`${data.rows.length} · ${locale === "es" ? "mayor capitalización primero" : "largest first"}`}
            actions={
              <Link href={companiesPath({ sector: sector.slug })} className="text-2xs font-semibold text-accent uppercase hover:underline">
                {locale === "es" ? "Ver en Empresas" : "Open in Companies"}
              </Link>
            }
          >
            <CompanyTable
              rows={data.rows}
              locale={locale}
              columns={["company", "industry", "subIndustry", "country", "price", "change", "marketCap", "rsi"]}
              range={range}
              caption={`${classificationLabel(locale, sector.name)} ${messages.navigation.companies.toLowerCase()}`}
              marketDataIsDemo={provenance.isDemo}
            />
          </ComponentsSection>
        </>
      )}

      <EntityGrid main={<WorldContextSection kind="sector" name={classificationLabel(locale, sector.name)} impacts={context.impacts} locale={locale} />} aside={<NewsSection name={classificationLabel(locale, sector.name)} events={context.events} href={context.newsHref} locale={locale} />} />
    </EntityPage>
  );
}

function GroupRows({
  name,
  industries,
  range,
  locale,
}: {
  name: string;
  industries: ClassificationGroup[];
  range: TimeRange;
  locale: "es" | "en";
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="bg-surface-raised px-2 py-0.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
          {name}
        </td>
      </tr>
      {industries.map((i) => (
        <Tr key={i.id}>
          <Td className="max-w-48 truncate">
            <Link href={industryPath(i.slug)} className="text-fg-secondary hover:text-accent" title={i.name}>
              {classificationLabel(locale, i.name)}
            </Link>
          </Td>
          <Td numeric className="text-fg-muted">
            {i.stats.performance.count}
          </Td>
          <Td numeric>
            <PerformanceBadge value={i.stats.performance.capWeighted[range]} />
          </Td>
        </Tr>
      ))}
    </>
  );
}
