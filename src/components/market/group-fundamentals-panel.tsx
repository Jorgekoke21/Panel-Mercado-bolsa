import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type { SnapshotMetric } from "@/lib/calculations/fundamental-snapshot";
import { formatDate, formatPercent } from "@/lib/format";
import type { GroupFundamentals } from "@/services/group-fundamentals";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";

const LABELS: Record<SnapshotMetric, { label: string; signed: boolean; definition: string }> = {
  gross_margin: { label: "Gross margin", signed: false, definition: "Gross profit / revenue (TTM)" },
  operating_margin: { label: "Operating margin", signed: false, definition: "Operating income / revenue (TTM)" },
  net_margin: { label: "Net margin", signed: false, definition: "Net income / revenue (TTM)" },
  fcf_margin: { label: "FCF margin", signed: false, definition: "(Operating cash flow − capex) / revenue (TTM)" },
  roe: { label: "ROE", signed: false, definition: "Net income (TTM) / average equity" },
  roic: { label: "ROIC", signed: false, definition: "Operating income × (1 − tax rate) / (debt + equity − cash)" },
  revenue_growth: { label: "Revenue growth (YoY)", signed: true, definition: "Revenue TTM vs TTM a year earlier" },
  net_income_growth: { label: "Net income growth (YoY)", signed: true, definition: "Net income TTM vs TTM a year earlier" },
  eps_growth: { label: "Diluted EPS growth (FY)", signed: true, definition: "Reported diluted EPS, last fiscal year vs the prior one" },
};

/**
 * Panel de fundamentales REALES del grupo (SEC filings): medianas por métrica y cobertura n/N.
 * Convive con los paneles de precio DEMO, pero con su propia procedencia visible.
 */
export function GroupFundamentalsPanel({ data, scope, locale = DEFAULT_LOCALE }: { data: GroupFundamentals; scope: string; locale?: Locale }) {
  const labels: Record<SnapshotMetric, string> = locale === "es" ? {
    gross_margin: "Margen bruto", operating_margin: "Margen operativo", net_margin: "Margen neto", fcf_margin: "Margen de flujo de caja libre", roe: "ROE", roic: "ROIC", revenue_growth: "Crecimiento de ingresos (interanual)", net_income_growth: "Crecimiento del beneficio neto (interanual)", eps_growth: "Crecimiento del BPA diluido (ejercicio)",
  } : Object.fromEntries(Object.entries(LABELS).map(([key, value]) => [key, value.label])) as Record<SnapshotMetric, string>;
  return (
    <Panel
      title={locale === "es" ? "Fundamentales" : "Fundamentals"}
      subtitle={locale === "es" ? "mediana" : "median"}
      actions={
        <Badge variant="positive" title={locale === "es" ? "Calculado por MarketRadar a partir de informes SEC EDGAR XBRL oficiales (TTM). No son datos simulados." : "Calculated by MarketRadar from official SEC EDGAR XBRL filings (TTM). Not simulated."}>
          {locale === "es" ? "Informes SEC" : "SEC filings"}
        </Badge>
      }
    >
      {data.issuersWithData === 0 ? (
        <EmptyState compact title={locale === "es" ? "No hay fundamentales sincronizados para este grupo" : "No fundamentals synced for this group"} />
      ) : (
        <>
          <dl className="px-2.5 py-1">
            {data.stats.map((s) => {
              const meta = LABELS[s.metric];
              return (
                <div key={s.metric} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
                  <dt className="text-2xs text-fg-muted" title={locale === "es" ? `${labels[s.metric]}. Mediana entre emisores para los que la métrica se puede calcular y es significativa.` : `${meta.definition}. Median across issuers where it is calculable and meaningful.`}>
                    {labels[s.metric]}
                    <span aria-hidden className="ml-0.5 text-fg-muted/60">ⓘ</span>
                  </dt>
                  <dd className="num flex items-baseline gap-2 font-mono text-[11.5px] text-fg">
                    <span className="text-[10px] text-fg-muted" title={locale === "es" ? "Emisores con esta métrica / emisores del grupo" : "Issuers with this metric / issuers in the group"}>
                      {s.count}/{s.total}
                    </span>
                    {s.median === null ? <span className="text-fg-muted">—</span> : formatPercent(s.median, { signed: meta.signed, digits: 1 }, locale)}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
            {locale === "es" ? `${data.issuersWithData} de ${data.issuers} emisores de ${scope} tienen datos SEC` : `${data.issuersWithData} of ${data.issuers} issuers in ${scope} with SEC data`}
            {data.asOf && (locale === "es" ? ` · trimestres más recientes ${formatDate(data.asOf.min, locale)} – ${formatDate(data.asOf.max, locale)} (los calendarios fiscales varían)` : ` · latest quarters ${formatDate(data.asOf.min, locale)} – ${formatDate(data.asOf.max, locale)} (fiscal calendars differ)`)}. {locale === "es" ? "Se excluyen, en vez de sustituirse por cero, las métricas que no aplican (p. ej., margen bruto en bancos) o no son significativas (p. ej., ROE con patrimonio negativo)." : "Metrics that do not apply (e.g. gross margin for banks) or are not meaningful (e.g. ROE with negative equity) are excluded, not zeroed."}
          </p>
        </>
      )}
    </Panel>
  );
}
