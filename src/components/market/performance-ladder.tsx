import { type TimeRange } from "@/domain/time-range";
import { cn } from "@/lib/cn";
import { PerformanceBadge } from "./performance-badge";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel, marketDetailLabel } from "@/i18n/classification";

export interface LadderLine {
  label: string;
  detail?: string;
  returns: Partial<Record<TimeRange, number | null>>;
  emphasis?: boolean;
}

interface PerformanceLadderProps {
  lines: LadderLine[];
  ranges: readonly TimeRange[];
  locale?: Locale;
}

/**
 * Escalera de rendimiento por periodo. Con varias líneas compara entidad vs industria vs
 * sector vs índice (fuerza relativa) en una sola tabla.
 */
export function PerformanceLadder({ lines, ranges, locale = DEFAULT_LOCALE }: PerformanceLadderProps) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th scope="col" className="h-6 px-2 text-left text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
              <span className="sr-only">Series</span>
            </th>
            {ranges.map((r) => (
              <th key={r} scope="col" title={timeRangeLabel(locale, r)} className="h-6 px-2 text-right font-mono text-[10px] font-semibold text-fg-muted">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="border-t border-border/60">
              <th scope="row" className="max-w-56 px-2 py-1 text-left font-normal">
                <div className={cn("truncate", line.emphasis ? "font-semibold text-fg" : "text-fg-secondary")}>{classificationLabel(locale, line.label)}</div>
                {line.detail && <div className="truncate text-[10px] text-fg-muted">{marketDetailLabel(locale, line.detail)}</div>}
              </th>
              {ranges.map((r) => (
                <td key={r} className="px-2 py-1 text-right text-[11.5px]">
                  <PerformanceBadge value={line.returns[r]} label={timeRangeLabel(locale, r)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
