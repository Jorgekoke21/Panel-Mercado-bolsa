import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SECTION_STRIPE, type SectionTone } from "./styles";

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
  /** Color de sección: franja superior de 4px (Mercados amarillo, Técnico cian, Noticias rosa, IA morado…). */
  tone?: SectionTone;
  /**
   * "data": el cuerpo pasa a superficie navy (`.mr-data`) — para gráficos, heatmaps y visualizaciones.
   * La cabecera sigue en papel: el dato queda "encajado" dentro del marco de marca.
   */
  surface?: "paper" | "data";
}

/**
 * Contenedor base (BaseCard). Nivel 1 del sistema de bordes: 2px de tinta, radio de 8px, papel.
 * Sin sombra: la sombra offset se reserva para lo pulsable y lo editorial.
 */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id, tone, surface = "paper" }: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  const style = tone ? ({ "--mr-stripe": SECTION_STRIPE[tone] } as CSSProperties) : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      style={style}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-card border-2 border-border-brand bg-surface", tone && "mr-stripe pt-1", className)}
    >
      {(title || actions) && (
        <header className="flex min-h-9 items-center gap-2 border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {title && (
              <h2 id={headingId} className="shrink-0 text-[13.5px] leading-tight font-bold text-fg">
                {title}
              </h2>
            )}
            {subtitle && <span className="min-w-0 truncate text-[11.5px] text-fg-muted">{subtitle}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", surface === "data" && "mr-data bg-bg", bodyClassName)}>{children}</div>
    </section>
  );
}
