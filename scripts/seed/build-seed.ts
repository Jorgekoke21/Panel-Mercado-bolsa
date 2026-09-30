/**
 * Genera `supabase/seed.sql` a partir de las fuentes fijadas en `data/seed/`.
 *
 *   npm run seed:build   → valida y escribe supabase/seed.sql
 *   npm run db:reset     → recrea la base local aplicando migraciones + seed
 *
 * Es determinista: mismas fuentes ⇒ mismo SQL (ids UUID v5 derivados de claves naturales).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findDataset, readManifest } from "./lib/manifest";
import { buildSeedTables, DATASET_KEYS } from "./lib/normalize";
import { parseGicsWikitext } from "./lib/parse-gics";
import { parseSp500Wikitext } from "./lib/parse-sp500";
import { readReferenceData } from "./lib/reference";
import { renderSeedSql } from "./lib/sql";
import { validateSeedTables } from "./lib/validate";

const ROOT = process.cwd();
const SEED_DIR = join(ROOT, "data", "seed");
const OUTPUT = join(ROOT, "supabase", "seed.sql");

function readVerified(file: string, sha256: string): string {
  const content = readFileSync(join(SEED_DIR, file), "utf8");
  const actual = createHash("sha256").update(content, "utf8").digest("hex");
  if (actual !== sha256) {
    throw new Error(`${file}: sha256 mismatch (manifest ${sha256}, file ${actual}). Re-run seed:fetch -- --pinned.`);
  }
  return content;
}

function main() {
  const manifest = readManifest(join(SEED_DIR, "manifest.json"));
  const sp500Dataset = findDataset(manifest, DATASET_KEYS.sp500);
  const gicsDataset = findDataset(manifest, DATASET_KEYS.gics);

  const { tables, issues } = buildSeedTables({
    sp500Dataset,
    gicsDataset,
    constituents: parseSp500Wikitext(readVerified(sp500Dataset.file, sp500Dataset.sha256)),
    gics: parseGicsWikitext(readVerified(gicsDataset.file, gicsDataset.sha256)),
    reference: readReferenceData(SEED_DIR),
  });
  const allIssues = [...issues, ...validateSeedTables(tables)];
  if (allIssues.length > 0) {
    console.error(`Seed validation failed (${allIssues.length} issues):`);
    for (const issue of allIssues) console.error(`  ✗ ${issue}`);
    process.exit(1);
  }

  const sql = renderSeedSql(tables, [
    `S&P 500 constituents: ${sp500Dataset.source} @ revision ${sp500Dataset.wikipedia?.revisionId} (${sp500Dataset.wikipedia?.revisionTimestamp})`,
    `GICS structure: ${gicsDataset.source} @ revision ${gicsDataset.wikipedia?.revisionId} (${gicsDataset.wikipedia?.revisionTimestamp})`,
    "Reference data: data/seed/reference/*.csv",
  ]);
  writeFileSync(OUTPUT, sql, "utf8");

  console.log("✓ Seed validated and written to supabase/seed.sql");
  console.log(
    `  ${tables.sectors.length} sectors · ${tables.industry_groups.length} industry groups · ` +
      `${tables.industries.length} industries · ${tables.sub_industries.length} sub-industries`,
  );
  console.log(
    `  ${tables.companies.length} companies · ${tables.securities.length} securities · ` +
      `${tables.index_constituents.length} S&P 500 constituents · ${tables.company_themes.length} theme assignments`,
  );
}

main();
