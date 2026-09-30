/**
 * Índices SINTÉTICOS de MarketRadar por grupo (sector, industria…, constituyentes del índice).
 * No son índices oficiales: se construyen con los constituyentes actuales (ver ADR-0010).
 */
export type GroupKind = "index" | "sector" | "industry_group" | "industry" | "sub_industry";
export type GroupIndexMethod = "equal_weight" | "cap_weight";

export interface GroupIndexRef {
  kind: GroupKind;
  /** uuid del nodo de clasificación o slug del índice. */
  key: string;
}

export interface GroupIndexPoint {
  time: string;
  value: number;
}

export interface GroupIndexSeries extends GroupIndexRef {
  method: GroupIndexMethod;
  points: GroupIndexPoint[];
  membersTotal: number;
  /** Miembros que aportan en la última sesión (con dato; en cap weight, con capitalización verificada). */
  membersLast: number;
  computedAt: string;
}

export interface GroupIndexRepository {
  getSeries(refs: readonly GroupIndexRef[]): Promise<GroupIndexSeries[]>;
}
