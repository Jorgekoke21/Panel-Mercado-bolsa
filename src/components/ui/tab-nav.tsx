"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabItemClass, tabListClass, type TabTone } from "./styles";

export interface TabNavItem {
  label: string;
  href: string;
  /** Marca la pestaña como funcionalidad futura (sigue siendo navegable a su placeholder). */
  future?: boolean;
  /** "ai": la pestaña activa usa el morado de IA. */
  tone?: TabTone;
}

/** Pestañas como subrutas (D10): URL compartible y carga de datos independiente. Estilo único: ui/styles.ts. */
export function TabNav({ items, label }: { items: TabNavItem[]; label: string }) {
  const pathname = usePathname();
  const decoded = decodeURIComponent(pathname);
  return (
    <nav aria-label={label} className={tabListClass}>
      {items.map((item) => {
        const active = decodeURIComponent(item.href) === decoded;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={tabItemClass(active, item.tone, item.future && !active ? "text-fg-muted/70" : undefined)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
