"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { companyPath } from "@/lib/routes";
import type { SearchEntry } from "@/services/search";
import { useI18n } from "@/i18n/provider";
import { classificationLabel } from "@/i18n/classification";

const MAX_RESULTS = 8;

/** Filtra el índice local: primero coincidencias exactas/prefijo de ticker, luego por nombre. */
export function searchEntries(entries: readonly SearchEntry[], query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (e: SearchEntry) => {
    const ticker = e.ticker.toLowerCase();
    const name = e.name.toLowerCase();
    if (ticker === q) return 0;
    if (ticker.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.includes(q)) return 3;
    return -1;
  };
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.ticker.localeCompare(b.e.ticker))
    .slice(0, MAX_RESULTS)
    .map((x) => x.e);
}

/** Buscador de compañías (atajo "/"). Recibe un índice compacto desde el servidor. */
export function CompanySearch({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    setQuery("");
    setOpen(false);
    router.push(companyPath(entry.ticker));
  };

  const disabled = entries.length === 0;
  const { locale, messages } = useI18n();

  return (
    <div className="relative w-full max-w-sm">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-label={messages.common.searchCompanies}
        placeholder={disabled ? messages.common.searchUnavailable : messages.common.searchHint}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-7 w-full rounded-[3px] border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none disabled:opacity-60"
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-8 right-0 left-0 z-50 overflow-hidden rounded-[4px] border border-border-strong bg-surface-raised py-1 shadow-lg">
          {results.map((r, i) => (
            <li
              key={r.ticker}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-baseline gap-2 px-2 py-1 text-xs", i === active && "bg-surface-hover")}
            >
              <span className="w-14 shrink-0 font-mono font-semibold text-fg">{r.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-fg-secondary">{r.name}</span>
              <span className="hidden shrink-0 text-[10px] text-fg-muted sm:inline">{r.sector ? classificationLabel(locale, r.sector) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
