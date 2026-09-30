import { COMMODITY_BY_CODE } from "./commodities";
import { COUNTRY_BY_CODE } from "./countries";
import { EXTERNAL_BY_CODE } from "./external-companies";
import { FACTOR_BY_CODE } from "./factors";
import { COMPANY_RELATIONS, REVIEWED_AT, STATIC_RELATIONS } from "./relations";
import type { NodeKey, Relation } from "./types";
import { parseNodeKey } from "./types";
import type { Universe } from "./universe";

/**
 * Grafo de relaciones de MarketRadar.
 *
 * Combina:
 *   STATIC       relaciones curadas en código (src/knowledge/relations.ts), con mecanismo y evidencia
 *   FUNDAMENTAL  jerarquía GICS y pares de la misma sub-industria (derivadas de la base de datos)
 *   (EVENT / AI  llegan como enlaces de evento en news_event_entities; no se guardan como aristas fijas)
 *
 * El grafo es inmutable y se construye una vez por proceso/petición.
 */
export class RelationGraph {
  private readonly out = new Map<NodeKey, Relation[]>();
  private readonly inc = new Map<NodeKey, Relation[]>();
  readonly relations: Relation[];
  readonly unresolved: string[];

  constructor(
    readonly universe: Universe,
    relations: readonly Relation[],
    unresolved: string[] = [],
  ) {
    this.relations = [...relations];
    this.unresolved = unresolved;
    for (const r of this.relations) {
      push(this.out, r.from, r);
      push(this.inc, r.to, r);
    }
  }

  outgoing(node: NodeKey): readonly Relation[] {
    return this.out.get(node) ?? [];
  }

  incoming(node: NodeKey): readonly Relation[] {
    return this.inc.get(node) ?? [];
  }

  /** Emisores del universo clasificados bajo un nodo GICS (sector/industria/sub-industria). */
  companiesUnder(node: NodeKey): string[] {
    const parsed = parseNodeKey(node);
    if (!parsed) return [];
    const field = parsed.kind === "sector" ? "sectorCode" : parsed.kind === "industry" ? "industryCode" : parsed.kind === "subIndustry" ? "subIndustryCode" : null;
    if (!field) return [];
    return this.universe.companies.filter((c) => c[field] === parsed.key).map((c) => c.companyId);
  }

  /** Pares de la misma sub-industria GICS (relación FUNDAMENTAL). */
  peersOf(companyId: string): string[] {
    const company = this.universe.byCompanyId.get(companyId);
    if (!company?.subIndustryCode) return [];
    return this.universe.companies.filter((c) => c.companyId !== companyId && c.subIndustryCode === company.subIndustryCode).map((c) => c.companyId);
  }

  label(node: NodeKey): string {
    return nodeLabel(node, this.universe);
  }
}

function push(map: Map<NodeKey, Relation[]>, key: NodeKey, r: Relation) {
  const list = map.get(key);
  if (list) list.push(r);
  else map.set(key, [r]);
}

export function nodeLabel(node: string, universe?: Universe): string {
  const parsed = parseNodeKey(node);
  if (!parsed) return node;
  const { kind, key } = parsed;
  switch (kind) {
    case "company":
      return universe?.byCompanyId.get(key)?.name ?? key;
    case "security": {
      const s = universe?.bySecurityId.get(key);
      return s ? `${s.ticker} (${s.company.name})` : key;
    }
    case "sector":
      return universe?.sectors.get(key)?.name ?? `GICS ${key}`;
    case "industry":
      return universe?.industries.get(key)?.name ?? `GICS ${key}`;
    case "subIndustry":
      return universe?.subIndustries.get(key)?.name ?? `GICS ${key}`;
    case "index":
      return key === "sp500" ? "S&P 500" : key;
    case "country":
      return COUNTRY_BY_CODE.get(key)?.name ?? key;
    case "commodity":
      return COMMODITY_BY_CODE.get(key)?.name ?? key;
    case "factor":
      return FACTOR_BY_CODE.get(key)?.name ?? key;
    case "external":
      return EXTERNAL_BY_CODE.get(key)?.name ?? key;
    case "theme":
      return key;
  }
}

/** Construye el grafo resolviendo las relaciones de empresa (ticker → company:<uuid>). */
export function buildRelationGraph(universe: Universe): RelationGraph {
  const unresolved: string[] = [];
  const resolve = (end: NodeKey | { ticker: string }): NodeKey | null => {
    if (typeof end === "string") return end;
    const company = universe.byTicker.get(end.ticker);
    if (!company) {
      unresolved.push(end.ticker);
      return null;
    }
    return `company:${company.companyId}`;
  };
  const companyRelations: Relation[] = [];
  for (const spec of COMPANY_RELATIONS) {
    const from = resolve(spec.from);
    const to = resolve(spec.to);
    if (!from || !to) continue;
    companyRelations.push({
      id: `${from}>${to}`,
      from,
      to,
      type: spec.type,
      sign: spec.type === "SUPPLIES" ? 1 : 0,
      channel: "SUPPLY_CHAIN",
      strength: spec.strength ?? 2,
      horizon: "quarters",
      confidence: spec.confidence,
      rationale: spec.rationale,
      evidence: spec.evidence,
      origin: "STATIC",
      reviewedAt: REVIEWED_AT,
    });
  }
  return new RelationGraph(universe, [...STATIC_RELATIONS, ...companyRelations], unresolved);
}
