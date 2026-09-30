import type { GroupKind } from "@/data/repositories/group-index-repository";
import { TIME_RANGES, type TimeRange } from "@/domain/time-range";
import type { GroupPerformance } from "@/lib/calculations/group-performance";
import { periodReturns } from "@/lib/calculations/period-returns";
import type { Repositories } from "./market-rows";

/**
 * Rendimientos de grupo desde los índices SINTÉTICOS de MarketRadar (ADR-0010).
 *
 * Las medias calculadas sobre las instantáneas ponderan el rendimiento de un periodo con la
 * capitalización ACTUAL: sesgo de anticipación (las que más subieron pesan más; p. ej. IT 1Y +91 % frente
 * a +31 % con pesos del día anterior). Los índices ponderan cada día con la capitalización del cierre
 * previo (y rebalancean a diario en equal weight), así que son la fuente correcta para cualquier periodo.
 * Si un grupo no tiene serie, se mantienen las medias de las instantáneas.
 */
export interface IndexedGroup {
  kind: GroupKind;
  key: string;
  performance: GroupPerformance;
}

export const LEVEL_KIND = { sector: "sector", industryGroup: "industry_group", industry: "industry", subIndustry: "sub_industry" } as const;

export async function applyGroupIndexReturns(repos: Repositories, groups: readonly IndexedGroup[]): Promise<void> {
  if (groups.length === 0) return;
  const series = await repos.groupIndices.getSeries(groups.map((g) => ({ kind: g.kind, key: g.key })));
  for (const g of groups) {
    for (const [method, field] of [
      ["cap_weight", "capWeighted"],
      ["equal_weight", "equalWeighted"],
    ] as const) {
      const s = series.find((x) => x.kind === g.kind && x.key === g.key && x.method === method);
      if (!s || s.points.length < 2) continue;
      const returns = periodReturns(
        s.points.map((p) => ({ date: p.time, close: p.value })),
        TIME_RANGES,
      );
      const out: Partial<Record<TimeRange, number | null>> = {};
      for (const r of TIME_RANGES) out[r] = returns[r] ?? null;
      g.performance[field] = out;
    }
  }
}
