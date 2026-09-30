/**
 * Descarga las fuentes externas del seed y actualiza `data/seed/manifest.json`.
 *
 *   npm run seed:fetch              → última revisión de cada página (nueva instantánea)
 *   npm run seed:fetch -- --pinned  → vuelve a descargar exactamente las revisiones del manifiesto
 *
 * Solo se ejecuta a mano. La app nunca descarga estas fuentes en tiempo de ejecución.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type DatasetManifestEntry, manifestSchema, readManifest } from "./lib/manifest";

const SEED_DIR = join(process.cwd(), "data", "seed");
const MANIFEST_PATH = join(SEED_DIR, "manifest.json");
const USER_AGENT = "MarketRadar/0.1 (personal market research tool; seed snapshot script)";
const API = "https://en.wikipedia.org/w/api.php";

interface WikipediaSource {
  key: string;
  name: string;
  pageTitle: string;
  file: string;
  notes: string;
}

const WIKIPEDIA_SOURCES: WikipediaSource[] = [
  {
    key: "wikipedia-sp500-constituents",
    name: "S&P 500 constituents",
    pageTitle: "List of S&P 500 companies",
    file: "raw/wikipedia-sp500-constituents.wikitext",
    notes:
      "Composition as documented on Wikipedia at the pinned revision. Not an official S&P Dow Jones Indices file; " +
      "there is no official effective date. Point-in-time membership before this snapshot is NOT represented.",
  },
  {
    key: "wikipedia-gics-structure",
    name: "GICS structure (sector / industry group / industry / sub-industry)",
    pageTitle: "Global Industry Classification Standard",
    file: "raw/wikipedia-gics-structure.wikitext",
    notes:
      "Secondary source used because MSCI blocks automated downloads of the official structure file. " +
      "Validated against the S&P 500 sub-industries at build time. Replace with the official MSCI file when available.",
  },
];

interface ParseResponse {
  parse: { title: string; revid: number; wikitext: string };
}
interface RevisionResponse {
  query: { pages: { revisions?: { revid: number; timestamp: string }[] }[] };
}

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
}

async function fetchWikipedia(source: WikipediaSource, pinnedRevision?: number): Promise<DatasetManifestEntry> {
  const parsed = await getJson<ParseResponse>({
    action: "parse",
    prop: "wikitext|revid",
    ...(pinnedRevision ? { oldid: String(pinnedRevision) } : { page: source.pageTitle }),
  });
  const { revid, wikitext } = parsed.parse;
  const revision = await getJson<RevisionResponse>({
    action: "query",
    prop: "revisions",
    revids: String(revid),
    rvprop: "ids|timestamp",
  });
  const timestamp = revision.query.pages[0]?.revisions?.[0]?.timestamp;
  if (!timestamp) throw new Error(`No timestamp for revision ${revid}`);

  const path = join(SEED_DIR, source.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wikitext, "utf8");

  return {
    key: source.key,
    name: source.name,
    source: `Wikipedia — ${source.pageTitle}`,
    sourceUrl: `https://en.wikipedia.org/w/index.php?oldid=${revid}`,
    license: "CC BY-SA 4.0",
    isSecondarySource: true,
    file: source.file,
    sha256: createHash("sha256").update(wikitext, "utf8").digest("hex"),
    retrievedAt: new Date().toISOString(),
    effectiveDate: null,
    wikipedia: { pageTitle: source.pageTitle, revisionId: revid, revisionTimestamp: timestamp },
    notes: source.notes,
  };
}

async function main() {
  const pinned = process.argv.includes("--pinned");
  const previous = existsSync(MANIFEST_PATH) ? readManifest(MANIFEST_PATH) : null;
  if (pinned && !previous) throw new Error("--pinned requires an existing manifest");

  const fetched: DatasetManifestEntry[] = [];
  for (const source of WIKIPEDIA_SOURCES) {
    const pinnedRevision = pinned
      ? previous?.datasets.find((d) => d.key === source.key)?.wikipedia?.revisionId
      : undefined;
    const entry = await fetchWikipedia(source, pinnedRevision);
    console.log(`✓ ${entry.key} @ revision ${entry.wikipedia?.revisionId} (${entry.wikipedia?.revisionTimestamp})`);
    fetched.push(entry);
  }

  // Los datasets no descargados por este script (p. ej. referencia manual) se conservan.
  const kept = previous?.datasets.filter((d) => !fetched.some((f) => f.key === d.key)) ?? [];
  const manifest = manifestSchema.parse({ schemaVersion: 1, datasets: [...fetched, ...kept] });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest written: ${MANIFEST_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
