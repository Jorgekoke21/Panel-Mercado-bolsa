import type { GroupIndexPoint, GroupIndexRef, GroupIndexSeries } from "@/data/repositories/group-index-repository";
import type { Repositories } from "./market-rows";

/**
 * Comparaciones rebased (base 100 al inicio del periodo) entre una compañía y los índices SINTÉTICOS
 * de MarketRadar de su industria, sector y constituyentes del índice. El rebase lo hace el cliente
 * según el periodo elegido; aquí se entregan las series completas.
 */
export interface ComparisonLine {
  id: string;
  label: string;
  detail: string;
  /** Serie de una security (price return, ajustada por splits); null en grupos. */
  single: GroupIndexPoint[] | null;
  equal: GroupIndexPoint[] | null;
  cap: GroupIndexPoint[] | null;
  /** Cobertura en la última sesión: miembros con dato / total. */
  coverage: { equal: [number, number] | null; cap: [number, number] | null };
}

export interface ComparisonData {
  lines: ComparisonLine[];
  asOf: string | null;
  computedAt: string | null;
}

export interface ComparisonGroup extends GroupIndexRef {
  label: string;
  detail: string;
}

export async function getComparison(
  repos: Repositories,
  groups: readonly ComparisonGroup[],
  company?: { id: string; label: string; detail: string; points: GroupIndexPoint[] },
): Promise<ComparisonData | null> {
  const series = await repos.groupIndices.getSeries(groups);
  if (series.length === 0 && !company) return null;
  const find = (g: GroupIndexRef, method: GroupIndexSeries["method"]) => series.find((s) => s.kind === g.kind && s.key === g.key && s.method === method) ?? null;
  const lines: ComparisonLine[] = [];
  if (company) lines.push({ ...company, single: company.points, equal: null, cap: null, coverage: { equal: null, cap: null } });
  for (const g of groups) {
    const equal = find(g, "equal_weight");
    const cap = find(g, "cap_weight");
    if (!equal && !cap) continue;
    lines.push({
      id: `${g.kind}:${g.key}`,
      label: g.label,
      detail: g.detail,
      single: null,
      equal: equal?.points ?? null,
      cap: cap?.points ?? null,
      coverage: {
        equal: equal ? [equal.membersLast, equal.membersTotal] : null,
        cap: cap ? [cap.membersLast, cap.membersTotal] : null,
      },
    });
  }
  const all = series.flatMap((s) => s.points.slice(-1).map((p) => p.time));
  return {
    lines,
    asOf: all.sort().at(-1) ?? company?.points.at(-1)?.time ?? null,
    computedAt: series.map((s) => s.computedAt).sort().at(-1) ?? null,
  };
}
