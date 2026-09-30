/** Periodos globales de MarketRadar (D13). 1W = 5 sesiones. */
export const TIME_RANGES = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;

export type TimeRange = (typeof TIME_RANGES)[number];

export const DEFAULT_TIME_RANGE: TimeRange = "1D";

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  YTD: "Year to date",
  "1Y": "1 year",
  "3Y": "3 years",
  "5Y": "5 years",
};

export function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === "string" && (TIME_RANGES as readonly string[]).includes(value);
}

export function parseTimeRange(value: unknown, fallback: TimeRange = DEFAULT_TIME_RANGE): TimeRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isTimeRange(candidate) ? candidate : fallback;
}
