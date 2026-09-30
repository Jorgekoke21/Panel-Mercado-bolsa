import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_LOWER_PANELS, type LowerPanelSpec, type OverlaySpec } from "@/domain/chart";
import { TIME_RANGES } from "@/domain/time-range";

interface ChartCardProps {
  title: string;
  /** "candlestick" solo cuando habrá OHLC real; los agregados sintéticos son línea. */
  seriesType: "candlestick" | "line";
  /** Comparativas previstas (p. ej. "vs Semiconductors", "vs S&P 500 constituents"). */
  comparisons?: string[];
  badges?: ReactNode;
}

const overlayLabel = (o: OverlaySpec) => (o.kind === "levels52w" ? "52W levels" : `${o.kind.toUpperCase()} ${o.period}`);
const panelLabel = (p: LowerPanelSpec) => (p.kind === "volume" ? "Volume" : p.kind === "macd" ? "MACD" : `${p.kind.toUpperCase()} ${p.period}`);

/**
 * Placeholder del gráfico principal (Fase 1). Muestra el contrato previsto (PriceChartSpec)
 * sin dibujar datos: la librería de gráficos llegará cuando existan precios reales.
 */
export function ChartCard({ title, seriesType, comparisons = [], badges }: ChartCardProps) {
  return (
    <Panel title={title} actions={<>{badges}<Badge variant="outline">Coming in Phase 2–3</Badge></>}>
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex flex-wrap gap-1" aria-label="Planned timeframes">
          {TIME_RANGES.map((r) => (
            <span key={r} className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
              {r}
            </span>
          ))}
        </div>
        <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-border-strong bg-bg">
          <svg aria-hidden className="absolute inset-0 h-full w-full text-border" preserveAspectRatio="none">
            <defs>
              <pattern id="mr-chart-grid" width="48" height="24" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mr-chart-grid)" />
          </svg>
          <div className="relative text-center">
            <p className="text-xs font-semibold text-fg-secondary">No price history yet</p>
            <p className="text-2xs text-fg-muted">
              {seriesType === "candlestick" ? "Candlestick (OHLCV)" : "Line (synthetic aggregate — no OHLC)"} · daily data from Phase 2
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-1 text-[10px] text-fg-muted sm:grid-cols-3">
          <div>
            <dt className="font-semibold uppercase">Overlays</dt>
            <dd>{DEFAULT_CHART_OVERLAYS.map(overlayLabel).join(" · ")}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase">Lower panels</dt>
            <dd>{[...DEFAULT_LOWER_PANELS.map(panelLabel), "MACD", "ATR 14"].join(" · ")}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase">Compare (base 100)</dt>
            <dd>{comparisons.length > 0 ? comparisons.join(" · ") : "—"}</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}
