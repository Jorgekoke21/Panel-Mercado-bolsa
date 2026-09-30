import { isStale } from "@/domain/provenance";
import { parseTimeRange } from "@/domain/time-range";
import { isValidSlug, slugify } from "./slug";
import { companyPath, isValidTicker, normalizeTicker, parseTickerParam } from "./ticker";

describe("ticker", () => {
  it("normalizes user and provider variants to the canonical form", () => {
    expect(normalizeTicker(" nvda ")).toBe("NVDA");
    expect(normalizeTicker("brk-b")).toBe("BRK.B");
    expect(normalizeTicker("BRK/B")).toBe("BRK.B");
    expect(normalizeTicker("BF.B")).toBe("BF.B");
  });

  it("validates tickers", () => {
    expect(isValidTicker("BRK.B")).toBe(true);
    expect(isValidTicker("")).toBe(false);
    expect(isValidTicker("NV DA")).toBe(false);
    expect(isValidTicker("A".repeat(16))).toBe(false);
  });

  it("parses URL params safely", () => {
    expect(parseTickerParam("nvda")).toBe("NVDA");
    expect(parseTickerParam("BRK.B")).toBe("BRK.B");
    expect(parseTickerParam("%E0%A4%A")).toBeNull();
    expect(parseTickerParam("<script>")).toBeNull();
  });

  it("builds company paths", () => {
    expect(companyPath("NVDA")).toBe("/company/NVDA");
    expect(companyPath("BRK.B", "peers")).toBe("/company/BRK.B/peers");
  });
});

describe("slug", () => {
  it("slugifies classification names", () => {
    expect(slugify("Semiconductors & Semiconductor Equipment")).toBe("semiconductors-semiconductor-equipment");
    expect(slugify("Hotels, Resorts & Cruise Lines")).toBe("hotels-resorts-cruise-lines");
    expect(slugify("Nestlé")).toBe("nestle");
    expect(isValidSlug("information-technology")).toBe(true);
    expect(isValidSlug("Bad Slug")).toBe(false);
  });
});

describe("time range", () => {
  it("parses search params with a fallback", () => {
    expect(parseTimeRange("YTD")).toBe("YTD");
    expect(parseTimeRange(["1M", "1Y"])).toBe("1M");
    expect(parseTimeRange("2W")).toBe("1D");
    expect(parseTimeRange(undefined, "1W")).toBe("1W");
  });
});

describe("provenance staleness", () => {
  const base = { source: "x", sourceLabel: "X", isDelayed: true, isDemo: false };
  const now = new Date("2026-09-29T12:00:00Z");

  it("flags old real data as stale", () => {
    expect(isStale({ ...base, asOf: "2026-09-25T20:00:00Z" }, now)).toBe(true);
    expect(isStale({ ...base, asOf: "2026-09-29T08:00:00Z" }, now)).toBe(false);
    expect(isStale({ ...base, asOf: "garbage" }, now)).toBe(true);
  });

  it("never flags demo data as stale (it is labelled DEMO instead)", () => {
    expect(isStale({ ...base, isDemo: true, asOf: "2000-01-01T00:00:00Z" }, now)).toBe(false);
  });
});
