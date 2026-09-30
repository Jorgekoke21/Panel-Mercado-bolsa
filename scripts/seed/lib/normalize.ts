import { z } from "zod";
import { slugify } from "../../../src/lib/slug";
import { isValidTicker, normalizeTicker } from "../../../src/lib/ticker";
import { parseFoundedYear, parseHeadquarters } from "./headquarters";
import type { DatasetManifestEntry } from "./manifest";
import type {
  CompanyRow,
  CompanyThemeRow,
  DatasetRow,
  IndexConstituentRow,
  SecurityRow,
  SeedTables,
} from "./model";
import type { GicsNode } from "./parse-gics";
import type { RawConstituent } from "./parse-sp500";
import type { ReferenceData } from "./reference";
import { deterministicUuid } from "./uuid";

/**
 * Adaptador de la fuente "Wikipedia S&P 500": qué plantilla de símbolo corresponde a qué
 * bolsa (MIC). Es conocimiento del dataset, no del dominio.
 */
export const SYMBOL_TEMPLATE_TO_MIC: Readonly<Record<string, string>> = {
  NyseSymbol: "XNYS",
  NasdaqSymbol: "XNAS",
  "BZX link": "BATS",
};

export const GICS_TAXONOMY = {
  code: "GICS",
  name: "Global Industry Classification Standard",
  publisher: "MSCI and S&P Dow Jones Indices",
} as const;

export const SP500_INDEX_CODE = "SPX";

export const DATASET_KEYS = {
  sp500: "wikipedia-sp500-constituents",
  gics: "wikipedia-gics-structure",
  reference: "marketradar-reference",
} as const;

export interface SeedInputs {
  sp500Dataset: DatasetManifestEntry;
  gicsDataset: DatasetManifestEntry;
  constituents: RawConstituent[];
  gics: GicsNode[];
  reference: ReferenceData;
}

export interface SeedBuildResult {
  tables: SeedTables;
  issues: string[];
}

const rawConstituentSchema = z.object({
  ticker: z.string().min(1),
  symbolTemplate: z.string().min(1),
  securityName: z.string().min(1),
  sectorName: z.string().min(1),
  subIndustryName: z.string().min(1),
  headquarters: z.string(),
  dateAdded: z.iso.date(),
  cik: z.string().regex(/^\d{10}$/),
  founded: z.string(),
});

const CLASS_SUFFIX = /\s*\(Class ([A-Z])\)\s*$/;

const normalizeName = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

function manifestToDatasetRow(entry: DatasetManifestEntry): DatasetRow {
  return {
    id: deterministicUuid(`dataset:${entry.key}`),
    key: entry.key,
    name: entry.name,
    source: entry.source,
    source_url: entry.sourceUrl,
    license: entry.license,
    is_secondary_source: entry.isSecondarySource,
    source_revision: entry.wikipedia ? String(entry.wikipedia.revisionId) : null,
    source_revision_at: entry.wikipedia?.revisionTimestamp ?? null,
    sha256: entry.sha256,
    retrieved_at: entry.retrievedAt,
    effective_date: entry.effectiveDate,
    notes: entry.notes ?? null,
  };
}

export function buildSeedTables(inputs: SeedInputs): SeedBuildResult {
  const issues: string[] = [];
  const { reference } = inputs;

  // --- Datasets (procedencia) -------------------------------------------------------------
  const sp500Dataset = manifestToDatasetRow(inputs.sp500Dataset);
  const gicsDataset = manifestToDatasetRow(inputs.gicsDataset);
  const referenceDataset: DatasetRow = {
    id: deterministicUuid(`dataset:${DATASET_KEYS.reference}`),
    key: DATASET_KEYS.reference,
    name: "MarketRadar reference data",
    source: "MarketRadar (hand-maintained CSV files in data/seed/reference)",
    source_url: null,
    license: null,
    is_secondary_source: false,
    source_revision: null,
    source_revision_at: null,
    sha256: null,
    retrieved_at: null,
    effective_date: null,
    notes: "Countries (ISO 3166), exchanges (ISO 10383 MIC), index catalogue and explicitly defined example themes.",
  };

  // --- Geografía y bolsas -----------------------------------------------------------------
  const countries = reference.countries.map((c) => ({ ...c }));
  const countryCodeByName = new Map(countries.map((c) => [c.name.toLowerCase(), c.code]));
  const exchanges = reference.exchanges.map((e) => ({
    id: deterministicUuid(`exchange:${e.mic}`),
    ...e,
    dataset_id: referenceDataset.id,
  }));
  const exchangeByMic = new Map(exchanges.map((e) => [e.mic, e]));
  for (const e of exchanges) {
    if (!countries.some((c) => c.code === e.country_code)) issues.push(`Exchange ${e.mic}: unknown country ${e.country_code}`);
  }

  // --- Taxonomía GICS -----------------------------------------------------------------------
  const tax = GICS_TAXONOMY.code;
  const idFor = (level: string, code: string) => deterministicUuid(`${level}:${tax}:${code}`);
  const nodesOf = (level: GicsNode["level"]) => inputs.gics.filter((n) => n.level === level);

  const sectors = nodesOf("sector").map((n, i) => ({
    id: idFor("sector", n.code),
    taxonomy_code: tax,
    code: n.code,
    name: n.name,
    slug: slugify(n.name),
    sort_order: i + 1,
  }));
  const industryGroups = nodesOf("industry_group").map((n) => ({
    id: idFor("industry_group", n.code),
    taxonomy_code: tax,
    sector_id: idFor("sector", n.parentCode ?? ""),
    code: n.code,
    name: n.name,
    slug: slugify(n.name),
  }));
  const industries = nodesOf("industry").map((n) => ({
    id: idFor("industry", n.code),
    taxonomy_code: tax,
    industry_group_id: idFor("industry_group", n.parentCode ?? ""),
    code: n.code,
    name: n.name,
    slug: slugify(n.name),
  }));
  const subIndustries = nodesOf("sub_industry").map((n) => ({
    id: idFor("sub_industry", n.code),
    taxonomy_code: tax,
    industry_id: idFor("industry", n.parentCode ?? ""),
    code: n.code,
    name: n.name,
    slug: slugify(n.name),
  }));
  const sectorByName = new Map(nodesOf("sector").map((n) => [normalizeName(n.name), n]));
  const subIndustryByName = new Map(nodesOf("sub_industry").map((n) => [normalizeName(n.name), n]));

  // --- Componentes del S&P 500 → companies + securities -----------------------------------
  const constituents = inputs.constituents.flatMap((raw, i) => {
    const parsed = rawConstituentSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(`Constituent row ${i + 1} (${raw.ticker}): ${parsed.error.message}`);
      return [];
    }
    return [parsed.data];
  });

  const byCik = new Map<string, typeof constituents>();
  for (const c of constituents) byCik.set(c.cik, [...(byCik.get(c.cik) ?? []), c]);

  const companies: CompanyRow[] = [];
  const securities: SecurityRow[] = [];
  const indexConstituents: IndexConstituentRow[] = [];
  const spx = reference.indices.find((ix) => ix.code === SP500_INDEX_CODE);
  if (!spx) issues.push(`Index ${SP500_INDEX_CODE} missing from reference/indices.csv`);
  const spxId = deterministicUuid(`index:${SP500_INDEX_CODE}`);

  for (const [cik, listings] of [...byCik.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = listings[0];
    if (!first) continue;
    const companyId = deterministicUuid(`company:cik:${cik}`);
    const companyName = first.securityName.replace(CLASS_SUFFIX, "").trim();

    for (const l of listings) {
      if (l.securityName.replace(CLASS_SUFFIX, "").trim() !== companyName) {
        issues.push(`CIK ${cik}: inconsistent issuer names "${companyName}" / "${l.securityName}"`);
      }
      if (l.subIndustryName !== first.subIndustryName) issues.push(`CIK ${cik}: listings disagree on sub-industry`);
    }

    const sub = subIndustryByName.get(normalizeName(first.subIndustryName));
    const sector = sectorByName.get(normalizeName(first.sectorName));
    if (!sub) issues.push(`${first.ticker}: sub-industry "${first.subIndustryName}" not found in GICS structure`);
    if (!sector) issues.push(`${first.ticker}: sector "${first.sectorName}" not found in GICS structure`);
    if (sub && sector && !sub.code.startsWith(sector.code)) {
      issues.push(`${first.ticker}: sub-industry ${sub.code} does not belong to sector ${sector.code}`);
    }

    const hq = parseHeadquarters(first.headquarters, countryCodeByName);
    if (hq.kind === "unresolved") issues.push(`${first.ticker}: cannot resolve headquarters "${hq.raw}"`);
    const hqValue = hq.kind === "resolved" ? hq.value : null;

    companies.push({
      id: companyId,
      name: companyName,
      slug: slugify(companyName),
      cik,
      sub_industry_id: sub ? idFor("sub_industry", sub.code) : null,
      hq_city: hqValue?.city ?? null,
      hq_region: hqValue?.region ?? null,
      hq_country_code: hqValue?.countryCode ?? null,
      founded_year: parseFoundedYear(first.founded),
      dataset_id: sp500Dataset.id,
    });

    // Valor principal: la clase A si hay varias clases; si no, el único valor.
    const ordered = [...listings].sort((a, b) =>
      (CLASS_SUFFIX.exec(a.securityName)?.[1] ?? "").localeCompare(CLASS_SUFFIX.exec(b.securityName)?.[1] ?? ""),
    );
    ordered.forEach((l, index) => {
      const ticker = normalizeTicker(l.ticker);
      if (!isValidTicker(ticker)) issues.push(`Invalid ticker "${l.ticker}"`);
      const mic = SYMBOL_TEMPLATE_TO_MIC[l.symbolTemplate];
      const exchange = mic ? exchangeByMic.get(mic) : undefined;
      if (!exchange) {
        issues.push(`${ticker}: unknown exchange for symbol template "${l.symbolTemplate}"`);
        return;
      }
      const securityId = deterministicUuid(`security:${exchange.mic}:${ticker}`);
      securities.push({
        id: securityId,
        company_id: companyId,
        exchange_id: exchange.id,
        ticker,
        name: l.securityName,
        currency: exchange.currency,
        share_class: CLASS_SUFFIX.exec(l.securityName)?.[1] ?? null,
        security_type: "common_stock",
        is_primary: index === 0,
        dataset_id: sp500Dataset.id,
      });
      indexConstituents.push({
        id: deterministicUuid(`index-constituent:${SP500_INDEX_CODE}:${exchange.mic}:${ticker}`),
        index_id: spxId,
        security_id: securityId,
        added_on: l.dateAdded,
        dataset_id: sp500Dataset.id,
      });
    });
  }

  // --- Índices ------------------------------------------------------------------------------
  const indices = reference.indices.map((ix) => ({
    id: deterministicUuid(`index:${ix.code}`),
    ...ix,
    dataset_id: referenceDataset.id,
  }));

  // --- Temas (solo los ejemplos definidos explícitamente) ----------------------------------
  const themes = reference.themes.map((t) => ({ id: deterministicUuid(`theme:${t.slug}`), ...t }));
  const themeBySlug = new Map(themes.map((t) => [t.slug, t]));
  const companyByTicker = new Map(securities.map((s) => [s.ticker, s.company_id]));
  const companyThemes: CompanyThemeRow[] = reference.companyThemes.flatMap((ct) => {
    const companyId = companyByTicker.get(normalizeTicker(ct.ticker));
    const theme = themeBySlug.get(ct.theme_slug);
    if (!companyId) issues.push(`company_themes: ticker ${ct.ticker} not in universe`);
    if (!theme) issues.push(`company_themes: theme ${ct.theme_slug} not defined`);
    if (!companyId || !theme) return [];
    return [{
      company_id: companyId,
      theme_id: theme.id,
      source: ct.source,
      confidence: null,
      note: ct.note,
      dataset_id: referenceDataset.id,
    }];
  });

  return {
    tables: {
      datasets: [sp500Dataset, gicsDataset, referenceDataset],
      countries,
      exchanges,
      taxonomies: [{ ...GICS_TAXONOMY, dataset_id: gicsDataset.id }],
      sectors,
      industry_groups: industryGroups,
      industries,
      sub_industries: subIndustries,
      companies,
      securities,
      indices,
      index_constituents: indexConstituents,
      themes,
      company_themes: companyThemes,
    },
    issues,
  };
}
