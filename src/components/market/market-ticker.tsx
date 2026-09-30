import Link from "next/link";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import type { BenchmarkDefinition, BenchmarkQuote } from "@/domain/market-data";
import type { Provenance } from "@/domain/provenance";
import { formatNumber, formatPrice } from "@/lib/format";
import { indexPath } from "@/lib/routes";
import { MetricCard } from "./metric-card";
import { PerformanceBadge } from "./performance-badge";
import { Sparkline } from "./sparkline";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { classificationLabel } from "@/i18n/classification";

interface MarketTickerProps {
  items: { definition: BenchmarkDefinition; quote: BenchmarkQuote | null }[];
  provenance: Provenance;
  locale?: Locale;
}

function formatBenchmark(definition: BenchmarkDefinition, value: number | null, locale: Locale) {
  if (definition.unit === "currency") return formatPrice(value, definition.currency, locale);
  if (definition.unit === "percent") return value === null ? formatNumber(value, 2, locale) : `${formatNumber(value, 3, locale)}${locale === "es" ? " %" : "%"}`;
  return formatNumber(value, 2, locale);
}

/** Tira de contexto global (índices, volatilidad, divisa, materias primas, tipos). */
export function MarketTicker({ items, provenance, locale = DEFAULT_LOCALE }: MarketTickerProps) {
  const spanishLabels: Record<string, string> = { gold: "Oro", silver: "Plata", "wti crude": "Petróleo WTI", "brent crude": "Petróleo Brent", "10y treasury": "Bono del Tesoro a 10 años", "us 10y yield": "Rendimiento del bono del Tesoro a 10 años", "us dollar index": "Índice del dólar estadounidense", "natural gas": "Gas natural" };
  const label = (value: string) => locale === "es" ? spanishLabels[value.trim().toLocaleLowerCase("en-US")] ?? classificationLabel(locale, value) : value;
  return (
    <section aria-label={locale === "es" ? "Resumen del mercado" : "Market overview"} className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-2xs font-semibold tracking-wide text-fg-muted uppercase">{locale === "es" ? "Resumen del mercado" : "Market overview"}</h2>
        <DataProvenanceBadge provenance={provenance} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5">
        {items.map(({ definition, quote }) => {
          const card = (
            <MetricCard
              label={label(definition.label)}
              value={formatBenchmark(definition, quote?.value ?? null, locale)}
              change={<PerformanceBadge value={quote?.change1D ?? null} label={locale === "es" ? "1 día" : "1 day"} />}
              footnote={definition.symbol}
              aside={<Sparkline values={quote?.sparkline ?? []} width={48} />}
              className={definition.indexSlug ? "hover:border-border-strong" : undefined}
            />
          );
          return definition.indexSlug ? (
            <Link key={definition.id} href={indexPath(definition.indexSlug)} className="min-w-0">
              {card}
            </Link>
          ) : (
            <div key={definition.id} className="min-w-0">
              {card}
            </div>
          );
        })}
      </div>
    </section>
  );
}
