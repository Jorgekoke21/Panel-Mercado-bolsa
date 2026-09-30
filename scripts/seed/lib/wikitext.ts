/**
 * Utilidades mínimas para leer tablas de wikitext de MediaWiki.
 *
 * No es un parser completo de MediaWiki: cubre lo necesario para las tablas que usamos
 * (celdas separadas por `||` o por saltos de línea con `|`, atributos `rowspan=… |`,
 * enlaces `[[…]]`, plantillas `{{…}}`, comentarios y notas `<ref>`).
 */

export function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export function stripRefs(text: string): string {
  return text.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

/** `[[Destino|Texto]]` → `Texto`, `[[Destino]]` → `Destino`. */
export function stripLinks(text: string): string {
  return text.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
}

export function cleanCellText(text: string): string {
  return stripLinks(text).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Divide `text` por `separator` ignorando separadores dentro de `[[ ]]` y `{{ }}`. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      current += two;
      i++;
      continue;
    }
    if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      current += two;
      i++;
      continue;
    }
    if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length - 1;
      continue;
    }
    current += text[i];
  }
  parts.push(current);
  return parts;
}

/** Elimina el prefijo de atributos de una celda (`rowspan="2" | valor` → `valor`). */
export function stripCellAttributes(cell: string): string {
  const parts = splitTopLevel(cell, "|");
  if (parts.length >= 2 && /^\s*[a-z-]+\s*=/i.test(parts[0] ?? "")) {
    return parts.slice(1).join("|");
  }
  return cell;
}

/** Extrae el cuerpo de la primera tabla `{| … |}` cuya línea de apertura contiene `marker`. */
export function extractTable(wikitext: string, marker?: string): string {
  let searchFrom = 0;
  while (true) {
    const start = wikitext.indexOf("{|", searchFrom);
    if (start === -1) throw new Error(`Table not found${marker ? ` (marker: ${marker})` : ""}`);
    const lineEnd = wikitext.indexOf("\n", start);
    const header = wikitext.slice(start, lineEnd === -1 ? undefined : lineEnd);
    const end = wikitext.indexOf("\n|}", start);
    if (end === -1) throw new Error("Unterminated table");
    if (!marker || header.includes(marker)) return wikitext.slice(lineEnd + 1, end);
    searchFrom = end + 3;
  }
}

/**
 * Devuelve las filas de datos de una tabla como listas de celdas en bruto (con plantillas
 * y enlaces aún presentes, sin atributos). Las filas de cabecera (`!`) se descartan.
 */
export function parseTableRows(tableBody: string): string[][] {
  const body = stripRefs(stripComments(tableBody));
  const rows: string[][] = [];
  for (const rawRow of body.split(/\n\|-[^\n]*/)) {
    const cells: string[] = [];
    let isHeader = false;
    for (const line of rawRow.split("\n")) {
      if (line.startsWith("!")) {
        isHeader = true;
        continue;
      }
      if (line.startsWith("|+") || line.startsWith("|}") || line.startsWith("|-")) continue;
      if (line.startsWith("|")) {
        const content = line.startsWith("||") ? line.slice(2) : line.slice(1);
        for (const cell of splitTopLevel(content, "||")) cells.push(stripCellAttributes(cell).trim());
      } else if (cells.length > 0 && line.trim() !== "") {
        cells[cells.length - 1] = `${cells[cells.length - 1]} ${line.trim()}`;
      }
    }
    if (!isHeader && cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** `{{NyseSymbol|MMM}}` → `{ name: "NyseSymbol", args: ["MMM"] }`. */
export function parseTemplate(text: string): { name: string; args: string[] } | null {
  const match = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(text);
  if (!match?.[1]) return null;
  const [name, ...args] = splitTopLevel(match[1], "|").map((p) => p.trim());
  if (!name) return null;
  return { name, args };
}
