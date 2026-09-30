import Link from "next/link";
import { EntityGrid } from "@/components/entity/entity-page";
import { ChartSection, NewsSection, PerformanceSection, WorldContextSection } from "@/components/entity/sections";
import { CompanyCard } from "@/components/market/company-card";
import { FinancialMetric } from "@/components/market/financial-metric";
import { SyntheticBadge } from "@/components/market/index-badge";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChartPanel } from "@/components/market/price-chart-panel";
import { RangeBar } from "@/components/market/range-bar";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { ComparisonPanel } from "@/components/market/comparison-panel";
import { getRepositories } from "@/data/registry";
import type { NodeKey } from "@/knowledge/types";
import { getGroupNews, getImpactsOn } from "@/services/news";
import { getComparison } from "@/services/relative-performance";
import { MARKET_CAP_REASON_TEXT, MARKET_CAP_STATUS_TEXT } from "@/lib/calculations/market-cap";
import { formatCompact, formatDate, formatInteger, formatNumber, formatRatio } from "@/lib/format";
import { companyPath } from "@/lib/routes";
import { getCompanyOverview } from "@/services/companies";
import { loadCompanyHeader } from "./load";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";
import { financialTerm } from "@/i18n/domain";
import { marketCapReasonLabel, marketCapStatusLabel } from "@/i18n/domain";
import { localizeEntityContext } from "@/translation/server";

export default async function CompanyOverviewPage({ params }: PageProps<"/company/[ticker]">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const overview = await getCompanyOverview(getRepositories(), header);
  const { security, row } = header;
  const real = header.realMarketData;
  const s = row.snapshot;
  const c = security.classification;
  const hq = [security.headquarters.city, security.headquarters.region, security.headquarters.countryName ? classificationLabel(locale, security.headquarters.countryName) : null].filter(Boolean).join(", ");
  const spMembership = header.memberships[0];
  const comparison = real
    ? await getComparison(
        getRepositories(),
        [
          ...(c
            ? [
                { kind: "industry" as const, key: c.industry.id, label: c.industry.name, detail: "industry" },
                { kind: "sector" as const, key: c.sector.id, label: c.sector.name, detail: "sector" },
              ]
            : []),
          { kind: "index" as const, key: "sp500", label: "S&P 500 constituents", detail: "synthetic, not the official S&P 500" },
        ],
        { id: security.securityId, label: security.ticker, detail: "price return", points: real.chart.bars.map((b) => ({ time: b.time, value: b.close })) },
      )
    : null;
  const companyNodes = [`company:${security.companyId}`, ...(c ? [`subIndustry:${c.subIndustry.code}`, `industry:${c.industry.code}`] : [])] as NodeKey[];
  const [contextEvents, contextImpacts] = await Promise.all([
    getGroupNews(getRepositories(), [companyNodes[0] as NodeKey], { limit: 6 }),
    getImpactsOn(getRepositories(), companyNodes, { limit: 6 }),
  ]);
  const localizedContext = await localizeEntityContext({ events: contextEvents, impacts: contextImpacts }, locale);
  const referenceDataset = overview.datasets.find((d) => d.id === spMembership?.datasetId);

  return (
    <>
      <EntityGrid
        main={
          <>
            <Panel title={messages.company.keyMetrics} actions={<DataProvenanceBadge provenance={header.provenance} />}>
              <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-4">
                <MetricCard
                  label={financialTerm(locale, real ? "Market cap (calc.)" : "Market cap")}
                  value={formatCompact(s?.marketCap, security.currency, locale)}
                  footnote={real ? marketCapStatusLabel(locale, real.marketCap.status, MARKET_CAP_STATUS_TEXT[real.marketCap.status]) : undefined}
                  definition={
                    real
                      ? `${locale === "es" ? "Último cierre × acciones en circulación" : "Last close × shares outstanding"}${real.shares ? ` (${formatInteger(real.shares.shares, locale)} ${locale === "es" ? "acciones a fecha de" : "shares as of"} ${real.shares.asOfDate}, ${real.provenance.sourceLabel})` : ""}. ${locale === "es" ? "Estado" : "Status"} ${real.marketCap.status}: ${marketCapReasonLabel(locale, real.marketCap.reason, MARKET_CAP_REASON_TEXT[real.marketCap.reason])}. ${locale === "es" ? "Solo se muestran valores verificados." : "Only verified values are shown."}`
                      : undefined
                  }
                />
                <MetricCard label={messages.market.volume} value={formatCompact(s?.volume, null, locale)} footnote={`${locale === "es" ? "media 20d" : "20d avg"} ${formatCompact(s?.averageVolume20, null, locale)}`} />
                <MetricCard label={messages.market.relativeVolume} value={formatRatio(s?.relativeVolume, 2, locale)} definition={locale === "es" ? "Volumen de la última sesión dividido por la media de las 20 sesiones anteriores." : "Volume of the last session divided by its 20-session average."} />
                <MetricCard label="RSI 14" value={formatNumber(s?.rsi14, 1, locale)} definition={locale === "es" ? "Índice de fuerza relativa de las últimas 14 sesiones (0–100)." : "Relative Strength Index over 14 sessions (0–100)."} />
              </div>
              <div className="border-t border-border px-2.5 py-2">
                <RangeBar low={s?.low52w ?? null} high={s?.high52w ?? null} current={s?.price ?? null} currency={security.currency} locale={locale} label={locale === "es" ? "Rango de 52 semanas" : "52-week range"} />
              </div>
              {real && (
                <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
                  {locale === "es" ? <>Calculado por MarketRadar a partir de precios de cierre de {real.provenance.sourceLabel} (ajustados por splits, rendimiento del precio). No se usan ratios del proveedor.</> : <>Calculated by MarketRadar from {real.provenance.sourceLabel} end-of-day prices (split-adjusted, price return). No provider ratios are used here.</>}
                </p>
              )}
            </Panel>
            {real ? (
              <>
                <PriceChartPanel title={locale === "es" ? `${security.ticker} · precio` : `${security.ticker} price`} chart={real.chart} provenance={real.provenance} firstSession={real.firstSession} locale={locale} />
                <ComparisonPanel title={locale === "es" ? `${security.ticker} frente a industria, sector y componentes del S&P 500` : `${security.ticker} vs industry, sector and S&P 500 constituents`} data={comparison} />
              </>
            ) : (
              <ChartSection
                title={locale === "es" ? `${security.ticker} · precio` : `${security.ticker} price`}
                seriesType="candlestick"
                comparisons={[c ? `vs ${classificationLabel(locale, c.industry.name)}` : (locale === "es" ? "vs industria" : "vs industry"), c ? `vs ${classificationLabel(locale, c.sector.name)}` : (locale === "es" ? "vs sector" : "vs sector"), locale === "es" ? "vs componentes del S&P 500" : "vs S&P 500 constituents"]}
              />
            )}
            {real ? (
              <>
                <PerformanceSection
                  title={messages.market.performance}
                  provenance={header.provenance}
                  lines={[{ label: overview.company.label, detail: `${overview.company.detail} · price return`, returns: overview.company.returns, emphasis: true }]}
                  note={locale === "es" ? "Rendimiento del precio con cierres ajustados por splits (sin reinversión de dividendos)." : "Price return from split-adjusted closes (dividends not reinvested)."}
                />
                <PerformanceSection
                  title={locale === "es" ? "Contexto de industria y sector" : "Industry & sector context"}
                  provenance={overview.aggregatesProvenance}
                  badges={<SyntheticBadge methodology="cap_weight" />}
                  lines={overview.aggregates.map((l) => ({ label: l.label, detail: l.detail, returns: l.returns, emphasis: false }))}
                  note={
                    overview.aggregatesProvenance.isDemo
                      ? (locale === "es" ? "Sigue en DEMO: los agregados de industria, sector y componentes usan datos simulados (sin precios sincronizados). No son comparables con el rendimiento real anterior." : "Still DEMO: industry, sector and constituents aggregates use simulated data (no synced prices). Not comparable with the real performance above.")
                      : (locale === "es" ? "Índices sintéticos de MarketRadar ponderados por capitalización de valores reales (capitalización al cierre anterior, solo datos verificados y componentes actuales); no son niveles oficiales." : "MarketRadar synthetic cap-weighted indices of real securities (previous-close market caps, verified caps only; current constituents), not official index levels.")
                  }
                />
              </>
            ) : (
              <PerformanceSection
                title={locale === "es" ? "Rendimiento relativo" : "Relative performance"}
                provenance={header.provenance}
                badges={<SyntheticBadge methodology="cap_weight" />}
                lines={[overview.company, ...overview.aggregates].map((l) => ({ label: l.label, detail: l.detail, returns: l.returns, emphasis: l.kind === "company" }))}
                note={locale === "es" ? "Las líneas de industria, sector y componentes son agregados sintéticos de MarketRadar ponderados por capitalización, no niveles oficiales de índices." : "Industry, sector and constituents lines are MarketRadar cap-weighted aggregates (synthetic), not official index levels."}
              />
            )}
          </>
        }
        aside={
          <>
            <Panel title={messages.company.identity} actions={<Badge variant="positive" title={locale === "es" ? "Datos de referencia del conjunto fijado; no son simulados" : "Reference data from the pinned seed dataset — not simulated"}>{locale === "es" ? "Referencia" : "Reference"}</Badge>}>
              <dl className="px-2.5 py-1">
                <FinancialMetric label={messages.common.company} value={security.companyName} />
                <FinancialMetric label={messages.market.ticker} value={security.ticker} />
                <FinancialMetric label={messages.market.exchange} value={`${security.exchange.name} (${security.exchange.mic})`} />
                <FinancialMetric label={messages.market.currency} value={security.currency} />
                <FinancialMetric label={messages.common.sector} value={c ? classificationLabel(locale, c.sector.name) : "—"} />
                <FinancialMetric label={messages.common.industry} value={c ? classificationLabel(locale, c.industry.name) : "—"} />
                <FinancialMetric label={messages.common.subIndustry} value={c ? classificationLabel(locale, c.subIndustry.name) : "—"} />
                <FinancialMetric label={messages.company.headquarters} value={hq || "—"} />
                <FinancialMetric label={messages.company.founded} value={overview.profile?.foundedYear ?? "—"} />
                <FinancialMetric label="SEC CIK" value={overview.profile?.cik ?? "—"} definition={locale === "es" ? "Clave de Índice Central: identificador del emisor en la SEC." : "Central Index Key: SEC identifier of the issuer."} />
                <FinancialMetric
                  label={spMembership ? (locale === "es" ? `En ${spMembership.indexShortName ?? spMembership.indexName} desde` : `In ${spMembership.indexShortName ?? spMembership.indexName} since`) : (locale === "es" ? "Miembro del índice desde" : "Index member since")}
                  value={formatDate(spMembership?.addedOn, locale)}
                />
                <FinancialMetric label={messages.company.employees} value={formatInteger(overview.profile?.employees, locale)} />
                <FinancialMetric
                  label={messages.company.website}
                  value={
                    overview.profile?.website ? (
                      <a href={overview.profile.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {overview.profile.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
              </dl>
              {referenceDataset && (
                <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
                  {locale === "es" ? "Fuente" : "Source"}: {referenceDataset.source}
                  {referenceDataset.sourceRevision && ` · revision ${referenceDataset.sourceRevision}`}
                  {referenceDataset.sourceRevisionAt && ` (${formatDate(referenceDataset.sourceRevisionAt, locale)})`}
                  {referenceDataset.isSecondarySource && ` · ${locale === "es" ? "fuente secundaria" : "secondary source"}`}
                </p>
              )}
            </Panel>
            <Panel title={messages.company.about}>
              {overview.profile?.description ? (
                <><p className="px-2.5 py-2 text-2xs leading-relaxed text-fg-secondary">{overview.profile.description}</p><p className="border-t border-border px-2.5 py-1 text-[10px] text-fg-muted">{locale === "es" ? "Descripción original del proveedor; se muestra sin cambios." : "Original provider description, shown unchanged."}</p></>
              ) : (
                <EmptyState compact phase="2" title={messages.company.noDescription} description={messages.company.descriptionSource} />
              )}
            </Panel>
            <Panel
              title={messages.company.peers}
              subtitle={c ? classificationLabel(locale, c.subIndustry.name) : undefined}
              actions={
                <>
                  <DataProvenanceBadge provenance={overview.peersProvenance} />
                  <Link href={companyPath(security.ticker, "peers")} className="text-2xs font-semibold text-accent uppercase hover:underline">
                    {locale === "es" ? "Ver comparables" : "All peers"}
                  </Link>
                </>
              }
            >
              {overview.peers.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 p-2">
                  {overview.peers.slice(0, 6).map((p) => (
                    <CompanyCard key={p.summary.securityId} row={p} range="1D" locale={locale} />
                  ))}
                </div>
              ) : (
                <EmptyState compact title={messages.company.noPeers} />
              )}
            </Panel>
          </>
        }
      />
      <EntityGrid main={<WorldContextSection kind="company" name={security.companyName} impacts={localizedContext.impacts} locale={locale} />} aside={<NewsSection name={security.companyName} events={localizedContext.events} href={companyPath(security.ticker, "news")} locale={locale} />} />
    </>
  );
}
