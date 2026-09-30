/**
 * Ontología y grafo de relaciones de MarketRadar (Fases 4/5).
 *
 * Un nodo es cualquier cosa con la que una noticia o un evento puede relacionarse. Las claves son
 * ESTABLES y legibles:
 *   company:<uuid>          emisor (tabla companies)
 *   security:<uuid>         valor cotizado (tabla securities) — solo si se menciona el ticker concreto
 *   sector:<GICS code>      "sector:45"
 *   industry:<GICS code>    "industry:453010"
 *   subIndustry:<GICS code> "subIndustry:45301020"
 *   index:<slug>            "index:sp500"
 *   country:<ISO 3166-1>    "country:CN" (EU = Unión Europea, región)
 *   commodity:<code>        ontología en código (src/knowledge/commodities.ts)
 *   factor:<code>           factores macro/temáticos (src/knowledge/factors.ts)
 *   theme:<slug>            temas propios (tabla themes)
 *   external:<code>         empresas relevantes fuera del universo (TSMC, ASML…), sin datos de mercado
 *
 * Las clasificaciones usan el CÓDIGO GICS (no el uuid) para que las relaciones curadas en código sean
 * legibles y no dependan del seed.
 */
export type NodeKind =
  | "company"
  | "security"
  | "sector"
  | "industry"
  | "subIndustry"
  | "index"
  | "country"
  | "commodity"
  | "factor"
  | "theme"
  | "external";

export const NODE_KINDS: readonly NodeKind[] = [
  "company",
  "security",
  "sector",
  "industry",
  "subIndustry",
  "index",
  "country",
  "commodity",
  "factor",
  "theme",
  "external",
];

export type NodeKey = `${NodeKind}:${string}`;

export function nodeKey(kind: NodeKind, key: string): NodeKey {
  return `${kind}:${key}`;
}

export function parseNodeKey(value: string): { kind: NodeKind; key: string } | null {
  const i = value.indexOf(":");
  if (i <= 0) return null;
  const kind = value.slice(0, i) as NodeKind;
  if (!NODE_KINDS.includes(kind)) return null;
  const key = value.slice(i + 1);
  return key ? { kind, key } : null;
}

/** Dirección de un movimiento de un nodo (precio de una materia prima, nivel de un factor). */
export type Move = "up" | "down" | "flat" | "unknown";

/**
 * Tipo de relación del grafo.
 *   DRIVES        "si el origen sube, el destino potencialmente sube (sign +1) / baja (−1) / mixto (0)"
 *   SUPPLIES      el origen es proveedor del destino (cadena de suministro)
 *   EXPOSED_TO    el origen tiene exposición material al destino (país, factor)
 *   LOCATED_IN    sede / producción principal en un país
 *   PEER_OF       misma sub-industria GICS (FUNDAMENTAL, derivada de la clasificación)
 *   MEMBER_OF     jerarquía GICS / índice (FUNDAMENTAL, derivada)
 */
export type RelationType = "DRIVES" | "SUPPLIES" | "EXPOSED_TO" | "LOCATED_IN" | "PEER_OF" | "MEMBER_OF";

/** Mecanismo económico que explica una relación DRIVES. */
export type Mechanism =
  | "revenue"
  | "input_cost"
  | "demand"
  | "financing_cost"
  | "valuation"
  | "safe_haven"
  | "policy_reaction"
  | "fx_translation"
  | "supply_constraint"
  | "trade_access"
  | "risk_premium";

export type ImpactChannel = "DIRECT" | "SECOND_ORDER" | "MACRO" | "SUPPLY_CHAIN";

export type Horizon = "days" | "weeks" | "months" | "quarters";

/** Origen de una relación (el usuario debe poder saber de dónde sale cada arista). */
export type RelationOrigin = "STATIC" | "FUNDAMENTAL" | "EVENT" | "AI";

export interface RelationEvidence {
  /**
   * economic_mechanism: relación económica estándar (explicada en `rationale`), no una afirmación sobre una empresa.
   * company_filing:     la empresa lo declara en un documento oficial (10-K, informe anual); `ref` lo identifica.
   * official_list:      lista publicada por la empresa (p. ej. Apple Supplier List).
   * classification:     derivada de GICS.
   */
  kind: "economic_mechanism" | "company_filing" | "official_list" | "classification";
  ref?: string;
  url?: string;
}

export interface Relation {
  id: string;
  from: NodeKey;
  to: NodeKey;
  type: RelationType;
  /** Solo DRIVES/SUPPLIES: +1 mismo sentido, −1 sentido contrario, 0 ambiguo. */
  sign: 1 | -1 | 0;
  mechanism?: Mechanism;
  channel: Exclude<ImpactChannel, "DIRECT">;
  /** 1 débil · 2 moderada · 3 fuerte (relevancia económica típica, no una predicción). */
  strength: 1 | 2 | 3;
  horizon: Horizon;
  /** Confianza en que la relación existe (no en el resultado de mercado). */
  confidence: number;
  rationale: string;
  evidence: RelationEvidence;
  origin: RelationOrigin;
  /** Fecha de la última revisión humana (STATIC) o de cálculo. */
  reviewedAt: string;
  validFrom?: string;
  validTo?: string;
}

export interface OntologyNode {
  key: NodeKey;
  name: string;
  /** Alias para resolución de entidades (idiomas: en, es, fr, de, it, pt cuando procede). */
  aliases: readonly string[];
  description?: string;
}
