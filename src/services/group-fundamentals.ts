import type { SecuritySummary } from "@/domain/reference";
import { type GroupFundamentalStat, summarizeGroupFundamentals } from "@/lib/calculations/fundamental-snapshot";
import type { Repositories } from "./market-rows";

/**
 * Fundamentales REALES de un grupo (sector / industria / sub-industria / índice): medianas de las
 * métricas materializadas por el job SEC. Un emisor cuenta una vez aunque tenga varias clases.
 */
export interface GroupFundamentals {
  stats: GroupFundamentalStat[];
  issuers: number;
  issuersWithData: number;
  /** Rango de "último trimestre" entre los emisores (los calendarios fiscales difieren). */
  asOf: { min: string; max: string } | null;
}

export async function getGroupFundamentals(repos: Repositories, securities: readonly SecuritySummary[]): Promise<GroupFundamentals> {
  const companyIds = [...new Set(securities.map((s) => s.companyId))];
  const snapshots = await repos.fundamentals.listFundamentalSnapshots(companyIds);
  const list = companyIds.map((id) => snapshots.get(id) ?? null);
  const dates = [...snapshots.values()].map((s) => s.asOfPeriodEnd).filter((d): d is string => d !== null).sort();
  return {
    stats: summarizeGroupFundamentals(list),
    issuers: companyIds.length,
    issuersWithData: snapshots.size,
    asOf: dates.length ? { min: dates[0] as string, max: dates.at(-1) as string } : null,
  };
}
