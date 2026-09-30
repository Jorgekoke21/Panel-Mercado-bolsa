"use client";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type { ComparisonData } from "@/services/relative-performance";
import { RelativePerformanceChart } from "./relative-performance-chart";
import { useI18n } from "@/i18n/provider";

export const SYNTHETIC_INDEX_NOTE =
  "Synthetic MarketRadar indices, not official index levels: current constituents backfilled (survivorship bias), price return from split-adjusted closes. Equal weight rebalances daily; cap weight uses each member's previous-close market cap and only members with a verified market cap.";

/** Comparación rebased (base 100 al inicio del periodo): compañía / grupo vs grupos superiores. */
export function ComparisonPanel({ title, subtitle, data }: { title: string; subtitle?: string; data: ComparisonData | null }) {
  const { locale } = useI18n();
  const note = locale === "es"
    ? "Índices sintéticos de MarketRadar, no niveles oficiales: componentes actuales reconstruidos hacia atrás (sesgo de supervivencia), rendimiento del precio con cierres ajustados por splits. La ponderación igual se rebalancea a diario; la ponderación por capitalización usa el cierre anterior y solo incluye miembros con capitalización verificada."
    : SYNTHETIC_INDEX_NOTE;
  return (
    <Panel
      title={title}
      subtitle={subtitle ?? (locale === "es" ? "rebasado a 100 al inicio del periodo" : "rebased to 100 at the start of the period")}
      actions={
        <>
          <Badge variant="synthetic" title={note}>
            {locale === "es" ? "Sintético · MarketRadar" : "Synthetic · MarketRadar"}
          </Badge>
          {data?.asOf && (
            <Badge variant="neutral" title={`${locale === "es" ? "Calculado" : "Computed"} ${data.computedAt ?? "-"} ${locale === "es" ? "con precios de cierre" : "from"} Alpaca (SIP) ${locale === "es" ? "diarios" : "end-of-day prices"}`}>
              {locale === "es" ? "Real · cierre" : "Real · EOD"} {data.asOf}
            </Badge>
          )}
        </>
      }
    >
      {data && data.lines.length > 0 ? (
        <div className="flex flex-col gap-1.5 p-2.5">
          <RelativePerformanceChart lines={data.lines} ariaLabel={title} />
          <p className="text-[10px] text-fg-muted">{note}</p>
        </div>
      ) : (
        <EmptyState title={locale === "es" ? "Aún no hay historial del índice sintético" : "No synthetic index history yet"} description={locale === "es" ? "Se genera al sincronizar precios para el universo completo del S&P 500 (npm run sync -- alpaca --index sp500)." : "Built by the price sync from the full S&P 500 universe (npm run sync -- alpaca --index sp500)."} />
      )}
    </Panel>
  );
}
