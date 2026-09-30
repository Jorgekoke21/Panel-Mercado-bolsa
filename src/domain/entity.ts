/**
 * Referencia genérica a cualquier nivel navegable de MarketRadar.
 *
 * Es la pieza que conectará gráficos, breadth, noticias y eventos globales (Fases 4/5)
 * con índices, sectores, industrias y empresas sin acoplar cada página a cada fuente.
 */
export type EntityKind = "index" | "sector" | "industry" | "subIndustry" | "company";

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  index: "Index",
  sector: "Sector",
  industry: "Industry",
  subIndustry: "Sub-industry",
  company: "Company",
};

/** Elemento de breadcrumb (Índice → Sector → Industria → Sub-industria → Empresa). */
export interface EntityCrumb {
  kind: EntityKind;
  label: string;
  href: string;
}
