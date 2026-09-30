import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EODHD_LINE_ITEM_MAP } from "@/providers/eodhd/mappers";
import { CANONICAL_LINE_ITEMS } from "./fundamentals";

describe("canonical line items", () => {
  const sql = ["20260929000700_market_data.sql", "20260929000800_derived_fundamentals.sql", "20260929000900_sec_fundamentals.sql"]
    .map((file) => readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"))
    .join("\n");

  it("the database catalog (migrations 0007–0009) matches the domain catalog", () => {
    for (const item of CANONICAL_LINE_ITEMS) {
      expect(sql).toContain(`('${item.code}', '${item.statement}', '${item.label}', '${item.unit}', '${item.nature}'`);
    }
    const inserted = sql.match(/^\s+\('[a-z_]+', '(income|balance|cash_flow)'/gm) ?? [];
    expect(inserted).toHaveLength(CANONICAL_LINE_ITEMS.length);
  });

  it("every canonical line item has an explicit EODHD mapping (possibly empty = MISSING)", () => {
    expect(Object.keys(EODHD_LINE_ITEM_MAP).sort()).toEqual(CANONICAL_LINE_ITEMS.map((i) => i.code).sort());
  });
});
