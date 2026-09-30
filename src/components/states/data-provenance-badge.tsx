"use client";

import { Badge } from "@/components/ui/badge";
import { dataStatus, isStale, type Provenance } from "@/domain/provenance";
import { formatDate, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/provider";

interface DataProvenanceBadgeProps {
  provenance: Provenance;
  /** Referencia temporal para calcular "stale" (inyectable en tests). */
  now?: Date;
}

/**
 * Muestra la procedencia tal como la declara el dato (CAMBIO 7): DEMO, PARTIAL, STALE o la fuente
 * real, con fuente, fecha y cobertura en el tooltip. Nunca deduce ni inventa la fuente.
 */
export function DataProvenanceBadge({ provenance, now = new Date() }: DataProvenanceBadgeProps) {
  const { locale, messages } = useI18n();
  const asOfText = provenance.frequency === "eod" ? formatDate(provenance.asOf, locale) : formatDateTime(provenance.asOf, locale);
  const coverage = provenance.coverage ? ` · ${locale === "es" ? "Cobertura" : "Coverage"} ${provenance.coverage.covered}/${provenance.coverage.total}` : "";
  const detail = `${locale === "es" ? "Fuente" : "Source"}: ${provenance.sourceLabel} · ${locale === "es" ? "A fecha de" : "As of"} ${asOfText}${provenance.ingestedAt ? ` · ${locale === "es" ? "Calculado" : "Computed"} ${formatDateTime(provenance.ingestedAt, locale)}` : ""}${coverage}`;
  if (provenance.isDemo) {
    return (
      <Badge variant="demo" title={`${detail}. ${locale === "es" ? "Valores simulados; no son datos de mercado reales." : "Simulated values — not real market data."}`}>
        {messages.common.demoData}
      </Badge>
    );
  }
  if (dataStatus(provenance) === "PARTIAL" && provenance.coverage) {
    return (
      <Badge variant="warning" title={`${detail}. ${locale === "es" ? "Los componentes sin datos reales figuran como ausentes (nunca se simulan)." : "Members without real data are shown as missing (never simulated)."}`}>
        {locale === "es" ? "Parcial" : "Partial"} · {provenance.coverage.covered}/{provenance.coverage.total}
      </Badge>
    );
  }
  if (isStale(provenance, now)) {
    return (
      <Badge variant="warning" title={detail}>
        {locale === "es" ? "Desactualizado" : "Stale"}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" title={detail}>
      {provenance.frequency === "eod" ? `${locale === "es" ? "Real" : "Real"} · EOD ${asOfText}` : provenance.isDelayed ? (locale === "es" ? "Con retraso" : "Delayed") : provenance.sourceLabel}
    </Badge>
  );
}
