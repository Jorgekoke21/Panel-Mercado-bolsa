import {
  cleanCellText,
  extractTable,
  parseTableRows,
  parseTemplate,
  splitTopLevel,
  stripCellAttributes,
} from "./wikitext";

describe("wikitext", () => {
  it("strips links keeping the display text", () => {
    expect(cleanCellText("[[AMD|Advanced Micro Devices]]")).toBe("Advanced Micro Devices");
    expect(cleanCellText("[[Milwaukee]], Wisconsin ")).toBe("Milwaukee, Wisconsin");
  });

  it("splits only at top level", () => {
    expect(splitTopLevel("{{A|B}}||[[c|d]]||e", "||")).toEqual(["{{A|B}}", "[[c|d]]", "e"]);
  });

  it("removes cell attributes but not template pipes", () => {
    expect(stripCellAttributes('rowspan="7" | Energy')).toBe(" Energy");
    expect(stripCellAttributes("{{NyseSymbol|MMM}}")).toBe("{{NyseSymbol|MMM}}");
  });

  it("parses templates", () => {
    expect(parseTemplate("{{NyseSymbol|BRK.B}}")).toEqual({ name: "NyseSymbol", args: ["BRK.B"] });
    expect(parseTemplate("{{BZX link|CBOE}}")).toEqual({ name: "BZX link", args: ["CBOE"] });
    expect(parseTemplate("plain")).toBeNull();
  });

  it("extracts a table by marker and parses rows with mixed separators, comments and refs", () => {
    const wikitext = [
      "intro",
      '{| class="wikitable" id="other"',
      "|-",
      "| x",
      "|}",
      '{| class="wikitable" id="constituents"',
      "|-",
      "! Symbol !! Name",
      "|-",
      "|| {{NyseSymbol|BRK.B}} <!-- do not change -->",
      "|| [[Berkshire Hathaway]]<ref name=a>{{cite|x=1}}</ref>",
      "|| 0001067983",
      "|1839",
      "|-",
      "| {{NasdaqSymbol|AAPL}} || [[Apple Inc.]] || 0000320193 || 1976",
      "|}",
    ].join("\n");
    const rows = parseTableRows(extractTable(wikitext, 'id="constituents"'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["{{NyseSymbol|BRK.B}}", "[[Berkshire Hathaway]]", "0001067983", "1839"]);
    expect(rows[1]).toEqual(["{{NasdaqSymbol|AAPL}}", "[[Apple Inc.]]", "0000320193", "1976"]);
  });

  it("throws when the table is missing", () => {
    expect(() => extractTable("no tables", "x")).toThrow();
  });
});
