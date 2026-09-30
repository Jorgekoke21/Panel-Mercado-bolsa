import { SecSourceBadge, SecSourceNote } from "@/components/market/sec-source-note";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import type { RatioResult, RatioStatus } from "@/lib/calculations/ratios";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { getValuationView } from "@/services/company-fundamentals";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { financialTerm } from "@/i18n/domain";

const STATUS_LABEL: Record<Exclude<RatioStatus, "ok">, string> = {
  not_meaningful: "n/m",
  not_applicable: "n/a",
  missing: "—",
  unverified: "unverified",
};

function RatioValue({ ratio, currency, locale }: { ratio: RatioResult; currency: string; locale: "es" | "en" }) {
  if (ratio.status !== "ok" || ratio.value === null) {
    return (
      <span className="text-fg-muted" title={ratio.reason ?? undefined}>
        {STATUS_LABEL[ratio.status === "ok" ? "missing" : ratio.status]}
      </span>
    );
  }
  const text = ratio.unit === "currency" ? formatCompact(ratio.value, currency, locale) : ratio.unit === "percent" ? formatPercent(ratio.value, { signed: ratio.group === "growth", digits: 1 }, locale) : `${formatNumber(ratio.value, 1, locale)}×`;
  return <span title={[locale === "es" ? "Calculado por MarketRadar" : "Calculated by MarketRadar", ratio.formula, ...ratio.inputs].join("\n")}>{text}</span>;
}

const GROUPS: { id: RatioResult["group"]; title: string }[] = [
  { id: "valuation", title: "Valuation" },
  { id: "profitability", title: "Profitability" },
  { id: "growth", title: "Growth" },
];

export default async function CompanyValuationPage({ params }: PageProps<"/company/[ticker]/valuation">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const data = await getValuationView(getRepositories(), header.security, header.realMarketData);

  if (!data.profile) {
    return (
      <Panel title={messages.company.valuation}>
        <EmptyState title={messages.company.noFundamentals} description={locale === "es" ? "MarketRadar calcula los ratios a partir de informes SEC y precios sincronizados." : "Ratios are calculated by MarketRadar from SEC filings and synced prices."} />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!data.price && (
        <p className="rounded-[4px] border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-2xs text-fg-secondary">
          {locale === "es" ? <>Aún no hay precios reales sincronizados para {header.security.ticker}; no se muestran múltiplos basados en capitalización (P/E, P/S, P/B, EV, rentabilidad del flujo de caja libre ni por dividendo). Los datos de rentabilidad y crecimiento proceden solo de informes y sí están disponibles.</> : <>No real price data is synced for {header.security.ticker} yet, so market-cap-based multiples (P/E, P/S, P/B, EV, FCF yield, dividend yield) are not shown. Profitability and growth come only from filings and are available.</>}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Panel
            key={g.id}
            title={financialTerm(locale, g.title)}
            actions={
              <>
                <Badge variant="outline" title={locale === "es" ? "MarketRadar calcula todos los ratios; ninguno se copia de un proveedor de datos." : "Every ratio is calculated by MarketRadar; none is copied from a data vendor."}>
                  {locale === "es" ? "Calculado" : "Calculated"}
                </Badge>
                {g.id === "valuation" && header.realMarketData && <DataProvenanceBadge provenance={header.realMarketData.provenance} />}
              </>
            }
          >
            <dl className="px-2.5 py-1">
              {data.ratios
                .filter((r) => r.group === g.id)
                .map((r) => (
                  <div key={r.id} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
                    <dt className="text-2xs text-fg-muted" title={r.formula}>
                      {financialTerm(locale, r.label)}
                      <span aria-hidden className="ml-0.5 text-fg-muted/60">ⓘ</span>
                      {r.status !== "ok" && r.reason && <span className="block text-[10px] text-fg-muted/80">{r.reason}</span>}
                    </dt>
                    <dd className="num shrink-0 text-right font-mono text-[11.5px] text-fg">
                      <RatioValue ratio={r} currency={header.security.currency} locale={locale} />
                    </dd>
                  </div>
                ))}
            </dl>
          </Panel>
        ))}
      </div>
      <Panel title={messages.company.methodology} actions={<SecSourceBadge profile={data.profile} />}>
        <ul className="list-disc space-y-0.5 px-6 py-2 text-2xs text-fg-muted">
          <li>{locale === "es" ? "12 meses = suma de los últimos cuatro trimestres fiscales consecutivos (Q4 se deriva como año fiscal menos nueve meses). Las partidas del balance usan el último trimestre" : "TTM = sum of the last four consecutive fiscal quarters (Q4 derived as fiscal year − nine months). Balance-sheet items use the latest quarter"}{data.latestQuarter ? ` (${data.latestQuarter})` : ""}.</li>
          <li>{locale === "es" ? "Capitalización = último cierre ajustado por splits × acciones en circulación; solo se muestra si está verificada (una clase de acciones, recuento reciente y coherente con una referencia independiente)." : "Market cap = last split-adjusted close × shares outstanding, shown only when verified (single share class, recent share count, consistent with an independent reference)."}</li>
          <li>{locale === "es" ? "n/m = sin sentido económico (p. ej., beneficio o patrimonio negativos) · n/a = no aplicable a bancos y aseguradoras · — = dato no disponible." : "n/m = not meaningful (e.g. negative earnings or negative equity) · n/a = not applicable to banks and insurers · — = input not available."}</li>
          <li>{locale === "es" ? "P/E futuro, PEG y métricas basadas en consenso requieren estimaciones de analistas; no hay fuentes oficiales gratuitas, así que no se muestran." : "Forward P/E, PEG and consensus-based metrics need analyst estimates, which have no free official source: not shown."}</li>
        </ul>
        <SecSourceNote profile={data.profile} legend={false} />
      </Panel>
    </div>
  );
}
