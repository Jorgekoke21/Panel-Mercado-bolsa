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
import { ComparisonPanel } from "@/components/market/comparison-panel";
import { getRepositories } from "@/data/registry";
import { getEntityContext } from "@/services/news";
import { getComparison } from "@/services/relative-performance";
import { parseTimeRange } from "@/domain/time-range";
import { cn } from "@/lib/cn";
import { subIndustryPath } from "@/lib/routes";
import { getSubIndustryPageData } from "@/services/classification";
import { getGroupFundamentals } from "@/services/group-fundamentals";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";
import { localizeEntityContext } from "@/translation/server";
import { timeRangeLabel } from "@/i18n/domain";
import { formatInteger } from "@/lib/format";


export async function generateMetadata({ params }: PageProps<"/industry/[slug]/[subSlug]">): Promise<Metadata> {
  const { subSlug } = await params;
  return { title: subSlug };
}

export default async function SubIndustryPage({ params, searchParams }: PageProps<"/industry/[slug]/[subSlug]">) {
  const { locale, messages } = await getServerMessages();
  const [{ slug, subSlug }, query] = await Promise.all([params, searchParams]);
  const range = parseTimeRange(query.range);
  const data = await getSubIndustryPageData(getRepositories(), slug, subSlug, range);
  if (!data) notFound();
  const { subIndustry, industry, stats, provenance } = data;
  const comparison = await getComparison(getRepositories(), [
    { kind: "sub_industry", key: subIndustry.id, label: subIndustry.name, detail: "sub-industry" },
    { kind: "industry", key: industry.id, label: industry.name, detail: "industry" },
  ]);
  const fundamentals = await getGroupFundamentals(getRepositories(), data.rows.map((r) => r.summary));

  const context = await localizeEntityContext(await getEntityContext(getRepositories(), { kind: "subIndustry" as const, code: subIndustry.code }), locale);
  return (
    <EntityPage>
      <EntityHeader
        kind="subIndustry"
        locale={locale}
        title={classificationLabel(locale, subIndustry.name)}
        code={`${subIndustry.taxonomyCode} ${subIndustry.code}`}
        crumbs={data.crumbs.slice(0, -1)}
        badges={<Badge variant="outline">{subIndustry.taxonomyCode} {locale === "es" ? "subindustria" : "sub-industry"}</Badge>}
        meta={
          <>
            <span>{formatInteger(stats.performance.count, locale)} {locale === "es" ? "valores" : "securities"}</span>
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
            <TimeRangeSelector current={range} basePath={subIndustryPath(industry.slug, subIndustry.slug)} />
          </>
        }
      />

      {data.siblings.length > 1 && (
        <nav aria-label={locale === "es" ? "Subindustrias relacionadas" : "Sibling sub-industries"} className="flex flex-wrap gap-1">
          {data.siblings.map((s) => (
            <Link
              key={s.id}
              href={subIndustryPath(industry.slug, s.slug)}
              aria-current={s.id === subIndustry.id ? "page" : undefined}
              className={cn(
                "rounded-[3px] border px-2 py-0.5 text-2xs",
                s.id === subIndustry.id ? "border-accent text-fg" : "border-border text-fg-secondary hover:border-border-strong",
              )}
            >
              {classificationLabel(locale, s.name)}
            </Link>
          ))}
        </nav>
      )}

      {stats.performance.count === 0 ? (
        <Panel title={messages.navigation.companies}>
          <EmptyState title={locale === "es" ? "Aún no hay valores en esta subindustria" : "No securities in this sub-industry yet"} description={locale === "es" ? "El universo actual (S&P 500) no contiene empresas clasificadas aquí." : "The current universe (S&P 500) has no companies classified here."} />
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
                    { label: classificationLabel(locale, subIndustry.name), detail: locale === "es" ? "Índice sintético de MarketRadar · ponderado por capitalización (capitalizaciones del cierre anterior)" : "MarketRadar synthetic index · cap weight (previous-close caps)", returns: stats.performance.capWeighted, emphasis: true },
                    { label: `${classificationLabel(locale, subIndustry.name)} (${locale === "es" ? "ponderación igual" : "equal weight"})`, detail: locale === "es" ? "Índice sintético de MarketRadar · ponderación igual (rebalanceo diario)" : "MarketRadar synthetic index · equal weight (daily rebalance)", returns: stats.performance.equalWeighted },
                  ]}
                />
                <ComparisonPanel title={locale === "es" ? `Índice ${classificationLabel(locale, subIndustry.name)} de MarketRadar frente a ${classificationLabel(locale, industry.name)}` : `MarketRadar ${subIndustry.name} index vs ${industry.name}`} data={comparison} />
              </>
            }
            aside={
              <>
                <BreadthSection breadth={stats.breadth} range={range} provenance={provenance} locale={locale} />
                <GroupFundamentalsPanel data={fundamentals} scope={classificationLabel(locale, subIndustry.name)} locale={locale} />
              </>
            }
          />

          <Panel title={locale === "es" ? "Mapa de calor" : "Heatmap"} subtitle={locale === "es" ? "tamaño: capitalización verificada" : "size: verified market cap"} actions={<DataProvenanceBadge provenance={provenance} />}>
            <Heatmap data={data.heatmap} aspectRatio={3.2} locale={locale} />
          </Panel>

          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,25rem),1fr))] gap-2">
            {data.rankings.slice(0, 3).map((ranking) => (
              <RankingTable key={ranking.definition.id} ranking={ranking} provenance={provenance} showSector={false} locale={locale} />
            ))}
          </div>

          <ComponentsSection title={messages.navigation.companies} subtitle={`${data.rows.length} · ${locale === "es" ? "mayor capitalización primero" : "largest first"}`}>
            <CompanyTable
              rows={data.rows}
              locale={locale}
              columns={["company", "country", "exchange", "price", "change", "marketCap", "volume", "rsi"]}
              range={range}
              caption={`${classificationLabel(locale, subIndustry.name)} ${messages.navigation.companies.toLowerCase()}`}
              marketDataIsDemo={provenance.isDemo}
            />
          </ComponentsSection>
        </>
      )}

      <EntityGrid main={<WorldContextSection kind="subIndustry" name={classificationLabel(locale, subIndustry.name)} impacts={context.impacts} locale={locale} />} aside={<NewsSection name={classificationLabel(locale, subIndustry.name)} events={context.events} href={context.newsHref} locale={locale} />} />
    </EntityPage>
  );
}
