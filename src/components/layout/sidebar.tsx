"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Building2, Eye, Gem, Globe, GitCompareArrows, LayoutDashboard, LayoutGrid, type LucideIcon, Menu, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import { isNavItemActive, NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, world: Globe, commodities: Gem, news: Activity, markets: TrendingUp, sectors: LayoutGrid,
  companies: Building2, screener: SlidersHorizontal, compare: GitCompareArrows, watchlist: Eye, ask: Sparkles,
};

/**
 * Navegación principal (geometría de Academia Trading, más sobria): papel crema, separador de tinta,
 * activo = barra vertical amarilla + fondo tintado + etiqueta en negrita. En móvil, cajón desde "Menú".
 */
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { messages } = useI18n();
  const labels: Record<string, string> = {
    dashboard: messages.navigation.dashboard, world: messages.navigation.world, commodities: messages.navigation.commodities, news: messages.navigation.worldPulse,
    markets: messages.navigation.markets, sectors: messages.navigation.sectors, companies: messages.navigation.companies, screener: messages.navigation.screener,
    compare: messages.navigation.compare, watchlist: messages.navigation.watchlist, ask: messages.navigation.ask,
  };
  const sectionLabels: Record<string, string> = { global: messages.navigation.global, markets: messages.navigation.markets, tools: messages.navigation.tools };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mr-sidebar"
        className="fixed top-3 left-2 z-40 flex h-8 items-center gap-1 rounded-ctl border-2 border-border-brand bg-surface px-2 text-xs font-bold text-fg md:hidden"
      >
        <Menu aria-hidden className="h-4 w-4" strokeWidth={2} />
        {messages.common.menu}
      </button>
      {open && <div aria-hidden className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        id="mr-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r-2 border-border-brand bg-bg transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/" className="flex h-14 items-center gap-2 border-b-2 border-border-brand bg-brand-yellow px-3" onClick={() => setOpen(false)}>
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
            <circle cx="12" cy="12" r="10.5" fill="var(--mr-paper)" stroke="var(--mr-ink)" strokeWidth="2" />
            <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--mr-ink)" strokeWidth="1.5" />
            <path d="M12 12 L19.5 6" stroke="var(--mr-ink)" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.8" fill="var(--mr-ink)" />
          </svg>
          <span className="pt-0.5 font-brand text-[19px] leading-none tracking-[0.03em] text-ink">MARKETRADAR</span>
        </Link>
        <nav aria-label={messages.common.mainNavigation} className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
          {NAVIGATION.map((section) => (
            <div key={section.id} className="mb-2">
              {section.label && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.08em] text-fg-muted uppercase">{sectionLabels[section.id] ?? section.label}</div>
              )}
              <ul>
                {section.items.map((item) => {
                  const Icon = ICONS[item.id];
                  if (!item.href) {
                    return (
                      <li key={item.id}>
                        <span
                          aria-disabled="true"
                          title={messages.navigation.availableInPhase.replace("{phase}", item.availableInPhase ?? "")}
                          className="flex items-center gap-2.5 rounded-[4px] border-l-[3px] border-transparent px-2 py-1.5 text-[13px] font-medium text-fg-muted/70"
                        >
                          {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
                          <span className="flex-1">{labels[item.id] ?? item.label}</span>
                          <span className="rounded-chip border border-border-strong px-1 text-[9.5px] font-semibold">P{item.availableInPhase}</span>
                        </span>
                      </li>
                    );
                  }
                  const active = isNavItemActive(item, pathname);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[4px] border-l-[3px] px-2 py-1.5 text-[13px]",
                          active ? "border-accent bg-accent-muted font-bold text-fg" : "border-transparent font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg",
                        )}
                      >
                        {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />}
                        {labels[item.id] ?? item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t-2 border-border-brand px-3 py-2.5 text-[10.5px] leading-snug text-fg-muted">{messages.navigation.footer}</div>
      </aside>
    </>
  );
}
