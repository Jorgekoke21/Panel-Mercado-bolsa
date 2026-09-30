import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";
import { parseFoundedYear, parseHeadquarters } from "./headquarters";
import { findDataset, readManifest } from "./manifest";
import { buildSeedTables, DATASET_KEYS } from "./normalize";
import { parseGicsWikitext } from "./parse-gics";
import { parseSp500Wikitext } from "./parse-sp500";
import { readReferenceData } from "./reference";
import { renderSeedSql, sqlLiteral } from "./sql";
import { deterministicUuid } from "./uuid";
import { validateSeedTables } from "./validate";

const SEED_DIR = join(process.cwd(), "data", "seed");

function buildFromPinnedSources() {
  const manifest = readManifest(join(SEED_DIR, "manifest.json"));
  const sp500Dataset = findDataset(manifest, DATASET_KEYS.sp500);
  const gicsDataset = findDataset(manifest, DATASET_KEYS.gics);
  return buildSeedTables({
    sp500Dataset,
    gicsDataset,
    constituents: parseSp500Wikitext(readFileSync(join(SEED_DIR, sp500Dataset.file), "utf8")),
    gics: parseGicsWikitext(readFileSync(join(SEED_DIR, gicsDataset.file), "utf8")),
    reference: readReferenceData(SEED_DIR),
  });
}

describe("seed helpers", () => {
  it("parses CSV with quotes and escaped quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: "x, y", b: 'say "hi"' }]);
  });

  it("rejects CSV rows with the wrong number of fields", () => {
    expect(() => parseCsv("a,b\n1\n")).toThrow();
  });

  it("escapes SQL literals", () => {
    expect(sqlLiteral("O'Reilly")).toBe("'O''Reilly'");
    expect(sqlLiteral(null)).toBe("null");
    expect(sqlLiteral(true)).toBe("true");
    expect(() => sqlLiteral(Number.NaN)).toThrow();
  });

  it("produces stable RFC 9562 v5 UUIDs", () => {
    const id = deterministicUuid("security:XNAS:NVDA");
    expect(id).toBe(deterministicUuid("security:XNAS:NVDA"));
    expect(id).not.toBe(deterministicUuid("security:XNYS:NVDA"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("resolves headquarters to countries", () => {
    const countries = new Map([["ireland", "IE"]]);
    expect(parseHeadquarters("Saint Paul, Minnesota", countries)).toEqual({
      kind: "resolved",
      value: { city: "Saint Paul", region: "Minnesota", countryCode: "US" },
    });
    expect(parseHeadquarters("Washington, D.C.", countries)).toMatchObject({ value: { countryCode: "US" } });
    expect(parseHeadquarters("Dublin, Ireland", countries)).toEqual({
      kind: "resolved",
      value: { city: "Dublin", region: null, countryCode: "IE" },
    });
    expect(parseHeadquarters("none", countries)).toEqual({ kind: "empty" });
    expect(parseHeadquarters("Paris, France", countries)).toEqual({ kind: "unresolved", raw: "Paris, France" });
  });

  it("parses founded years conservatively", () => {
    expect(parseFoundedYear("1902")).toBe(1902);
    expect(parseFoundedYear("2013 (1888)")).toBe(2013);
    expect(parseFoundedYear("")).toBeNull();
  });
});

describe("GICS parser", () => {
  it("builds a four-level tree from a rowspan table", () => {
    const wikitext = [
      '{| class="wikitable"',
      "|-",
      "! Sector !! Group",
      "|-",
      '| rowspan="2" | 45',
      '| rowspan="2" | Information Technology',
      '| rowspan="2" | 4530',
      '| rowspan="2" | [[Semiconductor industry|Semiconductors]] & Semiconductor Equipment',
      '| rowspan="2" | 453010',
      '| rowspan="2" | Semiconductors & Semiconductor Equipment',
      "| 45301010 || Semiconductor Materials & Equipment",
      "|-",
      "| 45301020 || Semiconductors",
      "|}",
    ].join("\n");
    const nodes = parseGicsWikitext(wikitext);
    expect(nodes.map((n) => [n.level, n.code, n.parentCode])).toEqual([
      ["sector", "45", null],
      ["industry_group", "4530", "45"],
      ["industry", "453010", "4530"],
      ["sub_industry", "45301010", "453010"],
      ["sub_industry", "45301020", "453010"],
    ]);
    expect(nodes[1]?.name).toBe("Semiconductors & Semiconductor Equipment");
  });
});

describe("seed from pinned sources", () => {
  const { tables, issues } = buildFromPinnedSources();

  it("builds without issues and passes all invariants", () => {
    expect(issues).toEqual([]);
    expect(validateSeedTables(tables)).toEqual([]);
  });

  it("contains the full GICS hierarchy", () => {
    expect(tables.sectors).toHaveLength(11);
    expect(tables.industry_groups.length).toBeGreaterThan(20);
    expect(tables.sub_industries.length).toBeGreaterThan(150);
  });

  it("groups dual-class listings into one company with one primary security", () => {
    const alphabet = tables.securities.filter((s) => s.ticker === "GOOGL" || s.ticker === "GOOG");
    expect(alphabet).toHaveLength(2);
    expect(new Set(alphabet.map((s) => s.company_id)).size).toBe(1);
    expect(alphabet.find((s) => s.is_primary)?.ticker).toBe("GOOGL");
    expect(tables.companies.length).toBe(tables.securities.length - 3);
  });

  it("keeps canonical dotted share-class tickers", () => {
    expect(tables.securities.some((s) => s.ticker === "BRK.B")).toBe(true);
  });

  it("records provenance for every constituent", () => {
    const sp500 = tables.datasets.find((d) => d.key === DATASET_KEYS.sp500);
    expect(sp500?.source_revision).toMatch(/^\d+$/);
    expect(tables.index_constituents.every((c) => c.dataset_id === sp500?.id)).toBe(true);
  });

  it("only assigns the explicitly defined example themes", () => {
    expect(tables.company_themes.every((ct) => ct.source === "manual")).toBe(true);
    expect(tables.company_themes).toHaveLength(7);
  });

  it("renders deterministic SQL", () => {
    const again = buildFromPinnedSources();
    expect(renderSeedSql(again.tables, ["h"])).toBe(renderSeedSql(tables, ["h"]));
  });
});
