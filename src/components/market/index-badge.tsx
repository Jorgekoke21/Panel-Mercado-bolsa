"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { INDEX_KIND_LABELS, type IndexKind, type IndexMethodology, METHODOLOGY_LABELS } from "@/domain/market-index";
import { indexPath } from "@/lib/routes";
import { useI18n } from "@/i18n/provider";

/** Distingue SIEMPRE índice oficial de índice sintético de MarketRadar (CAMBIO 6). */
export function IndexKindBadge({ kind }: { kind: IndexKind }) {
  const { locale } = useI18n();
  const official = locale === "es" ? "Índice oficial" : "Official index";
  const synthetic = locale === "es" ? "Índice sintético" : "Synthetic index";
  return kind === "official" ? (
    <Badge variant="official" title={official}>
      {official}
    </Badge>
  ) : (
    <Badge variant="synthetic" title={synthetic}>
      {synthetic}
    </Badge>
  );
}

/**
 * Marca un agregado calculado por MarketRadar (rendimiento de sector/industria, breadth…)
 * con su metodología visible. Nunca se presenta como índice oficial.
 */
export function SyntheticBadge({ methodology }: { methodology: Exclude<IndexMethodology, "provider"> }) {
  const { locale } = useI18n();
  const method = locale === "es"
    ? (methodology === "cap_weight" ? "ponderación por capitalización" : "ponderación igual")
    : METHODOLOGY_LABELS[methodology];
  return (
    <Badge variant="synthetic" title={locale === "es" ? `Agregado sintético de MarketRadar · ${method}` : `MarketRadar synthetic aggregate · ${method}`}>
      {locale === "es" ? `Sintético · ${methodology === "cap_weight" ? "capitalización" : "igual"}` : `Synthetic · ${methodology === "cap_weight" ? "Cap-wt" : "Equal-wt"}`}
    </Badge>
  );
}

/** Badge de pertenencia a un índice, enlazado a su ficha. */
export function IndexBadge({ slug, label, kind }: { slug: string; label: string; kind: IndexKind }) {
  const { locale } = useI18n();
  const kindLabel = locale === "es" ? (kind === "official" ? "Índice oficial" : "Índice sintético") : INDEX_KIND_LABELS[kind];
  return (
    <Link href={indexPath(slug)} className="rounded-[3px] hover:opacity-80">
      <Badge variant={kind === "official" ? "official" : "synthetic"} title={kindLabel}>
        {label}
      </Badge>
    </Link>
  );
}
