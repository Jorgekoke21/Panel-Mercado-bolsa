import Link from "next/link";
import type { EntityCrumb } from "@/domain/entity";

/** Índice → Sector → Industria → Sub-industria → Empresa. */
export function ClassificationBreadcrumb({ crumbs, current }: { crumbs: EntityCrumb[]; current?: string }) {
  if (crumbs.length === 0 && !current) return null;
  return (
    <nav aria-label="Classification" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 text-2xs text-fg-muted">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            <Link href={c.href} className="hover:text-link">
              {c.label}
            </Link>
          </li>
        ))}
        {current && (
          <li className="flex items-center gap-1 text-fg-secondary" aria-current="page">
            {crumbs.length > 0 && <span aria-hidden>›</span>}
            {current}
          </li>
        )}
      </ol>
    </nav>
  );
}
