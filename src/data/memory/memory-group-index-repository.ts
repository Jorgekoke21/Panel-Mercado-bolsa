import type { GroupIndexRef, GroupIndexRepository, GroupIndexSeries } from "@/data/repositories/group-index-repository";

/** Implementación en memoria (tests). */
export class MemoryGroupIndexRepository implements GroupIndexRepository {
  constructor(private readonly series: readonly GroupIndexSeries[] = []) {}

  async getSeries(refs: readonly GroupIndexRef[]) {
    return this.series.filter((s) => refs.some((r) => r.kind === s.kind && r.key === s.key));
  }
}
