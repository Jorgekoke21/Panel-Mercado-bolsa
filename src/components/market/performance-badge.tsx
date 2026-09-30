"use client";

import { cn } from "@/lib/cn";
import { directionOf, formatPercent } from "@/lib/format";
import { useI18n } from "@/i18n/provider";

interface PerformanceBadgeProps {
  /** Rendimiento en fracción (0.0123 = +1.23 %). */
  value: number | null | undefined;
  digits?: number;
  /** "text": cifra coloreada en línea; "pill": fondo suave. */
  variant?: "text" | "pill";
  /** Muestra ▲/▼ además del signo. */
  arrow?: boolean;
  className?: string;
  /** Contexto accesible, p. ej. "1 day". */
  label?: string;
}

const COLOR = {
  up: "text-positive",
  down: "text-negative",
  flat: "text-fg-secondary",
  none: "text-fg-muted",
} as const;

const PILL = {
  up: "bg-positive/10",
  down: "bg-negative/10",
  flat: "bg-surface-raised",
  none: "bg-transparent",
} as const;

const ARROW = { up: "▲", down: "▼", flat: "■", none: "" } as const;
const WORD = { up: "up", down: "down", flat: "unchanged", none: "no data" } as const;

/**
 * Variación porcentual. El significado nunca depende solo del color: signo explícito,
 * flecha opcional y aria-label ("up 1.23% over 1 day").
 */
export function PerformanceBadge({ value, digits = 2, variant = "text", arrow = false, className, label }: PerformanceBadgeProps) {
  const { locale } = useI18n();
  const direction = directionOf(value);
  const text = formatPercent(value, { digits }, locale);
  const translatedWord = locale === "es" ? ({ up: "sube", down: "baja", flat: "sin cambios", none: "sin datos" } as const)[direction] : WORD[direction];
  const aria = direction === "none" ? `${translatedWord}${label ? ` ${locale === "es" ? "para" : "for"} ${label}` : ""}` : `${translatedWord} ${text.replace("−", "-")}${label ? ` ${locale === "es" ? "en" : "over"} ${label}` : ""}`;
  return (
    <span
      aria-label={aria}
      className={cn(
        "num inline-flex items-center justify-end gap-0.5 font-mono whitespace-nowrap",
        COLOR[direction],
        variant === "pill" && cn("rounded-[3px] px-1.5 py-px", PILL[direction]),
        className,
      )}
    >
      {arrow && direction !== "none" && <span aria-hidden className="text-[0.7em]">{ARROW[direction]}</span>}
      <span aria-hidden>{text}</span>
    </span>
  );
}
