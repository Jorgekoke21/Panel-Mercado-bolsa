import type { Metadata } from "next";
import Link from "next/link";
import { EntityHeader } from "@/components/entity/entity-header";
import { CountryBadge } from "@/components/market/country-badge";
import { IndexBadge } from "@/components/market/index-badge";
import { MetricCard } from "@/components/market/metric-card";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { MarketDataStatus } from "@/components/states/market-data-status";
import { Badge } from "@/components/ui/badge";
import { TabNav } from "@/components/ui/tab-nav";
import { type TimeRange } from "@/domain/time-range";
import { formatPrice } from "@/lib/format";
import { companyPath } from "@/lib/routes";
import { loadCompanyHeader } from "./load";
import { getServerMessages } from "@/i18n/server";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";

export async function generateMetadata({ params }: LayoutProps<"/company/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

const STRIP_RANGES: readonly TimeRange[] = ["1D", "1W", "1M", "YTD", "1Y"];

export default async function CompanyLayout({ children, params }: LayoutProps<"/company/[ticker]">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const { security, row, provenance } = header;
  const s = row.snapshot;

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 lg:p-4">
      <EntityHeader
        kind="company"
        locale={locale}
        title={security.companyName}
        code={security.ticker}
        crumbs={header.crumbs}
        badges={
          <>
            {header.memberships.map((m) => (
              <IndexBadge key={m.indexId} slug={m.indexSlug} label={m.indexShortName ?? m.indexName} kind={m.indexKind} />
            ))}
            <Badge variant="outline" title={security.exchange.name}>
              {security.exchange.acronym ?? security.exchange.mic}
            </Badge>
            <Badge variant="outline">{security.currency}</Badge>
            {security.shareClass && <Badge variant="outline">{locale === "es" ? "Clase" : "Class"} {security.shareClass}</Badge>}
            <CountryBadge code={security.headquarters.countryCode} name={security.headquarters.countryName} />
            {header.themes.map((t) => (
              <Badge key={t.id} variant="accent" title={`${locale === "es" ? "Temática · fuente" : "Theme · source"}: ${locale === "es" ? ({ manual: "manual", provider: "proveedor", ai: "IA" } as Record<string, string>)[t.source] ?? t.source : t.source}`}>
                {classificationLabel(locale, t.name)}
              </Badge>
            ))}
          </>
        }
        meta={
          header.otherListings.length > 0 ? (
            <span>
              {locale === "es" ? "Otras clases de acciones:" : "Other share classes:"}{" "}
              {header.otherListings.map((l, i) => (
                <Link key={l.securityId} href={companyPath(l.ticker)} className="font-mono text-fg-secondary hover:text-link">
                  {i > 0 && ", "}
                  {l.ticker}
                </Link>
              ))}
            </span>
          ) : undefined
        }
        aside={
          <div className="flex items-baseline gap-2">
            <span className="num font-display text-[28px] leading-none font-extrabold text-fg">{formatPrice(s?.price, security.currency, locale)}</span>
            <PerformanceBadge value={s?.returns["1D"]} variant="pill" arrow label={timeRangeLabel(locale, "1D")} className="text-xs" />
            <DataProvenanceBadge provenance={provenance} />
          </div>
        }
      />

      <MarketDataStatus provenance={provenance} className="px-0.5" />

      <section aria-label={messages.market.performance} className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {STRIP_RANGES.map((r) => (
          <MetricCard key={r} label={timeRangeLabel(locale, r)} value={<PerformanceBadge value={s?.returns[r]} label={timeRangeLabel(locale, r)} />} />
        ))}
        <div className="flex items-center justify-center rounded-card border-2 border-dashed border-border-strong px-2">
          <DataProvenanceBadge provenance={provenance} />
        </div>
      </section>

      <TabNav
        label={messages.company.companySections}
        items={[
          { label: messages.company.overview, href: companyPath(security.ticker) },
          { label: messages.company.financials, href: companyPath(security.ticker, "financials") },
          { label: messages.company.valuation, href: companyPath(security.ticker, "valuation") },
          { label: messages.company.technical, href: companyPath(security.ticker, "technical") },
          { label: messages.company.news, href: companyPath(security.ticker, "news") },
          { label: messages.company.earnings, href: companyPath(security.ticker, "earnings") },
          { label: messages.company.peers, href: companyPath(security.ticker, "peers") },
          { label: messages.company.ai, href: companyPath(security.ticker, "ai"), tone: "ai" },
        ]}
      />
      {children}
    </div>
  );
}
