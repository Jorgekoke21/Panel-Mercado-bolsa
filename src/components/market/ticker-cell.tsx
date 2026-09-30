import Link from "next/link";
import { cn } from "@/lib/cn";
import { companyPath } from "@/lib/routes";

interface TickerCellProps {
  ticker: string;
  name: string;
  /** Muestra el nombre junto al ticker (en tablas estrechas solo va en el tooltip). */
  showName?: boolean;
  className?: string;
}

/** Celda de valor (CompanyRow): ticker enlazado a su ficha + nombre de la empresa. */
export function TickerCell({ ticker, name, showName = true, className }: TickerCellProps) {
  return (
    <Link href={companyPath(ticker)} title={name} className={cn("group flex min-w-0 items-baseline gap-2", className)}>
      <span className="font-mono text-[11.5px] font-semibold text-fg group-hover:text-accent">{ticker}</span>
      {showName && <span className="max-w-64 truncate text-fg-secondary">{name}</span>}
    </Link>
  );
}
