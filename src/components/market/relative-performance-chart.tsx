"use client";

import { ColorType, createChart, type IChartApi, LineSeries, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { rebase } from "@/lib/calculations/synthetic-index";
import { formatPercent } from "@/lib/format";
import type { ComparisonLine } from "@/services/relative-performance";
import { CHART_RANGES, type ChartRange, rangeStart } from "./price-chart";
import { useI18n } from "@/i18n/provider";
import { classificationLabel, marketDetailLabel } from "@/i18n/classification";

type Method = "cap" | "equal";

const LINE_TOKENS = ["--mr-accent", "--mr-info", "--mr-synthetic", "--mr-fg-secondary"] as const;
const DOT_CLASSES = ["bg-accent", "bg-info", "bg-synthetic", "bg-fg-secondary"];

function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function pointsFor(line: ComparisonLine, method: Method) {
  return line.single ?? (method === "cap" ? (line.cap ?? line.equal) : (line.equal ?? line.cap)) ?? [];
}

function usedMethod(line: ComparisonLine, method: Method, locale: "es" | "en"): string | null {
  if (line.single) return null;
  if (method === "cap") return line.cap ? (locale === "es" ? "ponderado por capitalización" : "cap-weighted") : (locale === "es" ? "ponderación igual (sin serie por capitalización)" : "equal-weighted (no cap-weighted series)");
  return line.equal ? (locale === "es" ? "ponderación igual" : "equal-weighted") : (locale === "es" ? "ponderado por capitalización" : "cap-weighted");
}

function lineLabel(value: string, locale: "es" | "en"): string {
  if (locale === "en") return value;
  const priceReturn = value.match(/^([A-Z.]+) price return$/);
  if (priceReturn) return `${priceReturn[1]} · rendimiento del precio`;
  return classificationLabel(locale, value);
}

function lineDetail(value: string, locale: "es" | "en"): string {
  if (locale === "en") return value;
  const known: Record<string, string> = {
    "price return": "rendimiento del precio",
    "Industry · cap-weighted synthetic index": "Industria · índice sintético ponderado por capitalización",
    "Sector · cap-weighted synthetic index": "Sector · índice sintético ponderado por capitalización",
    "Constituents · cap-weighted synthetic index (not the official index level)": "Componentes · índice sintético ponderado por capitalización (no es el nivel oficial del índice)",
    "S&P 500 constituents synthetic, not the official S&P 500": "Componentes del S&P 500 sintéticos; no representan el índice oficial",
    "synthetic, not the official S&P 500": "sintético; no es el S&P 500 oficial",
    "synthetic, not the official index level": "sintético; no representa el nivel oficial del índice",
  };
  return known[value] ?? marketDetailLabel(locale, value);
}

/**
 * Rendimiento relativo rebased (base 100 al inicio del periodo). Las líneas de grupo son índices
 * SINTÉTICOS de MarketRadar (no oficiales). El usuario elige periodo y metodología (cap / equal weight).
 */
export function RelativePerformanceChart({ lines, defaultRange = "1Y", ariaLabel }: { lines: ComparisonLine[]; defaultRange?: ChartRange; ariaLabel: string }) {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<ChartRange>(defaultRange);
  const [method, setMethod] = useState<Method>("cap");
  const hasCap = lines.some((l) => l.cap);
  const hasEqual = lines.some((l) => l.equal);

  const lastDate = useMemo(() => lines.flatMap((l) => pointsFor(l, method).slice(-1).map((p) => p.time)).sort()[0] ?? null, [lines, method]);
  const rebased = useMemo(() => {
    if (!lastDate) return lines.map(() => []);
    const from = rangeStart(lastDate, range);
    return lines.map((l) => rebase(pointsFor(l, method).filter((p) => p.time <= lastDate), from));
  }, [lines, method, range, lastDate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      localization: { locale: locale === "es" ? "es-ES" : "en-US" },
      layout: { background: { type: ColorType.Solid, color: token("--mr-bg", "#0a0c0f") }, textColor: token("--mr-fg-muted", "#6a7482"), fontSize: 10, fontFamily: getComputedStyle(container).fontFamily },
      grid: { vertLines: { color: token("--mr-border", "#222932") }, horzLines: { color: token("--mr-border", "#222932") } },
      rightPriceScale: { borderColor: token("--mr-border-strong", "#313a47") },
      timeScale: { borderColor: token("--mr-border-strong", "#313a47") },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    rebased.forEach((points, i) => {
      const series = chart.addSeries(LineSeries, {
        color: token(LINE_TOKENS[i % LINE_TOKENS.length] as string, "#f2a93b"),
        lineWidth: i === 0 ? 2 : 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: lines[i] ? lineLabel(lines[i].label, locale) : "",
      });
      series.setData(points.map((p) => ({ time: p.time as Time, value: Math.round(p.value * 100) / 100 })));
    });
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [rebased, lines, locale]);

  const button = (active: boolean) =>
    cn("rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] font-semibold", active ? "bg-accent text-accent-contrast" : "text-fg-muted hover:bg-surface-hover hover:text-fg");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={locale === "es" ? "Periodo" : "Period"} className="flex items-center gap-px rounded-[3px] border border-border bg-bg p-px">
          {CHART_RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)} className={button(r === range)}>
              {r}
            </button>
          ))}
        </div>
        {hasCap && hasEqual && (
          <div role="group" aria-label={locale === "es" ? "Ponderación" : "Weighting"} className="flex items-center gap-px rounded-[3px] border border-border bg-bg p-px">
            <button type="button" aria-pressed={method === "cap"} onClick={() => setMethod("cap")} className={button(method === "cap")}>
              {locale === "es" ? "Capitalización" : "Cap weight"}
            </button>
            <button type="button" aria-pressed={method === "equal"} onClick={() => setMethod("equal")} className={button(method === "equal")}>
              {locale === "es" ? "Igual" : "Equal weight"}
            </button>
          </div>
        )}
      </div>
      <div ref={containerRef} role="img" aria-label={`${ariaLabel} · ${locale === "es" ? "rebasado a 100 al inicio de" : "rebased to 100 at the start of"} ${range}`} className="h-64 w-full overflow-hidden rounded-[3px] border border-border" />
      <table className="w-full text-2xs">
        <tbody>
          {lines.map((l, i) => {
            const pts = rebased[i] ?? [];
            const ret = pts.length > 1 ? (pts.at(-1)?.value as number) / 100 - 1 : null;
            const cov = l.single ? null : method === "cap" && l.cap ? l.coverage.cap : (l.coverage.equal ?? l.coverage.cap);
            const m = usedMethod(l, method, locale);
            return (
              <tr key={l.id} className="border-t border-border/60">
                <td className="py-0.5 pr-2">
                  <span aria-hidden className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", DOT_CLASSES[i % DOT_CLASSES.length])} />
                  <span className="text-fg">{lineLabel(l.label, locale)}</span>
                  <span className="ml-1.5 text-fg-muted">
                    {lineDetail(l.detail, locale)}
                    {m ? ` · ${m}` : ""}
                    {cov ? ` · ${cov[0]}/${cov[1]} ${locale === "es" ? "miembros" : "members"}` : ""}
                  </span>
                </td>
                <td className={cn("num py-0.5 text-right font-mono", ret === null ? "text-fg-muted" : ret >= 0 ? "text-positive" : "text-negative")}>
                  {ret === null ? "—" : formatPercent(ret, {}, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
