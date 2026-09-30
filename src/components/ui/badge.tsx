import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "outline"
  | "accent"
  | "positive"
  | "negative"
  | "warning"
  | "demo"
  | "synthetic"
  | "official"
  | "inferred"
  | "ai"
  | "info"
  | "news";

/**
 * Badges de procedencia y estado. Semántica fija (ver MARKETRADAR_VISUAL_SYSTEM.md §13):
 * REAL/OFICIAL/SEC → positive · CALCULADO → info · SINTÉTICO → synthetic · INFERIDO/IA → ai ·
 * PARCIAL/AVISO → warning · DEMO → demo · SIN DATOS → neutral.
 */
const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-raised text-fg-secondary border-border-strong",
  outline: "bg-transparent text-fg-secondary border-border-strong",
  accent: "bg-accent-muted text-fg border-border-brand",
  positive: "bg-positive/10 text-positive border-positive/30",
  negative: "bg-negative/10 text-negative border-negative/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  demo: "bg-demo-muted text-demo border-demo/40",
  synthetic: "bg-synthetic-muted text-synthetic border-synthetic/40",
  official: "bg-positive/10 text-positive border-positive/40",
  inferred: "bg-inferred-muted text-inferred border-inferred/40",
  ai: "bg-ai-muted text-ai border-ai/40",
  info: "bg-info/10 text-info border-info/30",
  news: "bg-news-muted text-news border-news/40",
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  title?: string;
  className?: string;
}

export function Badge({ children, variant = "neutral", title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-chip border px-1.5 text-[10px] leading-none font-bold tracking-wide whitespace-nowrap uppercase",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
