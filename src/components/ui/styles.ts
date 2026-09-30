import { cn } from "@/lib/cn";

/**
 * Recetas de clases compartidas del design system (Financial Brutalism).
 * Módulo sin "use client": usable desde Server y Client Components.
 * Una sola implementación por patrón: botones, controles segmentados, pestañas, inputs y chips.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ai" | "positive" | "danger";
export type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "mr-press border-2 border-border-brand bg-brand-yellow text-ink",
  secondary: "mr-press border-2 border-border-brand bg-surface text-fg",
  ghost: "border border-border-strong bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
  ai: "mr-press border-2 border-border-brand bg-brand-purple text-white",
  positive: "mr-press border-2 border-border-brand bg-brand-green text-ink",
  danger: "mr-press border-2 border-border-brand bg-brand-red text-ink",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ctl font-bold whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "h-9 px-4 text-[13px]" : "h-7 px-2.5 text-xs",
    BUTTON_VARIANTS[variant],
    className,
  );
}

/** Contenedor de un control segmentado (periodos 1D/1W…, SINTÉTICO/REAL, Anual/Trimestral). */
export const segmentGroupClass = "inline-flex items-center gap-0.5 rounded-[4px] border border-border-strong bg-surface p-0.5";

/** Opción de un control segmentado. Activa = amarillo de marca + filo negro (sin sombra). */
export function segmentItemClass(active: boolean, className?: string): string {
  return cn(
    "num h-6 rounded-chip border px-2 text-[11px] font-semibold whitespace-nowrap",
    active ? "border-border-brand bg-brand-yellow text-ink" : "border-transparent text-fg-muted hover:bg-surface-hover hover:text-fg",
    className,
  );
}

export type TabTone = "default" | "ai";

/** Contenedor de pestañas principales (ficha de empresa, Pulso global). */
export const tabListClass = "scroll-thin flex gap-1 overflow-x-auto rounded-card border-2 border-border-brand bg-surface p-1";

/** Pestaña principal. Activa = bloque amarillo (morado para IA) con borde y sombra offset. */
export function tabItemClass(active: boolean, tone: TabTone = "default", className?: string): string {
  return cn(
    "flex h-8 shrink-0 items-center gap-1.5 rounded-ctl border-2 px-3 text-[13px] whitespace-nowrap",
    active
      ? cn("border-border-brand font-bold shadow-brut-1", tone === "ai" ? "bg-brand-purple text-white" : "bg-brand-yellow text-ink")
      : "border-transparent font-semibold text-fg-muted hover:bg-surface-hover hover:text-fg",
    className,
  );
}

/** Campo de texto / select. */
export const inputClass =
  "h-8 rounded-ctl border-2 border-border-brand bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-muted focus:border-link focus:outline-none";

/** Chip enlazable (etiquetas, entidades, conceptos). */
export const chipLinkClass =
  "inline-flex items-center gap-1 rounded-chip border border-border-strong bg-surface px-1.5 py-px text-[11px] font-medium text-fg-secondary hover:border-border-brand hover:text-fg";

/** Color de sección para franjas superiores (Panel, MetricCard). */
export type SectionTone = "market" | "technical" | "news" | "ai" | "positive" | "warning";

export const SECTION_STRIPE: Record<SectionTone, string> = {
  market: "var(--mr-sec-market)",
  technical: "var(--mr-sec-technical)",
  news: "var(--mr-sec-news)",
  ai: "var(--mr-sec-ai)",
  positive: "var(--mr-sec-positive)",
  warning: "var(--mr-sec-warning)",
};
