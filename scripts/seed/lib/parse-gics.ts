import { cleanCellText, extractTable, parseTableRows } from "./wikitext";

export type GicsLevel = "sector" | "industry_group" | "industry" | "sub_industry";

export interface GicsNode {
  level: GicsLevel;
  code: string;
  name: string;
  /** Código del nivel padre (null para sectores). */
  parentCode: string | null;
}

const LEVEL_BY_CODE_LENGTH: Record<number, GicsLevel> = {
  2: "sector",
  4: "industry_group",
  6: "industry",
  8: "sub_industry",
};

/**
 * Lee la tabla de estructura GICS (sector 2 dígitos, grupo 4, industria 6, sub-industria 8).
 *
 * La tabla usa `rowspan`, así que en lugar de reconstruir la rejilla se recorren las celdas
 * en orden: cada celda con un código numérico va seguida de la celda con su nombre, y el
 * padre se deduce del prefijo del código.
 */
export function parseGicsWikitext(wikitext: string): GicsNode[] {
  const cells = parseTableRows(extractTable(wikitext, "wikitable")).flat().map(cleanCellText);
  const nodes: GicsNode[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < cells.length; i++) {
    const code = cells[i] ?? "";
    const level = /^\d+$/.test(code) ? LEVEL_BY_CODE_LENGTH[code.length] : undefined;
    if (!level) continue;
    const name = cells[i + 1];
    if (!name || /^\d+$/.test(name)) throw new Error(`GICS code ${code} has no name`);
    if (seen.has(code)) throw new Error(`Duplicate GICS code ${code}`);
    seen.add(code);
    nodes.push({ level, code, name, parentCode: code.length === 2 ? null : code.slice(0, code.length - 2) });
    i++;
  }

  for (const node of nodes) {
    if (node.parentCode && !seen.has(node.parentCode)) {
      throw new Error(`GICS code ${node.code} references missing parent ${node.parentCode}`);
    }
  }
  return nodes;
}
