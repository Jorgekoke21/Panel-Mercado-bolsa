"use client";

import Link from "next/link";
import { TIME_RANGES, type TimeRange } from "@/domain/time-range";
import { withRange } from "@/lib/routes";
import { useI18n } from "@/i18n/provider";
import { timeRangeLabel } from "@/i18n/domain";
import { segmentGroupClass, segmentItemClass } from "@/components/ui/styles";

interface TimeRangeSelectorProps {
  current: TimeRange;
  /** Ruta base (con o sin query) a la que se añade `range`. */
  basePath: string;
  ranges?: readonly TimeRange[];
}

/** Selector de periodo global basado en URL (?range=): compartible y sin estado en cliente. */
export function TimeRangeSelector({ current, basePath, ranges = TIME_RANGES }: TimeRangeSelectorProps) {
  const { locale, messages } = useI18n();
  return (
    <nav aria-label={`${messages.market.range} (${locale === "es" ? "periodo" : "time period"})`} className={segmentGroupClass}>
      {ranges.map((range) => {
        const active = range === current;
        return (
          <Link
            key={range}
            href={withRange(basePath, range)}
            scroll={false}
            aria-current={active ? "true" : undefined}
            title={timeRangeLabel(locale, range)}
            className={segmentItemClass(active)}
          >
            {range}
          </Link>
        );
      })}
    </nav>
  );
}
