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
import { Heatmap } from "@/components/market/heatmap";
import { IndexKindBadge, SyntheticBadge } from "@/components/market/index-badge";
import { RankingTable } from "@/components/market/ranking-table";
import { SectorRotationMatrix } from "@/components/market/sector-rotation-matrix";
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
import { getGroupFundamentals } from "@/services/group-fundamentals";
import { GroupFundamentalsPanel } from "@/components/market/group-fundamentals-panel";
import { METHODOLOGY_LABELS } from "@/domain/market-index";
import { parseTimeRange, TIME_RANGES } from "@/domain/time-range";
import { formatInteger } from "@/lib/format";
import { companiesPath, indexPath, sectorPath } from "@/lib/routes";
import { getIndexPageData } from "@/services/markets";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";
import { localizeEntityContext } from "@/translation/server";

export async function generateMetadata({ params }: PageProps<"/index/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function IndexPage({ params, searchParams }: PageProps<"/index/[slug]">) {
  const { locale, messages } = await getServerMessages();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const range = parseTimeRange(query.range);
  const data = await getIndexPageData(getRepositories(), slug, range);
  if (!data) notFound();
  const { index, constituents, benchmark } = data;
  const comparison = index.constituentsTracked
    ? await getComparison(getRepositories(), [
        { kind: "index", key: index.slug, label: `${index.name} constituents`, detail: "synthetic, not the official index level" },
        ...(constituents?.sectors ?? []).map((g) => ({ kind: "sector" as const, key: g.id, label: g.name, detail: "sector" })),
      ])
    : null;
  const fundamentals = constituents ? await getGroupFundamentals(getRepositories(), constituents.rows.map((r) => r.summary)) : null;
  const performanceProvenance = benchmark?.provenance ?? constituents?.provenance ?? null;

  const context = await localizeEntityContext(await getEntityContext(getRepositories(), { kind: "index" as const, slug: index.slug }), locale);
  return (
    <EntityPage>
      <EntityHeader
        kind="index"
        locale={locale}
        title={index.name}
        code={index.code}
        badges={
          <>
            <IndexKindBadge kind={index.kind} />
            <Badge variant="outline">{locale === "es" ? ({ provider: "Metodología del proveedor", equal_weight: "Ponderación igual", cap_weight: "Ponderación por capitalización" } as const)[index.methodology] : METHODOLOGY_LABELS[index.methodology]}</Badge>
          </>
        }
        meta={
          <>
            <span>{locale === "es" ? "Proveedor:" : "Provider:"} {index.provider}</span>
            {index.countryCode && <span>{locale === "es" ? "País:" : "Country:"} {index.countryCode}</span>}
            {index.currency && <span>{locale === "es" ? "Divisa:" : "Currency:"} {index.currency}</span>}
            <span>{constituents ? `${formatInteger(constituents.rows.length, locale)} ${locale === "es" ? "componentes en seguimiento" : "constituents tracked"}` : messages.market.constituentsNotTracked}</span>
          </>
        }
        aside={<TimeRangeSelector current={range} basePath={indexPath(index.slug)} />}
      />

      <EntityGrid
        main={
          <>
            {performanceProvenance ? (
              <PerformanceSection
                provenance={performanceProvenance}
                locale={locale}
                badges={constituents && <SyntheticBadge methodology="cap_weight" />}
                lines={[
                  ...(benchmark
                    ? [{ label: index.name, detail: locale === "es" ? "Nivel del índice oficial" : "Official index level", returns: { "1D": benchmark.item.quote?.change1D ?? null }, emphasis: true }]
                    : []),
                  ...(constituents
                    ? [{ label: locale === "es" ? "Agregado de componentes" : "Constituents aggregate", detail: locale === "es" ? "Índice sintético de MarketRadar · ponderado por capitalización" : "MarketRadar synthetic index · cap weight", returns: constituents.stats.performance.capWeighted }]
                    : []),
                ]}
                note={locale === "es" ? "Los rendimientos oficiales de varios periodos estarán disponibles al contar con historial diario en la fase 2. La línea agregada la calcula MarketRadar y no representa el nivel oficial del índice." : "Official multi-period index returns arrive with daily history in Phase 2. The aggregate line is computed by MarketRadar and is not the official index level."}
              />
            ) : (
              <Panel title={locale === "es" ? "Rendimiento del índice" : "Index level performance"}>
                <EmptyState compact title={locale === "es" ? "No hay una fuente configurada para el índice" : "No index level feed configured"} description={locale === "es" ? "Los niveles oficiales del índice procederán del proveedor de datos de mercado (fase 2)." : "Official index levels will come from the market data provider (Phase 2)."} />
              </Panel>
            )}
            <ComparisonPanel title={locale === "es" ? `Índice de componentes de ${index.name} de MarketRadar frente a sectores` : `MarketRadar ${index.name} constituents index vs sectors`} data={comparison} />
          </>
        }
        aside={
          constituents ? (
            <>
              <BreadthSection breadth={constituents.stats.breadth} range={range} provenance={constituents.provenance} locale={locale} />
              {fundamentals && <GroupFundamentalsPanel data={fundamentals} scope={`${index.shortName ?? index.name} ${locale === "es" ? "componentes" : "constituents"}`} locale={locale} />}
            </>
          ) : (
            <Panel title={messages.market.breadth}>
              <EmptyState compact phase="7" title={messages.market.constituentsNotTracked} description={locale === "es" ? "La amplitud requiere los componentes del índice." : "Breadth needs the index constituents."} />
            </Panel>
          )
        }
      />

      {constituents && (
        <>
          <EntityGrid
            main={
              <Panel
                title={locale === "es" ? "Mapa de calor de componentes" : "Constituent heatmap"}
                subtitle={locale === "es" ? "sector → empresa · tamaño: capitalización verificada" : "sector → company · size: verified market cap"}
                actions={<DataProvenanceBadge provenance={constituents.provenance} />}
              >
                <Heatmap data={constituents.heatmap} locale={locale} />
              </Panel>
            }
            aside={
              <Panel title={locale === "es" ? "Desglose por sector" : "Sector breakdown"} subtitle={`${constituents.sectors.length} ${messages.common.sectors.toLowerCase()}`} actions={<SyntheticBadge methodology="cap_weight" />}>
                <ul className="flex flex-col py-1 text-2xs">
                  {constituents.sectors.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 px-2.5 py-0.75 hover:bg-surface-hover">
                      <Link href={sectorPath(s.slug)} className="truncate text-fg-secondary hover:text-link">
                        {classificationLabel(locale, s.name)}
                      </Link>
                      <span className="num flex shrink-0 gap-3 font-mono text-fg-muted">
                        <span>{formatInteger(s.stats.performance.count, locale)}</span>
                        <span className="w-16 text-right">{formatMoneyAggregate(s.stats.performance.marketCap, locale)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            }
          />

          <Panel title={locale === "es" ? "Rotación sectorial" : "Sector rotation"} subtitle={locale === "es" ? "componentes agrupados por sector" : "constituents grouped by sector"} actions={<><SyntheticBadge methodology="cap_weight" /><DataProvenanceBadge provenance={constituents.provenance} /></>}>
            <SectorRotationMatrix groups={constituents.sectors} ranges={TIME_RANGES} href={sectorPath} label={locale === "es" ? "Rendimiento sectorial por periodo" : "Sector returns by period"} locale={locale} />
          </Panel>

          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,25rem),1fr))] gap-2">
            {constituents.rankings.map((ranking) => (
              <RankingTable key={ranking.definition.id} ranking={ranking} provenance={constituents.provenance} locale={locale} />
            ))}
          </div>

          <ComponentsSection
            title={locale === "es" ? "Componentes" : "Constituents"}
            subtitle={`${formatInteger(constituents.rows.length, locale)} · ${locale === "es" ? "mayor capitalización primero" : "largest first"}`}
            actions={
              <Link href={companiesPath({ index: index.slug })} className="text-2xs font-semibold text-link uppercase hover:underline">
                {locale === "es" ? "Ver en Empresas" : "Open in Companies"}
              </Link>
            }
          >
            <CompanyTable
              rows={constituents.rows}
              locale={locale}
              columns={["company", "sector", "industry", "exchange", "price", "change", "marketCap"]}
              range={range}
              caption={`${index.name} ${locale === "es" ? "componentes" : "constituents"}`}
              marketDataIsDemo={constituents.provenance.isDemo}
            />
          </ComponentsSection>
        </>
      )}

      <EntityGrid main={<WorldContextSection kind="index" name={index.name} impacts={context.impacts} locale={locale} />} aside={<NewsSection name={index.name} events={context.events} href={context.newsHref} locale={locale} />} />
    </EntityPage>
  );
}
