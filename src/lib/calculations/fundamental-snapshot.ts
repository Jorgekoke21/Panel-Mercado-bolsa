import type { FinancialStatementValue, FundamentalOrigin } from "@/domain/fundamentals";
import { computeRatios, type RatioId } from "./ratios";
import { computeTtm } from "./ttm";

/**
 * Snapshot de fundamentales de un emisor, independiente del precio (materialización para agregados).
 * Solo guarda valores con estado "ok": todo lo demás queda null (nunca 0).
 */
export const SNAPSHOT_METRICS = [
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "roe",
  "roic",
  "revenue_growth",
  "net_income_growth",
  "eps_growth",
] as const satisfies readonly RatioId[];
export type SnapshotMetric = (typeof SNAPSHOT_METRICS)[number];

export interface FundamentalSnapshot {
  template: "general" | "financial" | "reit";
  asOfPeriodEnd: string | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  metrics: Record<SnapshotMetric, number | null>;
}

export function buildFundamentalSnapshot(
  statements: readonly FinancialStatementValue[],
  template: FundamentalSnapshot["template"],
  origins: readonly FundamentalOrigin[] = ["reported", "derived"],
): FundamentalSnapshot {
  const ratios = computeRatios({ template, statements, origins, price: null, marketCap: null, dividendsTtmPerShare: null });
  const metrics = Object.fromEntries(
    SNAPSHOT_METRICS.map((id) => {
      const r = ratios.find((x) => x.id === id);
      return [id, r?.status === "ok" ? r.value : null];
    }),
  ) as Record<SnapshotMetric, number | null>;
  const revenue = computeTtm(statements, "revenue", origins);
  const netIncome = computeTtm(statements, "net_income", origins);
  return {
    template,
    asOfPeriodEnd: revenue?.asOfPeriodEnd ?? netIncome?.asOfPeriodEnd ?? null,
    revenueTtm: revenue?.value ?? null,
    netIncomeTtm: netIncome?.value ?? null,
    metrics,
  };
}

export interface GroupFundamentalStat {
  metric: SnapshotMetric;
  median: number | null;
  /** Emisores con dato / emisores del grupo. */
  count: number;
  total: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Medianas por métrica sobre los emisores del grupo con dato (la mediana resiste valores extremos). */
export function summarizeGroupFundamentals(snapshots: readonly (FundamentalSnapshot | null)[]): GroupFundamentalStat[] {
  const total = snapshots.length;
  return SNAPSHOT_METRICS.map((metric) => {
    const values = snapshots.map((s) => s?.metrics[metric]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return { metric, median: median(values), count: values.length, total };
  });
}
