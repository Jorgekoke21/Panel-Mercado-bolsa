import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * EntityPage: lenguaje visual común de índice, sector, industria, sub-industria y empresa.
 *
 * Es solo composición (CAMBIO 2): no conoce el tipo de entidad ni contiene condicionales.
 * Cada página decide qué secciones usa y en qué orden:
 *
 *   <EntityPage>
 *     <EntityHeader … />
 *     <EntityGrid main={<><PerformanceSection/><ChartSection/></>} aside={<BreadthSection/>} />
 *     <ComponentsSection … />
 *     <EntityGrid main={<WorldContextSection/>} aside={<NewsSection/>} />
 *   </EntityPage>
 */
export function EntityPage({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2 p-2">{children}</div>;
}

/** Rejilla principal + lateral (se apila en pantallas estrechas). */
export function EntityGrid({ main, aside, className }: { main: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-2", aside != null && "xl:grid-cols-[minmax(0,1fr)_22rem]", className)}>
      <div className="flex min-w-0 flex-col gap-2">{main}</div>
      {aside != null && <div className="flex min-w-0 flex-col gap-2">{aside}</div>}
    </div>
  );
}
