import { formatPrice } from "@/lib/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";

interface RangeBarProps {
  low: number | null;
  high: number | null;
  current: number | null;
  currency: string | null;
  label?: string;
  locale?: Locale;
}

/** Posición del precio dentro de un rango (p. ej. 52 semanas). */
export function RangeBar({ low, high, current, currency, label = "52-week range", locale = DEFAULT_LOCALE }: RangeBarProps) {
  const valid = low !== null && high !== null && current !== null && high > low;
  const position = valid ? Math.min(1, Math.max(0, (current - low) / (high - low))) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{label}</div>
      <div
        className="relative h-1.5 rounded-full bg-surface-raised"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position === null ? undefined : Math.round(position * 100)}
      >
        {position !== null && (
          <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-accent" style={{ left: `calc(${position * 100}% - 1px)` }} />
        )}
      </div>
      <div className="num flex justify-between font-mono text-[10px] text-fg-secondary">
        <span>{formatPrice(low, currency, locale)}</span>
        <span>{formatPrice(high, currency, locale)}</span>
      </div>
    </div>
  );
}
