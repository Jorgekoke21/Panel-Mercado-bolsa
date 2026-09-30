import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Primitivas de tabla densa: filas de 24–26px, cabecera fija, numéricos a la derecha. */

export function Table({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)}>
      <table className="w-full border-collapse text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-[1] bg-surface">{children}</thead>;
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function Th({ numeric, className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        "h-6 border-b border-border px-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function Td({ numeric, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn("h-[25px] px-2 whitespace-nowrap", numeric && "num text-right font-mono text-[11.5px]", className)}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-border/60 last:border-b-0 hover:bg-surface-hover", className)}>{children}</tr>;
}
