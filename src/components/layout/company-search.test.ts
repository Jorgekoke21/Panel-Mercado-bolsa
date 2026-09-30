import { searchEntries } from "./company-search";

const entries = [
  { ticker: "NVDA", name: "Nvidia", sector: "Information Technology", exchange: "Nasdaq" },
  { ticker: "NVR", name: "NVR, Inc.", sector: "Consumer Discretionary", exchange: "NYSE" },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Information Technology", exchange: "Nasdaq" },
  { ticker: "V", name: "Visa Inc.", sector: "Financials", exchange: "NYSE" },
];

describe("searchEntries", () => {
  it("ranks exact ticker, then ticker prefix, then name matches", () => {
    // "V" es ticker exacto; el resto solo contiene "v" en el nombre (orden alfabético por ticker).
    expect(searchEntries(entries, "v").map((e) => e.ticker)).toEqual(["V", "AMD", "NVDA", "NVR"]);
    expect(searchEntries(entries, "nv").map((e) => e.ticker)).toEqual(["NVDA", "NVR"]);
    expect(searchEntries(entries, "micro").map((e) => e.ticker)).toEqual(["AMD"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchEntries(entries, "  ")).toEqual([]);
  });
});
