import type { CSSProperties, ReactNode } from "react";
import { SECTION_STRIPE, type SectionTone } from "@/components/ui/styles";
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
  /** Color de sección de la franja superior (por defecto, sin franja). */
  tone?: SectionTone;
}

/** Tarjeta de KPI: etiqueta, valor tabular, variación y nota. Borde estructural; franja de sección opcional. */
export function MetricCard({ label, value, change, footnote, aside, className, definition, tone }: MetricCardProps) {
  const style = tone ? ({ "--mr-stripe": SECTION_STRIPE[tone] } as CSSProperties) : undefined;
  return (
    <div style={style} className={cn("flex min-w-0 items-center gap-2 rounded-card border-2 border-border-brand bg-surface px-3 py-2", tone && "mr-stripe pt-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-semibold text-fg-secondary" title={definition}>
          {label}
        </div>
        <div className="num truncate text-[17px] leading-snug font-bold text-fg">{value}</div>
        {(change || footnote) && (
          <div className="flex items-baseline gap-1.5 text-[11px] text-fg-muted">
            {change && <span className="text-2xs">{change}</span>}
            {footnote && <span className="truncate">{footnote}</span>}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}
