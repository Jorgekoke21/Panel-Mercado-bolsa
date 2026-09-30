/**
 * Navegación principal. El orden refleja las capas de MarketRadar:
 * World → Global Intelligence → Markets → Index → Sector → Industry → Company.
 * Las secciones futuras se muestran desactivadas con su fase.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string | null;
  /** Fase en la que se activará (solo para elementos desactivados). */
  availableInPhase?: string;
}

export interface NavSection {
  id: string;
  label: string | null;
  items: NavItem[];
}

export const NAVIGATION: readonly NavSection[] = [
  {
    id: "main",
    label: null,
    items: [{ id: "dashboard", label: "Dashboard", href: "/" }],
  },
  {
    id: "global",
    label: "Global",
    items: [
      { id: "world", label: "World", href: null, availableInPhase: "4–5" },
      { id: "commodities", label: "Commodities", href: null, availableInPhase: "4" },
      { id: "news", label: "World Pulse", href: "/news" },
    ],
  },
  {
    id: "markets",
    label: "Markets",
    items: [
      { id: "markets", label: "Markets", href: "/markets" },
      { id: "sectors", label: "Sectors", href: "/sectors" },
      { id: "companies", label: "Companies", href: "/companies" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { id: "screener", label: "Screener", href: null, availableInPhase: "3" },
      { id: "compare", label: "Compare", href: null, availableInPhase: "3" },
      { id: "watchlist", label: "Watchlist", href: "/watchlist" },
      { id: "ask", label: "Ask MarketRadar", href: "/ask" },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  const related: Record<string, string[]> = {
    "/markets": ["/markets", "/index/"],
    "/sectors": ["/sectors", "/sector/", "/industry/"],
    "/companies": ["/companies", "/company/"],
  };
  return (related[item.href] ?? [item.href]).some((prefix) => pathname.startsWith(prefix));
}
