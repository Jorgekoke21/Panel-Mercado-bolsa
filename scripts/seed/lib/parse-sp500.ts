import { cleanCellText, extractTable, parseTableRows, parseTemplate } from "./wikitext";

/** Fila del listado de componentes tal como aparece en la fuente, sin normalizar. */
export interface RawConstituent {
  ticker: string;
  /** Nombre de la plantilla de símbolo (identifica la bolsa en la fuente). */
  symbolTemplate: string;
  securityName: string;
  sectorName: string;
  subIndustryName: string;
  headquarters: string;
  dateAdded: string;
  cik: string;
  founded: string;
}

const CONSTITUENTS_TABLE_MARKER = 'id="constituents"';
const EXPECTED_COLUMNS = 8;

export function parseSp500Wikitext(wikitext: string): RawConstituent[] {
  const rows = parseTableRows(extractTable(wikitext, CONSTITUENTS_TABLE_MARKER));
  return rows.map((cells, index) => {
    if (cells.length !== EXPECTED_COLUMNS) {
      throw new Error(`Row ${index + 1}: expected ${EXPECTED_COLUMNS} cells, got ${cells.length}: ${cells.join(" | ")}`);
    }
    const [symbol, name, sector, subIndustry, hq, added, cik, founded] = cells as [
      string, string, string, string, string, string, string, string,
    ];
    const template = parseTemplate(symbol);
    if (!template?.args[0]) throw new Error(`Row ${index + 1}: cannot read symbol template from "${symbol}"`);
    return {
      ticker: template.args[0].trim(),
      symbolTemplate: template.name,
      securityName: cleanCellText(name),
      sectorName: cleanCellText(sector),
      subIndustryName: cleanCellText(subIndustry),
      headquarters: cleanCellText(hq),
      dateAdded: cleanCellText(added),
      cik: cleanCellText(cik),
      founded: cleanCellText(founded),
    };
  });
}
