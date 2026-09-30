import Link from "next/link";
import type { TimeRange } from "@/domain/time-range";
import { timeRangeLabel } from "@/i18n/domain";
import type { MoneyAggregate } from "@/lib/calculations/group-performance";
import { formatCompact } from "@/lib/format";
import { sectorPath } from "@/lib/routes";
import type { ClassificationGroup } from "@/services/market-rows";
import { PerformanceBadge } from "./performance-badge";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { classificationLabel } from "@/i18n/classification";

export function formatMoneyAggregate(aggregate: MoneyAggregate, locale: Locale = DEFAULT_LOCALE): string {
  if (aggregate.kind === "single") return formatCompact(aggregate.value, aggregate.currency, locale);
  if (aggregate.kind === "mixed") return `${locale === "es" ? "Mixto" : "Mixed"} (${aggregate.currencies.join("/")})`;
  return "—";
}

interface SectorCardProps {
  group: ClassificationGroup;
  range: TimeRange;
  industries: number;
  locale?: Locale;
}

/** Resumen compacto de un sector: rendimiento agregado, tamaño, amplitud y principales movimientos. */
export function SectorCard({ group, range, industries, locale = DEFAULT_LOCALE }: SectorCardProps) {
  const { performance, breadth } = group.stats;
  const movers = [...group.rows]
    .filter((r) => typeof r.snapshot?.returns[range] === "number")
    .sort((a, b) => Math.abs(b.snapshot?.returns[range] ?? 0) - Math.abs(a.snapshot?.returns[range] ?? 0))
    .slice(0, 3);
  const covered = breadth.returnCoverage || 1;

  return (
    <Link
      href={sectorPath(group.slug)}
      className="flex flex-col gap-2 rounded-[4px] border border-border bg-surface p-2.5 hover:border-border-strong hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-fg">{classificationLabel(locale, group.name)}</div>
          <div className="text-[10px] text-fg-muted">
            {performance.count} {locale === "es" ? "valores" : "securities"} · {industries} {locale === "es" ? "industrias" : "industries"}
          </div>
        </div>
        <PerformanceBadge value={performance.capWeighted[range]} variant="pill" arrow label={timeRangeLabel(locale, range)} className="text-xs" />
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-raised" title={`${breadth.advancers} ${locale === "es" ? "subidas" : "up"} · ${breadth.decliners} ${locale === "es" ? "caídas" : "down"}`}>
        <div className="bg-positive" style={{ width: `${(breadth.advancers / covered) * 100}%` }} />
        <div className="bg-fg-muted" style={{ width: `${(breadth.unchanged / covered) * 100}%` }} />
        <div className="bg-negative" style={{ width: `${(breadth.decliners / covered) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-fg-muted">
        <span>
          <span className="text-positive">{breadth.advancers}▲</span> · <span className="text-negative">{breadth.decliners}▼</span>
        </span>
        <span className="num font-mono">{formatMoneyAggregate(performance.marketCap, locale)}</span>
      </div>
      <ul className="flex flex-col gap-0.5 border-t border-border pt-1.5">
        {movers.map((m) => (
          <li key={m.summary.securityId} className="flex items-center justify-between text-2xs">
            <span className="font-mono font-semibold text-fg-secondary">{m.ticker}</span>
            <PerformanceBadge value={m.snapshot?.returns[range]} />
          </li>
        ))}
      </ul>
    </Link>
  );
}
