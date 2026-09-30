import type { TimeRange } from "@/domain/time-range";

/**
 * Escala de color del heatmap: 7 tramos con neutro alrededor de 0.
 *
 * Los umbrales se escalan por periodo: +2 % en un día es un movimiento fuerte, en un año no.
 * Devuelve un tramo semántico (-3…3); el color concreto lo deciden los tokens CSS.
 */
export type HeatBucket = -3 | -2 | -1 | 0 | 1 | 2 | 3;

/** Umbrales base (1D), en fracción: |x| < 0.5 % neutro, < 1.5 % tramo 1, < 3 % tramo 2, resto tramo 3. */
export const BASE_THRESHOLDS = [0.005, 0.015, 0.03] as const;

export const RANGE_SCALE: Record<TimeRange, number> = {
  "1D": 1,
  "1W": 2,
  "1M": 3.5,
  "3M": 6,
  "6M": 8,
  YTD: 10,
  "1Y": 12,
  "3Y": 20,
  "5Y": 25,
};

export function heatThresholds(range: TimeRange): [number, number, number] {
  const scale = RANGE_SCALE[range];
  return [BASE_THRESHOLDS[0] * scale, BASE_THRESHOLDS[1] * scale, BASE_THRESHOLDS[2] * scale];
}

export function heatBucket(value: number | null | undefined, range: TimeRange): HeatBucket | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const [t1, t2, t3] = heatThresholds(range);
  const magnitude = Math.abs(value);
  const level = magnitude < t1 ? 0 : magnitude < t2 ? 1 : magnitude < t3 ? 2 : 3;
  if (level === 0) return 0;
  return (value < 0 ? -level : level) as HeatBucket;
}

/**
 * Clases de Tailwind por tramo (literales completos para que Tailwind las detecte).
 * Los colores reales viven en los tokens `--mr-heat-*` de globals.css.
 */
export const HEAT_BUCKET_CLASSES: Record<HeatBucket | "none", string> = {
  [-3]: "bg-heat-n3 text-heat-text",
  [-2]: "bg-heat-n2 text-heat-text",
  [-1]: "bg-heat-n1 text-heat-text",
  0: "bg-heat-0 text-heat-text",
  1: "bg-heat-p1 text-heat-text",
  2: "bg-heat-p2 text-heat-text",
  3: "bg-heat-p3 text-heat-text",
  none: "bg-heat-none text-fg-muted",
};

export function heatClass(value: number | null | undefined, range: TimeRange): string {
  const bucket = heatBucket(value, range);
  return HEAT_BUCKET_CLASSES[bucket ?? "none"];
}
