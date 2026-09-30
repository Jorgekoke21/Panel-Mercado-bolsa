/**
 * Índices de mercado.
 *
 * OFFICIAL: publicado por un tercero (S&P DJI, Nasdaq, FTSE Russell…).
 * SYNTHETIC: calculado por MarketRadar a partir de sus componentes. Nunca se presenta como
 * oficial y su metodología siempre es visible (CAMBIO 6).
 */
export type IndexKind = "official" | "synthetic";
export type IndexMethodology = "provider" | "equal_weight" | "cap_weight";

export type IndexScope =
  | { level: "sector"; id: string }
  | { level: "industryGroup"; id: string }
  | { level: "industry"; id: string }
  | { level: "subIndustry"; id: string };

export interface MarketIndex {
  id: string;
  code: string;
  slug: string;
  name: string;
  shortName: string | null;
  kind: IndexKind;
  methodology: IndexMethodology;
  provider: string;
  countryCode: string | null;
  currency: string | null;
  description: string | null;
  scope: IndexScope | null;
  constituentsTracked: boolean;
}

export interface IndexMembership {
  indexId: string;
  indexCode: string;
  indexSlug: string;
  indexName: string;
  indexShortName: string | null;
  indexKind: IndexKind;
  addedOn: string | null;
  /** Dataset del que procede la pertenencia (procedencia de la composición). */
  datasetId: string | null;
}

export const METHODOLOGY_LABELS: Record<IndexMethodology, string> = {
  provider: "Provider methodology",
  equal_weight: "Equal weighted",
  cap_weight: "Cap weighted",
};

export const INDEX_KIND_LABELS: Record<IndexKind, string> = {
  official: "Official index",
  synthetic: "MarketRadar synthetic index",
};
