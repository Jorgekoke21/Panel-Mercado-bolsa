import { readFileSync } from "node:fs";
import type { z } from "zod";

/** Parser CSV mínimo (RFC 4180: comillas dobles y comillas escapadas ""). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (!header) return [];
  return data.map((cells, index) => {
    if (cells.length !== header.length) {
      throw new Error(`CSV row ${index + 2}: expected ${header.length} fields, got ${cells.length}`);
    }
    return Object.fromEntries(header.map((key, i) => [key.trim(), (cells[i] ?? "").trim()]));
  });
}

export function readCsv<T extends z.ZodType>(path: string, schema: T): z.infer<T>[] {
  return parseCsv(readFileSync(path, "utf8")).map((row, index) => {
    const result = schema.safeParse(row);
    if (!result.success) throw new Error(`${path} row ${index + 2}: ${result.error.message}`);
    return result.data;
  });
}
