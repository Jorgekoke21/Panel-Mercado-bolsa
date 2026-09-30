import type { TimeRange } from "@/domain/time-range";
import { companyPath } from "@/lib/ticker";
import type { MarketRow } from "./market-rows";
import { groupByClassification } from "./market-rows";

/** Modelo de heatmap independiente del render: grupos → celdas con tamaño y variación. */
export interface HeatmapCellData {
  id: string;
  label: string;
  title: string;
  href: string;
  size: number;
  change: number | null;
}

export interface HeatmapGroupData {
  id: string;
  label: string;
  href: string | null;
  cells: HeatmapCellData[];
}

export interface HeatmapData {
  range: TimeRange;
  sizeLabel: string;
  groups: HeatmapGroupData[];
  /** Securities sin tamaño fiable (no se dibujan), con el motivo. Nunca se inventa un tamaño. */
  excluded: { ticker: string; reason: string }[];
}

const MISSING_PRICE_REASON = "missing_price";

export function buildHeatmap(
  rows: readonly MarketRow[],
  range: TimeRange,
  groupLevel: "sector" | "industry" | "subIndustry",
  groupHref: (slug: string) => string | null,
): HeatmapData {
  const excluded: HeatmapData["excluded"] = [];
  for (const row of rows) {
    if (row.snapshot?.marketCap && row.snapshot.marketCap > 0) continue;
    excluded.push({ ticker: row.ticker, reason: row.snapshot ? (row.snapshot.marketCapReason ?? row.snapshot.marketCapStatus.toLowerCase()) : MISSING_PRICE_REASON });
  }
  return {
    range,
    sizeLabel: "Verified market cap",
    excluded,
    groups: groupByClassification(rows, groupLevel, range).map((group) => ({
      id: group.id,
      label: group.name,
      href: groupHref(group.slug),
      cells: group.rows.flatMap((row) => {
        const size = row.snapshot?.marketCap;
        if (!size || size <= 0) return [];
        return [{
          id: row.summary.securityId,
          label: row.ticker,
          title: row.summary.companyName,
          href: companyPath(row.ticker),
          size,
          change: row.snapshot?.returns[range] ?? null,
        }];
      }),
    })),
  };
}
