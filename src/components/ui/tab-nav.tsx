"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabNavItem {
  label: string;
  href: string;
  /** Marca la pestaña como funcionalidad futura (sigue siendo navegable a su placeholder). */
  future?: boolean;
}

/** Pestañas como subrutas (D10): URL compartible y carga de datos independiente. */
export function TabNav({ items, label }: { items: TabNavItem[]; label: string }) {
  const pathname = usePathname();
  const decoded = decodeURIComponent(pathname);
  return (
    <nav aria-label={label} className="scroll-thin flex overflow-x-auto border-b border-border">
      {items.map((item) => {
        const active = decodeURIComponent(item.href) === decoded;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-2xs font-semibold tracking-wide whitespace-nowrap uppercase",
              active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg-secondary",
              item.future && !active && "text-fg-muted/70",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
