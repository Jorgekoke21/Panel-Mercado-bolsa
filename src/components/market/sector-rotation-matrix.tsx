import Link from "next/link";
import { type TimeRange } from "@/domain/time-range";
import { cn } from "@/lib/cn";
import { heatClass } from "@/lib/color-scale";
import { formatPercent } from "@/lib/format";
import type { ClassificationGroup } from "@/services/market-rows";
import { timeRangeLabel } from "@/i18n/domain";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { classificationLabel } from "@/i18n/classification";

interface SectorRotationMatrixProps {
  groups: ClassificationGroup[];
  ranges: readonly TimeRange[];
  href: (slug: string) => string;
  label: string;
  locale?: Locale;
}

/**
 * Matriz de rotación: grupos (filas) × periodos (columnas). Cada celda usa la escala del
 * heatmap del periodo correspondiente, así la lectura es coherente con el treemap.
 */
export function SectorRotationMatrix({ groups, ranges, href, label, locale = DEFAULT_LOCALE }: SectorRotationMatrixProps) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-separate border-spacing-px text-xs">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="h-6 px-2 text-left text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
              {locale === "es" ? "Grupo" : "Group"}
            </th>
            {ranges.map((r) => (
              <th key={r} scope="col" title={timeRangeLabel(locale, r)} className="h-6 w-16 px-1 text-center font-mono text-[10px] font-semibold text-fg-muted">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <th scope="row" className="max-w-48 truncate px-2 py-1 text-left font-normal">
                <Link href={href(g.slug)} className="text-fg-secondary hover:text-accent">
                  {classificationLabel(locale, g.name)}
                </Link>
              </th>
              {ranges.map((r) => {
                const value = g.stats.performance.capWeighted[r];
                return (
                  <td
                    key={r}
                    className={cn("num h-6 px-1 text-center font-mono text-[11px]", heatClass(value, r))}
                    aria-label={`${classificationLabel(locale, g.name)} ${timeRangeLabel(locale, r)}: ${formatPercent(value, {}, locale)}`}
                  >
                    {formatPercent(value, { digits: 1 }, locale)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
