import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  change?: ReactNode;
  footnote?: ReactNode;
  aside?: ReactNode;
  className?: string;
  /** Definición de la métrica (tooltip; base del futuro Learning Mode). */
  definition?: string;
}

/** Tarjeta compacta de KPI: etiqueta, valor tabular y variación. */
export function MetricCard({ label, value, change, footnote, aside, className, definition }: MetricCardProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-[4px] border border-border bg-surface px-2.5 py-1.5", className)}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-semibold tracking-wide text-fg-muted uppercase" title={definition}>
          {label}
        </div>
        <div className="num truncate font-mono text-sm font-semibold text-fg">{value}</div>
        {(change || footnote) && (
          <div className="flex items-baseline gap-1.5 text-[10px] text-fg-muted">
            {change && <span className="text-2xs">{change}</span>}
            {footnote && <span className="truncate">{footnote}</span>}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}
