import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Controles o badges alineados a la derecha de la cabecera. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** id para anclar secciones y aria-labelledby. */
  id?: string;
}

/** Contenedor base de la terminal: borde fino, cabecera compacta de 28px, sin sombras. */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn("flex min-w-0 flex-col rounded-[4px] border border-border bg-surface", className)}
    >
      {(title || actions) && (
        <header className="flex min-h-7 items-center gap-2 border-b border-border px-2.5 py-1">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {title && (
              <h2 id={headingId} className="truncate text-2xs font-semibold tracking-wide text-fg uppercase">
                {title}
              </h2>
            )}
            {subtitle && <span className="truncate text-2xs text-fg-muted">{subtitle}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
