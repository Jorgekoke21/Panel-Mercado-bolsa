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
import { parseTimeRange } from "@/domain/time-range";
import { industryPath, subIndustryPath } from "@/lib/routes";
import { getIndustryPageData } from "@/services/classification";
import { getGroupFundamentals } from "@/services/group-fundamentals";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";
import { localizeEntityContext } from "@/translation/server";
import { timeRangeLabel } from "@/i18n/domain";
import { formatInteger } from "@/lib/format";


export async function generateMetadata({ params }: PageProps<"/industry/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function IndustryPage({ params, searchParams }: PageProps<"/industry/[slug]">) {
  const { locale, messages } = await getServerMessages();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const range = parseTimeRange(query.range);
  const data = await getIndustryPageData(getRepositories(), slug, range);
  if (!data) notFound();
  const { industry, stats, provenance } = data;
  const comparison = await getComparison(getRepositories(), [
    { kind: "industry", key: industry.id, label: industry.name, detail: "industry" },
    ...(data.sector ? [{ kind: "sector" as const, key: data.sector.id, label: data.sector.name, detail: "sector" }] : []),
  ]);
  const fundamentals = await getGroupFundamentals(getRepositories(), data.rows.map((r) => r.summary));

  const context = await localizeEntityContext(await getEntityContext(getRepositories(), { kind: "industry" as const, code: industry.code }), locale);
  return (
    <EntityPage>
      <EntityHeader
        kind="industry"
        locale={locale}
        title={classificationLabel(locale, industry.name)}
        code={`${industry.taxonomyCode} ${industry.code}`}
        crumbs={data.crumbs.slice(0, -1)}
        badges={
          <>
            <Badge variant="outline">{industry.taxonomyCode} {locale === "es" ? "industria" : "industry"}</Badge>
            {data.industryGroup && <Badge variant="neutral">{locale === "es" ? "Grupo:" : "Group:"} {classificationLabel(locale, data.industryGroup.name)}</Badge>}
          </>
        }
        meta={
          <>
            <span>{formatInteger(stats.performance.count, locale)} {locale === "es" ? "valores" : "securities"}</span>
            <span>{formatInteger(data.subIndustries.length, locale)} {locale === "es" ? "subindustrias" : "sub-industries"}</span>
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
            <TimeRangeSelector current={range} basePath={industryPath(industry.slug)} />
          </>
        }
      />

      {stats.performance.count === 0 ? (
        <Panel title={messages.navigation.companies}>
          <EmptyState title={locale === "es" ? "Aún no hay valores en esta industria" : "No securities in this industry yet"} description={locale === "es" ? "El universo actual (S&P 500) no contiene empresas clasificadas en esta industria." : "The current universe (S&P 500) has no companies classified in this industry."} />
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
                    { label: classificationLabel(locale, industry.name), detail: locale === "es" ? "Índice sintético de MarketRadar · ponderado por capitalización (capitalizaciones del cierre anterior)" : "MarketRadar synthetic index · cap weight (previous-close caps)", returns: stats.performance.capWeighted, emphasis: true },
                    { label: `${classificationLabel(locale, industry.name)} (${locale === "es" ? "ponderación igual" : "equal weight"})`, detail: locale === "es" ? "Índice sintético de MarketRadar · ponderación igual (rebalanceo diario)" : "MarketRadar synthetic index · equal weight (daily rebalance)", returns: stats.performance.equalWeighted },
                  ]}
                />
                <ComparisonPanel title={locale === "es" ? `Índice ${classificationLabel(locale, industry.name)} de MarketRadar frente a ${data.sector ? classificationLabel(locale, data.sector.name) : "sector"}` : `MarketRadar ${industry.name} index vs ${data.sector?.name ?? "sector"}`} data={comparison} />
              </>
            }
            aside={
              <>
                <BreadthSection breadth={stats.breadth} range={range} provenance={provenance} locale={locale} />
                <GroupFundamentalsPanel data={fundamentals} scope={classificationLabel(locale, industry.name)} locale={locale} />
              </>
            }
          />

          <EntityGrid
            main={
              <Panel title={locale === "es" ? "Mapa de calor" : "Heatmap"} subtitle={locale === "es" ? "subindustria → empresa · tamaño: capitalización verificada" : "sub-industry → company · size: verified market cap"} actions={<DataProvenanceBadge provenance={provenance} />}>
                <Heatmap data={data.heatmap} aspectRatio={2.4} locale={locale} />
              </Panel>
            }
            aside={
              <Panel title={locale === "es" ? "Subindustrias" : "Sub-industries"} subtitle={`${data.subIndustries.length}`} actions={<SyntheticBadge methodology="cap_weight" />}>
                <Table caption={locale === "es" ? "Subindustrias" : "Sub-industries"}>
                  <THead>
                    <tr>
                      <Th>{messages.common.subIndustry}</Th>
                      <Th numeric>#</Th>
                      <Th numeric>{range}</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {data.subIndustries.map((s) => (
                      <Tr key={s.id}>
                        <Td className="max-w-48 truncate">
                          <Link href={subIndustryPath(industry.slug, s.slug)} className="text-fg-secondary hover:text-accent" title={s.name}>
                            {classificationLabel(locale, s.name)}
                          </Link>
                        </Td>
                        <Td numeric className="text-fg-muted">
                          {s.stats.performance.count}
                        </Td>
                        <Td numeric>
                          <PerformanceBadge value={s.stats.performance.capWeighted[range]} />
                        </Td>
                      </Tr>
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

          <ComponentsSection title={messages.navigation.companies} subtitle={`${data.rows.length} · ${locale === "es" ? "mayor capitalización primero" : "largest first"}`}>
            <CompanyTable
              rows={data.rows}
              locale={locale}
              columns={["company", "subIndustry", "country", "exchange", "price", "change", "marketCap", "rsi"]}
              range={range}
              caption={`${classificationLabel(locale, industry.name)} ${messages.navigation.companies.toLowerCase()}`}
              marketDataIsDemo={provenance.isDemo}
            />
          </ComponentsSection>
        </>
      )}

      <EntityGrid main={<WorldContextSection kind="industry" name={classificationLabel(locale, industry.name)} impacts={context.impacts} locale={locale} />} aside={<NewsSection name={classificationLabel(locale, industry.name)} events={context.events} href={context.newsHref} locale={locale} />} />
    </EntityPage>
  );
}
