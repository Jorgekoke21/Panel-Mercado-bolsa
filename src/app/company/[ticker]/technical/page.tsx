import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { MarketDataStatus } from "@/components/states/market-data-status";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatCompact, formatNumber, formatPrice } from "@/lib/format";
import { computeTechnicals, type TechnicalIndicator } from "@/services/company-fundamentals";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { technicalTerm } from "@/i18n/domain";

function IndicatorValue({ indicator, currency, locale }: { indicator: TechnicalIndicator; currency: string; locale: "es" | "en" }) {
  if (indicator.value === null) return <span className="text-fg-muted" title={locale === "es" ? "Historial insuficiente" : "Not enough history"}>—</span>;
  if (indicator.unit === "price") return <>{formatPrice(indicator.value, indicator.label.startsWith("MACD") ? null : currency, locale)}</>;
  if (indicator.unit === "volume") return <>{formatCompact(indicator.value, null, locale)}</>;
  if (indicator.unit === "ratio") return <>{formatNumber(indicator.value, 2, locale)}×</>;
  return <>{formatNumber(indicator.value, 1, locale)}</>;
}

export default async function CompanyTechnicalPage({ params }: PageProps<"/company/[ticker]/technical">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const real = header.realMarketData;

  if (!real) {
    return (
      <Panel title={messages.company.technicalIndicators}>
        <EmptyState
          title={messages.company.noPriceHistory}
          description={locale === "es" ? "MarketRadar calcula los indicadores a partir de OHLCV diario. Aparecerán al conectar una fuente gratuita de precios (Alpaca Basic) para este valor." : "Indicators are calculated by MarketRadar from daily OHLCV. They will appear once a free price source (Alpaca Basic) is connected for this security."}
        />
      </Panel>
    );
  }

  const indicators = computeTechnicals(real);
  return (
    <Panel
      title={messages.company.technicalIndicators}
      subtitle={`${locale === "es" ? "Última sesión" : "Last session"} ${real.provenance.asOf.slice(0, 10)} · ${locale === "es" ? "ajustado por splits" : "split-adjusted"}`}
      actions={
        <>
          <Badge variant="outline" title={messages.technical.calculatedFromOhlcv}>
            {locale === "es" ? "Calculado" : "Calculated"}
          </Badge>
          <DataProvenanceBadge provenance={real.provenance} />
        </>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 px-2.5 py-1 sm:grid-cols-2">
        {indicators.map((i) => (
          <div key={i.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-2xs text-fg-muted" title={i.definition}>
              {technicalTerm(locale, i.label)}
              <span aria-hidden className="ml-0.5 text-fg-muted/60">ⓘ</span>
            </dt>
            <dd className="num font-mono text-[11.5px] text-fg">
              <IndicatorValue indicator={i} currency={header.security.currency} locale={locale} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border px-2.5 py-1.5">
        <MarketDataStatus provenance={real.provenance} />
      </div>
    </Panel>
  );
}
