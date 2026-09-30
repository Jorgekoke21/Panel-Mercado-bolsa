import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { MarketDataStatus } from "@/components/states/market-data-status";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type { Provenance } from "@/domain/provenance";
import type { CompanyChartData } from "@/services/company-market-data";
import { PriceChart } from "./price-chart";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { formatDate } from "@/lib/format";

interface PriceChartPanelProps {
  title: string;
  chart: CompanyChartData;
  provenance: Provenance;
  firstSession: string;
  locale?: Locale;
}

/** Gráfico real de una ficha: velas + volumen + EMAs, con la procedencia siempre visible. */
export function PriceChartPanel({ title, chart, provenance, firstSession, locale = DEFAULT_LOCALE }: PriceChartPanelProps) {
  return (
    <Panel
      title={title}
      actions={
        <>
          <Badge variant="outline" title={locale === "es" ? "Las velas solo se ajustan por splits (rendimiento del precio). No se reinvierten dividendos." : "Candles are adjusted for splits only (price return). Dividends are not reinvested."}>
            {locale === "es" ? "Ajustado por splits" : "Split-adjusted"}
          </Badge>
          <DataProvenanceBadge provenance={provenance} />
        </>
      }
    >
      <div className="flex flex-col gap-2 p-2.5">
        <PriceChart
          bars={chart.bars}
          overlays={chart.overlays}
          defaultRange="1Y"
            ariaLabel={locale === "es" ? `${title}: gráfico diario de velas del ${formatDate(firstSession, locale)} al ${formatDate(provenance.asOf, locale)}` : `${title}: daily candlestick chart from ${formatDate(firstSession, locale)} to ${formatDate(provenance.asOf, locale)}`}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <MarketDataStatus provenance={provenance} />
          <p className="text-[10px] text-fg-muted">
            {locale === "es" ? `${chart.bars.length} sesiones desde ${formatDate(firstSession, locale)} · ${chart.currency} · OHLC ajustado por MarketRadar a partir de precios sin ajustar y splits · ` : `${chart.bars.length} sessions since ${formatDate(firstSession, locale)} · ${chart.currency} · OHLC adjusted by MarketRadar from raw prices + splits · `}{" "}
            {chart.volumeBasis === "raw"
              ? (locale === "es" ? "volumen ajustado por splits por MarketRadar (cinta consolidada, incluidas horas extendidas)" : "volume split-adjusted by MarketRadar (consolidated tape, incl. extended hours)")
              : (locale === "es" ? "volumen según lo informa el proveedor (ajustado por splits)" : "volume as reported (split-adjusted by provider)")}{" "}
            · {locale === "es" ? "EMA calculadas por MarketRadar" : "EMAs calculated by MarketRadar"}
          </p>
        </div>
      </div>
    </Panel>
  );
}
