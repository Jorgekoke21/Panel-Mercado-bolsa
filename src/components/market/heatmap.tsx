import Link from "next/link";
import type { HeatmapData } from "@/services/heatmap";
import { groupedTreemap } from "@/lib/calculations/treemap";
import { cn } from "@/lib/cn";
import { heatClass } from "@/lib/color-scale";
import { formatPercent } from "@/lib/format";
import { type MarketCapReason } from "@/lib/calculations/market-cap";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";
import { marketCapReasonLabel } from "@/i18n/domain";

interface HeatmapProps {
  data: HeatmapData;
  /** Proporción del lienzo (ancho / alto). */
  aspectRatio?: number;
  className?: string;
  locale?: Locale;
}

const CANVAS_WIDTH = 1000;
const HEADER = 16;

/** Tamaño expresado en px del lienzo → unidades de contenedor (escala con el ancho real). */
const toContainerUnits = (canvasPx: number) => `max(8px, ${(canvasPx / CANVAS_WIDTH) * 100}cqw)`;

/**
 * Siempre sobre superficie de datos (`.mr-data`, navy); los grupos llevan contorno de tinta y las
 * celdas separaciones finas. Heatmap treemap de dos niveles (grupo → valor). Tamaño = capitalización, color = variación
 * del periodo. El layout se calcula en servidor sobre un lienzo abstracto y se pinta en %.
 */
export function Heatmap({ data, aspectRatio = 1.9, className, locale = DEFAULT_LOCALE }: HeatmapProps) {
  const height = CANVAS_WIDTH / aspectRatio;
  const groups = groupedTreemap(
    data.groups.map((g) => ({
      id: g.id,
      label: g.label,
      items: g.cells.map((c) => ({ id: c.id, value: c.size, data: { ...c, group: g.label } })),
    })),
    { x: 0, y: 0, width: CANVAS_WIDTH, height },
    { headerHeight: HEADER, padding: 1, minHeightForHeader: 34 },
  );
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const hrefByGroup = new Map(data.groups.map((g) => [g.id, g.href]));
  const groupLabel = (label: string) => classificationLabel(locale, label);
  const sizeLabel = locale === "es"
    ? data.sizeLabel === "Verified market cap"
      ? "capitalización bursátil verificada"
      : data.sizeLabel === "Market cap"
        ? "capitalización bursátil"
        : classificationLabel(locale, data.sizeLabel).toLowerCase()
    : data.sizeLabel.toLowerCase();

  if (groups.length === 0) return <HeatmapExclusions excluded={data.excluded} locale={locale} />;

  return (
    <>
    <div
      role="group"
      aria-label={locale === "es" ? `Mapa de calor: tamaño por ${sizeLabel}, color por rendimiento ${timeRangeLabel(locale, data.range)}` : `Heatmap sized by ${sizeLabel}, coloured by ${timeRangeLabel(locale, data.range)} return`}
      className={cn("mr-data relative w-full overflow-hidden bg-bg", className)}
      style={{ aspectRatio, containerType: "inline-size" }}
    >
      {groups.map((group) => {
        const href = hrefByGroup.get(group.id);
        return (
          <div
            key={group.id}
            className="absolute border-2 border-border-brand"
            style={{ left: pct(group.x, CANVAS_WIDTH), top: pct(group.y, height), width: pct(group.width, CANVAS_WIDTH), height: pct(group.height, height) }}
          >
            {group.showHeader && (
              <div className="absolute inset-x-0 top-0 flex items-center overflow-hidden px-1" style={{ height: pct(HEADER - 2, group.height) }}>
                {href ? (
                  <Link href={href} className="truncate text-[10px] font-bold tracking-wide text-fg-secondary uppercase hover:text-link">
                    {groupLabel(group.label)}
                  </Link>
                ) : (
                  <span className="truncate text-[10px] font-semibold tracking-wide text-fg-secondary uppercase">{groupLabel(group.label)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {groups.flatMap((group) =>
        group.cells.map((cell) => {
          const area = cell.width * cell.height;
          const showLabel = cell.width > 26 && cell.height > 14;
          const showChange = cell.width > 44 && cell.height > 28;
          const fontSize = Math.max(9, Math.min(26, Math.sqrt(area) / 5.5));
          const change = formatPercent(cell.data.change, {}, locale);
          return (
            <Link
              key={cell.id}
              href={cell.data.href}
              title={`${cell.data.label} · ${cell.data.title} · ${classificationLabel(locale, cell.data.group)} · ${change}`}
              aria-label={`${cell.data.label} ${change}`}
              className={cn(
                "absolute flex flex-col items-center justify-center overflow-hidden border border-bg leading-tight hover:z-10 hover:outline-2 hover:outline-brand-yellow",
                heatClass(cell.data.change, data.range),
              )}
              style={{ left: pct(cell.x, CANVAS_WIDTH), top: pct(cell.y, height), width: pct(cell.width, CANVAS_WIDTH), height: pct(cell.height, height) }}
            >
              {showLabel && (
                <span className="font-bold" style={{ fontSize: toContainerUnits(fontSize) }}>
                  {cell.data.label}
                </span>
              )}
              {showChange && (
                <span className="num font-medium opacity-90" style={{ fontSize: toContainerUnits(fontSize * 0.68) }}>
                  {change}
                </span>
              )}
            </Link>
          );
        }),
      )}
    </div>
    <HeatmapExclusions excluded={data.excluded} locale={locale} />
    </>
  );
}

const reasonText = (reason: string, locale: Locale) => marketCapReasonLabel(locale, reason as MarketCapReason, reason.replace(/_/g, " "));

/** Securities que no se dibujan por no tener una capitalización verificada (nunca se inventa un tamaño). */
export function HeatmapExclusions({ excluded, locale = DEFAULT_LOCALE }: { excluded: HeatmapData["excluded"]; locale?: Locale }) {
  if (excluded.length === 0) return null;
  const byReason = new Map<string, string[]>();
  for (const e of excluded) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.ticker]);
  return (
    <details className="border-t border-border px-2.5 py-1 text-[10px] text-fg-muted">
      <summary className="cursor-pointer select-none">
        {locale === "es" ? `${excluded.length} ${excluded.length === 1 ? "valor excluido" : "valores excluidos"}: capitalización no verificada (no se estima el tamaño)` : `${excluded.length} ${excluded.length === 1 ? "security is" : "securities are"} not drawn: market cap not verified (size is never estimated)`}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {[...byReason.entries()].map(([reason, tickers]) => (
          <li key={reason}>
            <span className="text-fg-secondary">{reasonText(reason, locale)}:</span> {tickers.sort().join(", ")}
          </li>
        ))}
      </ul>
    </details>
  );
}
