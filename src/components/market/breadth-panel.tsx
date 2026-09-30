import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { Panel } from "@/components/ui/panel";
import type { BreadthStats } from "@/domain/breadth";
import type { Provenance } from "@/domain/provenance";
import type { TimeRange } from "@/domain/time-range";
import { formatNumber, formatPercent } from "@/lib/format";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/i18n/messages";

interface BreadthPanelProps {
  breadth: BreadthStats;
  range: TimeRange;
  provenance: Provenance;
  title?: string;
  locale?: Locale;
}

function Meter({ label, value, coverage, total, locale }: { label: string; value: number | null; coverage: number; total: number; locale: Locale }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-2xs text-fg-secondary">{label}</span>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      >
        {value !== null && <div className="absolute inset-y-0 left-0 bg-fg-secondary" style={{ width: `${value * 100}%` }} />}
      </div>
      <span className="num w-12 text-right font-mono text-2xs text-fg">{formatPercent(value, { signed: false, digits: 0 }, locale)}</span>
      <span className="num w-12 text-right font-mono text-[10px] text-fg-muted" title={locale === "es" ? "Componentes con datos" : "Members with data"}>
        {coverage}/{total}
      </span>
    </div>
  );
}

/**
 * Breadth: qué ocurre DENTRO del grupo. Métricas objetivas, sin etiquetas interpretativas (D14).
 * Agregación sintética de MarketRadar sobre securities reales: cuenta compañías (cotización principal).
 */
export function BreadthPanel({ breadth, range, provenance, title, locale = DEFAULT_LOCALE }: BreadthPanelProps) {
  const messages = getMessages(locale);
  title ??= messages.market.breadth;
  const covered = breadth.returnCoverage || 1;
  return (
    <Panel title={title} subtitle={`${breadth.total} ${locale === "es" ? "empresas" : "companies"} · ${range}`} actions={<DataProvenanceBadge provenance={provenance} />}>
      <div className="flex flex-col gap-2.5 p-2.5">
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
            <div className="bg-positive" style={{ width: `${(breadth.advancers / covered) * 100}%` }} />
            <div className="bg-fg-muted" style={{ width: `${(breadth.unchanged / covered) * 100}%` }} />
            <div className="bg-negative" style={{ width: `${(breadth.decliners / covered) * 100}%` }} />
          </div>
          <dl className="mt-1.5 grid grid-cols-3 gap-1 text-2xs">
            <div>
              <dt className="text-fg-muted">{locale === "es" ? "Subidas" : "Advancers"} ▲</dt>
              <dd className="num font-mono text-positive">{breadth.advancers}</dd>
            </div>
            <div className="text-center">
              <dt className="text-fg-muted">{locale === "es" ? "Sin cambios" : "Unchanged"}</dt>
              <dd className="num font-mono text-fg-secondary">{breadth.unchanged}</dd>
            </div>
            <div className="text-right">
              <dt className="text-fg-muted">{locale === "es" ? "Caídas" : "Decliners"} ▼</dt>
              <dd className="num font-mono text-negative">{breadth.decliners}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col gap-1.5">
          <Meter locale={locale} label={locale === "es" ? "% positivos" : "% positive"} value={breadth.pctPositive} coverage={breadth.returnCoverage} total={breadth.total} />
          <Meter locale={locale} label={`${locale === "es" ? "Por encima de" : "Above"} EMA 20`} value={breadth.pctAboveEma20} coverage={breadth.emaCoverage.ema20} total={breadth.total} />
          <Meter locale={locale} label={`${locale === "es" ? "Por encima de" : "Above"} EMA 50`} value={breadth.pctAboveEma50} coverage={breadth.emaCoverage.ema50} total={breadth.total} />
          <Meter locale={locale} label={`${locale === "es" ? "Por encima de" : "Above"} EMA 200`} value={breadth.pctAboveEma200} coverage={breadth.emaCoverage.ema200} total={breadth.total} />
        </div>
        <dl className="grid grid-cols-4 gap-1 border-t border-border pt-2 text-2xs">
          <div>
            <dt className="text-fg-muted">{locale === "es" ? "RSI medio 14" : "Avg RSI 14"}</dt>
            <dd className="num font-mono text-fg">{formatNumber(breadth.averageRsi14, 1, locale)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{locale === "es" ? "RSI mediano" : "Median RSI"}</dt>
            <dd className="num font-mono text-fg">{formatNumber(breadth.medianRsi14, 1, locale)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{locale === "es" ? "Nuevos máximos 52 sem." : "New 52W highs"}</dt>
            <dd className="num font-mono text-fg">{breadth.new52wHighs}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{locale === "es" ? "Nuevos mínimos 52 sem." : "New 52W lows"}</dt>
            <dd className="num font-mono text-fg">{breadth.new52wLows}</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}
