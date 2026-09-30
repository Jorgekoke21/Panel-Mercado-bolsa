import type { SeedTables } from "./model";

/**
 * Invariantes del seed. Si alguna falla, `build-seed` aborta y no escribe `seed.sql`.
 * Los rangos son comprobaciones de cordura del dataset S&P 500 / GICS actual, no reglas
 * del dominio (el modelo admite cualquier universo).
 */
export const SEED_EXPECTATIONS = {
  sp500Securities: { min: 495, max: 510 },
  gicsSectors: 11,
} as const;

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const dups = new Set<T>();
  for (const v of values) (seen.has(v) ? dups : seen).add(v);
  return [...dups];
}

export function validateSeedTables(t: SeedTables): string[] {
  const issues: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) issues.push(message);
  };
  const noDuplicates = (label: string, values: string[]) => {
    const d = duplicates(values);
    check(d.length === 0, `Duplicate ${label}: ${d.slice(0, 10).join(", ")}`);
  };

  const { min, max } = SEED_EXPECTATIONS.sp500Securities;
  check(
    t.index_constituents.length >= min && t.index_constituents.length <= max,
    `Expected ${min}-${max} S&P 500 constituents, got ${t.index_constituents.length}`,
  );
  check(t.sectors.length === SEED_EXPECTATIONS.gicsSectors, `Expected ${SEED_EXPECTATIONS.gicsSectors} GICS sectors, got ${t.sectors.length}`);

  noDuplicates("tickers", t.securities.map((s) => `${s.exchange_id}:${s.ticker}`));
  noDuplicates("tickers (cross-exchange)", t.securities.map((s) => s.ticker));
  noDuplicates("company slugs", t.companies.map((c) => c.slug));
  noDuplicates("company CIKs", t.companies.flatMap((c) => (c.cik ? [c.cik] : [])));
  for (const level of ["sectors", "industry_groups", "industries", "sub_industries"] as const) {
    noDuplicates(`${level} codes`, t[level].map((r) => `${r.taxonomy_code}:${r.code}`));
    noDuplicates(`${level} slugs`, t[level].map((r) => `${r.taxonomy_code}:${r.slug}`));
  }
  noDuplicates("ids", [
    ...t.datasets, ...t.exchanges, ...t.sectors, ...t.industry_groups, ...t.industries,
    ...t.sub_industries, ...t.companies, ...t.securities, ...t.indices, ...t.index_constituents, ...t.themes,
  ].map((r) => r.id));

  const securitiesByCompany = new Map<string, number>();
  const primaryByCompany = new Map<string, number>();
  for (const s of t.securities) {
    securitiesByCompany.set(s.company_id, (securitiesByCompany.get(s.company_id) ?? 0) + 1);
    if (s.is_primary) primaryByCompany.set(s.company_id, (primaryByCompany.get(s.company_id) ?? 0) + 1);
  }
  for (const c of t.companies) {
    check((securitiesByCompany.get(c.id) ?? 0) >= 1, `Company ${c.name} has no securities`);
    check(primaryByCompany.get(c.id) === 1, `Company ${c.name} must have exactly one primary security`);
    check(c.sub_industry_id !== null, `Company ${c.name} is not classified`);
  }

  const securityIds = new Set(t.securities.map((s) => s.id));
  const indexIds = new Set(t.indices.map((i) => i.id));
  for (const ic of t.index_constituents) {
    check(securityIds.has(ic.security_id), `Constituent ${ic.id} references unknown security`);
    check(indexIds.has(ic.index_id), `Constituent ${ic.id} references unknown index`);
  }
  for (const i of t.indices) {
    check(
      i.kind === "official" ? i.methodology === "provider" : i.methodology !== "provider",
      `Index ${i.code}: methodology ${i.methodology} not allowed for kind ${i.kind}`,
    );
  }
  return issues;
}
