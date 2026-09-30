"use client";

import { isStale, type Provenance } from "@/domain/provenance";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";

interface MarketDataStatusProps {
  provenance: Provenance;
  now?: Date;
  className?: string;
}

const FREQUENCY_LABEL = { eod: "EOD", delayed: "Delayed", realtime: "Real-time" } as const;

/**
 * Línea de procedencia explícita: "MARKET DATA: EODHD · AS OF: 2026-09-28 · EOD".
 * Para datos simulados dice DEMO sin ambigüedad. Solo muestra lo que declara el dato.
 */
export function MarketDataStatus({ provenance, now = new Date(), className }: MarketDataStatusProps) {
  const { locale, messages } = useI18n();
  if (provenance.isDemo) {
    return (
      <p className={cn("font-mono text-[10px] tracking-wide text-demo uppercase", className)} title={provenance.sourceLabel}>
        {messages.market.marketData}: {messages.common.demoData} · {locale === "es" ? "valores simulados, no son precios reales" : "simulated values, not real prices"}
      </p>
    );
  }
  const stale = isStale(provenance, now);
  const asOf = formatDate(provenance.asOf, locale);
  const detail = [
    `${locale === "es" ? "Fuente" : "Source"}: ${provenance.sourceLabel}`,
    provenance.dataset ? `${locale === "es" ? "Conjunto de datos" : "Dataset"}: ${provenance.dataset}` : null,
    provenance.ingestedAt ? `${locale === "es" ? "Descargado" : "Downloaded"}: ${formatDateTime(provenance.ingestedAt, locale)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <p className={cn("flex flex-wrap gap-x-2 font-mono text-[10px] tracking-wide text-fg-secondary uppercase", className)} title={detail}>
      <span>
        {messages.market.marketData}: <span className="text-fg">{provenance.sourceLabel}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        {locale === "es" ? "A fecha de:" : "As of:"} <span className={stale ? "text-warning" : "text-fg"}>{asOf}</span>
        {stale && (locale === "es" ? " (desactualizado)" : " (stale)")}
      </span>
      {provenance.coverage && provenance.coverage.covered < provenance.coverage.total && (
        <>
          <span aria-hidden>·</span>
          <span className="text-warning">
            {locale === "es" ? "Parcial" : "Partial"}: {provenance.coverage.covered}/{provenance.coverage.total}
          </span>
        </>
      )}
      {provenance.frequency && (
        <>
          <span aria-hidden>·</span>
          <span className="text-fg">{FREQUENCY_LABEL[provenance.frequency]}</span>
        </>
      )}
    </p>
  );
}
