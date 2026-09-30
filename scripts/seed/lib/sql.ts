import { type SeedTables, TABLE_ORDER } from "./model";

export type SqlValue = string | number | boolean | null;

export function sqlLiteral(value: SqlValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in seed: ${value}`);
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

const BATCH_SIZE = 200;

export function insertStatements(table: string, rows: readonly object[]): string {
  const first = rows[0];
  if (!first) return `-- ${table}: no rows\n`;
  const columns = Object.keys(first);
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const values = rows.slice(i, i + BATCH_SIZE).map((row) => {
      const record = row as Record<string, SqlValue>;
      const keys = Object.keys(record);
      if (keys.length !== columns.length || keys.some((k, j) => k !== columns[j])) {
        throw new Error(`${table}: inconsistent columns in seed rows`);
      }
      return `  (${columns.map((c) => sqlLiteral(record[c] ?? null)).join(", ")})`;
    });
    chunks.push(`insert into public.${table} (${columns.join(", ")}) values\n${values.join(",\n")};\n`);
  }
  return chunks.join("\n");
}

export function renderSeedSql(tables: SeedTables, header: string[]): string {
  const lines = [
    "-- ============================================================================",
    "-- GENERATED FILE — do not edit by hand. Regenerate with `npm run seed:build`.",
    ...header.map((h) => `-- ${h}`),
    "-- ============================================================================",
    "",
    "begin;",
    "",
  ];
  for (const table of TABLE_ORDER) {
    lines.push(`-- ${table} (${tables[table].length} rows)`);
    lines.push(insertStatements(table, tables[table]));
  }
  lines.push("commit;", "");
  return lines.join("\n");
}
