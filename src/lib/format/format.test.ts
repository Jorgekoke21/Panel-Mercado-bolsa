import {
  directionOf,
  EMPTY_VALUE,
  formatCompact,
  formatDate,
  formatInteger,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRatio,
} from "./index";

describe("format", () => {
  it("renders the empty marker for missing values", () => {
    for (const fn of [formatNumber, formatInteger, formatRatio]) {
      expect(fn(null)).toBe(EMPTY_VALUE);
      expect(fn(undefined)).toBe(EMPTY_VALUE);
      expect(fn(Number.NaN)).toBe(EMPTY_VALUE);
    }
    expect(formatPercent(null)).toBe(EMPTY_VALUE);
    expect(formatPrice(Number.POSITIVE_INFINITY, "USD", "en")).toBe(EMPTY_VALUE);
    expect(formatDate("not-a-date")).toBe(EMPTY_VALUE);
  });

  it("formats signed percentages with explicit sign and true minus", () => {
    expect(formatPercent(0.01234, {}, "en")).toBe("+1.23%");
    expect(formatPercent(-0.0567, {}, "en")).toBe("−5.67%");
    expect(formatPercent(0, {}, "en")).toBe("0.00%");
    expect(formatPercent(0.5, { signed: false, digits: 0 }, "en")).toBe("50%");
    expect(formatPercent(0.124, { digits: 1 }, "es")).toContain("12,4");
    expect(formatPercent(0.124, { digits: 1 }, "es")).toContain("%");
  });

  it("formats prices using the data currency", () => {
    expect(formatPrice(1234.5, "USD", "en")).toBe("$1,234.50");
    expect(formatPrice(1234.5, "EUR", "en")).toBe("€1,234.50");
    expect(formatPrice(0.12345, "USD", "en")).toBe("$0.1235");
    expect(formatPrice(12, null, "en")).toBe("12.00");
  });

  it("formats compact magnitudes", () => {
    expect(formatCompact(1_234_000_000_000, "USD", "en")).toBe("$1.23T");
    expect(formatCompact(45_600_000, null, "en")).toBe("45.6M");
  });

  it("formats dates in UTC", () => {
    expect(formatDate("2026-09-25", "es")).toBe("25/09/2026");
    expect(formatDate("2026-09-25", "en")).toBe("09/25/2026");
  });

  it("formats numbers and currency with the selected locale", () => {
    expect(formatNumber(1234.56, 2, "es")).toBe("1.234,56");
    expect(formatNumber(1234.56, 2, "en")).toBe("1,234.56");
    expect(formatPrice(1234.5, "USD", "en")).toBe("$1,234.50");
    expect(formatPrice(1234.5, "USD", "es")).toContain("1.234,50");
  });

  it("derives direction independently of colour", () => {
    expect(directionOf(0.1)).toBe("up");
    expect(directionOf(-0.1)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null)).toBe("none");
  });
});
