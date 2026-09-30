import type { ReactNode } from "react";

interface FinancialMetricProps {
  label: string;
  value: ReactNode;
  /** Definición breve (tooltip). Base del futuro Learning Mode. */
  definition?: string;
}

/** Par etiqueta/valor para listas de datos (identidad, fundamentales, técnicos). */
export function FinancialMetric({ label, value, definition }: FinancialMetricProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
      <dt className="text-2xs text-fg-muted" title={definition}>
        {label}
        {definition && <span aria-hidden className="ml-0.5 text-fg-muted/60">ⓘ</span>}
      </dt>
      <dd className="num min-w-0 truncate text-right text-[11.5px] text-fg">{value}</dd>
    </div>
  );
}
