"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/messages";

const OPTIONS: { locale: Locale; labelKey: "spanish" | "english" }[] = [
  { locale: "es", labelKey: "spanish" },
  { locale: "en", labelKey: "english" },
];

function FlagIcon({ locale }: { locale: Locale }) {
  if (locale === "es") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 16" className="h-3 w-[18px] overflow-hidden rounded-[1px] shadow-[0_0_0_1px_rgb(255_255_255/0.15)]">
        <rect width="24" height="16" fill="#aa151b" />
        <rect y="4" width="24" height="8" fill="#f1bf00" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 16" className="h-3 w-[18px] overflow-hidden rounded-[1px] shadow-[0_0_0_1px_rgb(255_255_255/0.15)]">
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.5" />
      <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="6" />
      <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3" />
    </svg>
  );
}

export function LanguageSwitcher() {
  const { locale, messages, setLocale } = useI18n();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectByKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % OPTIONS.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + OPTIONS.length - 1) % OPTIONS.length
        : event.key === "Home" ? 0 : event.key === "End" ? OPTIONS.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    refs.current[nextIndex]?.focus();
    setLocale(OPTIONS[nextIndex]!.locale);
  };

  return (
    <div role="radiogroup" aria-label={messages.common.language} className="flex items-center gap-1">
      {OPTIONS.map((option, index) => {
        const selected = option.locale === locale;
        const label = messages.common[option.labelKey];
        return (
          <button
            key={option.locale}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setLocale(option.locale)}
            onKeyDown={(event) => selectByKey(event, index)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[3px] border text-sm leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              selected ? "border-accent bg-accent-muted text-fg" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg-secondary",
            )}
          >
            <FlagIcon locale={option.locale} />
          </button>
        );
      })}
    </div>
  );
}
