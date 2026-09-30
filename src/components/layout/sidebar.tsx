"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isNavItemActive, NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";

/** Navegación principal. En móvil se abre como cajón desde el botón "Menu". */
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
        className="fixed top-1.5 left-2 z-40 rounded-[3px] border border-border bg-surface px-2 py-1 text-2xs font-semibold text-fg-secondary uppercase md:hidden"
      >
        {messages.common.menu}
      </button>
      {open && <div aria-hidden className="fixed inset-0 z-30 bg-bg/70 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        id="mr-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-48 shrink-0 flex-col border-r border-border bg-surface transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/" className="flex h-10 items-center gap-2 border-b border-border px-3" onClick={() => setOpen(false)}>
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-accent">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="10" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
            <path d="M10 10 L17 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-bold tracking-[0.14em] text-fg uppercase">MarketRadar</span>
        </Link>
        <nav aria-label={messages.common.mainNavigation} className="scroll-thin flex-1 overflow-y-auto py-2">
          {NAVIGATION.map((section) => (
            <div key={section.id} className="mb-2">
              {section.label && (
                <div className="px-3 pt-1 pb-0.5 text-[9px] font-semibold tracking-[0.14em] text-fg-muted uppercase">{sectionLabels[section.id] ?? section.label}</div>
              )}
              <ul>
                {section.items.map((item) => {
                  if (!item.href) {
                    return (
                      <li key={item.id}>
                        <span
                          aria-disabled="true"
                          title={messages.navigation.availableInPhase.replace("{phase}", item.availableInPhase ?? "")}
                          className="flex items-center justify-between px-3 py-1 text-2xs font-semibold tracking-wide text-fg-muted/60 uppercase"
                        >
                          {labels[item.id] ?? item.label}
                          <span className="font-mono text-[9px] tracking-normal">P{item.availableInPhase}</span>
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
                          "flex items-center border-l-2 px-3 py-1 text-2xs font-semibold tracking-wide uppercase",
                          active ? "border-accent bg-surface-hover text-fg" : "border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
                        )}
                      >
                        {labels[item.id] ?? item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-2 text-[9px] text-fg-muted">{messages.navigation.footer}</div>
      </aside>
    </>
  );
}
