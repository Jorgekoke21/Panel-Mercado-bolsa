import type { ReactNode } from "react";
import { ClassificationBreadcrumb } from "@/components/market/classification-breadcrumb";
import { type EntityCrumb, type EntityKind } from "@/domain/entity";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { entityKindLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";

interface EntityHeaderProps {
  kind: EntityKind;
  title: string;
  /** Código o ticker junto al título. */
  code?: string;
  crumbs?: EntityCrumb[];
  /** Badges (índice oficial/sintético, taxonomía, índices, país…). */
  badges?: ReactNode;
  /** Datos de contexto en línea (bolsa, divisa, nº de componentes…). */
  meta?: ReactNode;
  /** Bloque derecho (precio, rendimiento, selector de periodo). */
  aside?: ReactNode;
  locale?: Locale;
}

export function EntityHeader({ kind, title, code, crumbs = [], badges, meta, aside, locale = DEFAULT_LOCALE }: EntityHeaderProps) {
  return (
    <header className="flex flex-col gap-3 rounded-card border-2 border-border-brand bg-surface px-4 py-3.5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <ClassificationBreadcrumb crumbs={crumbs.map((crumb) => ({ ...crumb, label: classificationLabel(locale, crumb.label) }))} />
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="w-full text-[10.5px] font-bold tracking-[0.08em] text-fg-muted uppercase">{entityKindLabel(locale, kind)}</span>
          <h1 className="font-display text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em] text-fg">{title}</h1>
          {code && <span className="self-center rounded-chip bg-ink px-1.5 py-0.5 text-[12px] font-bold tracking-wide text-paper">{code}</span>}
        </div>
        {badges && <div className="flex flex-wrap items-center gap-1">{badges}</div>}
        {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-muted">{meta}</div>}
      </div>
      {aside && <div className="flex shrink-0 flex-col items-start gap-1.5 lg:items-end">{aside}</div>}
    </header>
  );
}
