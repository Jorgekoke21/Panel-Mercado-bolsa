import Link from "next/link";
import type { TimeRange } from "@/domain/time-range";
import { formatCompact, formatPrice } from "@/lib/format";
import { companyPath } from "@/lib/routes";
import type { MarketRow } from "@/services/market-rows";
import { PerformanceBadge } from "./performance-badge";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { timeRangeLabel } from "@/i18n/domain";

/** Tarjeta compacta de empresa (peers, listas relacionadas). */
export function CompanyCard({ row, range, locale = DEFAULT_LOCALE }: { row: MarketRow; range: TimeRange; locale?: Locale }) {
  const s = row.snapshot;
  return (
    <Link
      href={companyPath(row.ticker)}
      className="flex min-w-0 flex-col gap-0.5 rounded-card border-2 border-border-brand bg-surface px-2.5 py-1.5 hover:border-border-strong hover:bg-surface-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-fg">{row.ticker}</span>
        <PerformanceBadge value={s?.returns[range]} label={timeRangeLabel(locale, range)} className="text-2xs" />
      </div>
      <div className="truncate text-2xs text-fg-secondary" title={row.summary.companyName}>
        {row.summary.companyName}
      </div>
      <div className="num flex justify-between font-mono text-[10px] text-fg-muted">
        <span>{formatPrice(s?.price, row.summary.currency, locale)}</span>
        <span>{formatCompact(s?.marketCap, row.summary.currency, locale)}</span>
      </div>
    </Link>
  );
}
