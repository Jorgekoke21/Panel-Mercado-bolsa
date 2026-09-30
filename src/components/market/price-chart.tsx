"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";

/**
 * Gráfico de velas (lightweight-charts). Recibe datos YA preparados en servidor: barras ajustadas
 * por splits y overlays calculados por MarketRadar. No descarga nada ni conoce al proveedor.
 * Los colores salen de los tokens CSS (--mr-*), nunca de literales.
 */
export const CHART_RANGES = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export interface PriceChartProps {
  bars: { time: string; open: number; high: number; low: number; close: number; volume: number | null }[];
  overlays: { id: string; label: string; points: { time: string; value: number }[] }[];
  defaultRange?: ChartRange;
  /** Overlays activos al cargar. */
  defaultOverlays?: string[];
  ariaLabel: string;
}

const OVERLAY_TOKENS = ["--mr-accent", "--mr-info", "--mr-synthetic"] as const;

function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Fecha inicial visible (YYYY-MM-DD) para un periodo, relativa a la última sesión. */
export function rangeStart(lastDate: string, range: ChartRange): string {
  const [y, m, d] = lastDate.split("-").map(Number) as [number, number, number];
  if (range === "YTD") return `${y}-01-01`;
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 }[range];
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(d, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function PriceChart({ bars, overlays, defaultRange = "1Y", defaultOverlays = [], ariaLabel }: PriceChartProps) {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const overlaySeries = useRef(new Map<string, ISeriesApi<"Line">>());
  const [range, setRange] = useState<ChartRange>(defaultRange);
  const [active, setActive] = useState<Set<string>>(() => new Set(defaultOverlays));
  const lastDate = bars.at(-1)?.time ?? null;
  const firstDate = bars[0]?.time ?? null;

  const candleData = useMemo(() => bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })), [bars]);

  // Creación del gráfico (una vez por conjunto de datos).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const positive = token("--mr-positive", "#2fbf71");
    const negative = token("--mr-negative", "#f0564a");
    const chart = createChart(container, {
      autoSize: true,
      localization: { locale: locale === "es" ? "es-ES" : "en-US" },
      layout: {
        background: { type: ColorType.Solid, color: token("--mr-bg", "#0a0c0f") },
        textColor: token("--mr-fg-muted", "#6a7482"),
        fontSize: 10,
        fontFamily: getComputedStyle(container).fontFamily,
      },
      grid: { vertLines: { color: token("--mr-border", "#222932") }, horzLines: { color: token("--mr-border", "#222932") } },
      rightPriceScale: { borderColor: token("--mr-border-strong", "#313a47") },
      timeScale: { borderColor: token("--mr-border-strong", "#313a47") },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: positive,
      downColor: negative,
      borderUpColor: positive,
      borderDownColor: negative,
      wickUpColor: positive,
      wickDownColor: negative,
      priceLineVisible: false,
    });
    candles.setData(candleData);

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const up = `${positive}66`;
    const down = `${negative}66`;
    volume.setData(
      bars.filter((b) => b.volume !== null).map((b) => ({ time: b.time as Time, value: b.volume as number, color: b.close >= b.open ? up : down })),
    );

    const seriesMap = overlaySeries.current;
    overlays.forEach((o, i) => {
      const line = chart.addSeries(LineSeries, {
        color: token(OVERLAY_TOKENS[i % OVERLAY_TOKENS.length] as string, "#f2a93b"),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: o.label,
      });
      line.setData(o.points.map((p) => ({ time: p.time as Time, value: p.value })));
      seriesMap.set(o.id, line);
    });

    return () => {
      seriesMap.clear();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, candleData, overlays, locale]);

  // Visibilidad de overlays.
  useEffect(() => {
    for (const [id, series] of overlaySeries.current) series.applyOptions({ visible: active.has(id) });
  }, [active, bars, overlays]);

  // Periodo visible.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !lastDate || !firstDate) return;
    const start = rangeStart(lastDate, range);
    chart.timeScale().setVisibleRange({ from: (start < firstDate ? firstDate : start) as Time, to: lastDate as Time });
  }, [range, lastDate, firstDate, bars]);

  const toggle = (id: string) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={locale === "es" ? "Periodo del gráfico" : "Chart range"} className="flex items-center gap-px rounded-[3px] border border-border bg-bg p-px">
          {CHART_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                r === range ? "bg-accent text-accent-contrast" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div role="group" aria-label={locale === "es" ? "Indicadores del gráfico" : "Overlays"} className="flex items-center gap-1">
          {overlays.map((o, i) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={active.has(o.id)}
              onClick={() => toggle(o.id)}
              className={cn(
                "rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                active.has(o.id) ? "border-border-strong text-fg" : "border-border text-fg-muted hover:text-fg",
              )}
            >
              <span
                aria-hidden
                className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", ["bg-accent", "bg-info", "bg-synthetic"][i % 3])}
              />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} role="img" aria-label={ariaLabel} className="h-72 w-full overflow-hidden rounded-[3px] border border-border" />
    </div>
  );
}
