import type { BreadthStats } from "@/domain/breadth";

export interface BreadthInput {
  /** Rendimiento del periodo (fracción). */
  return: number | null;
  price: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  isNew52wHigh: boolean;
  isNew52wLow: boolean;
}

/** |rendimiento| por debajo de este umbral cuenta como "sin cambios" (ruido de coma flotante). */
export const UNCHANGED_EPSILON = 1e-9;

const isNumber = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value);

function pctAbove(members: readonly BreadthInput[], key: "ema20" | "ema50" | "ema200") {
  let above = 0;
  let coverage = 0;
  for (const m of members) {
    const level = m[key];
    if (isNumber(m.price) && isNumber(level)) {
      coverage++;
      if (m.price > level) above++;
    }
  }
  return { pct: coverage > 0 ? above / coverage : null, coverage };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function computeBreadth(members: readonly BreadthInput[]): BreadthStats {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let rsiSum = 0;
  let rsiCoverage = 0;
  const rsiValues: number[] = [];
  let new52wHighs = 0;
  let new52wLows = 0;

  for (const m of members) {
    if (isNumber(m.return)) {
      if (m.return > UNCHANGED_EPSILON) advancers++;
      else if (m.return < -UNCHANGED_EPSILON) decliners++;
      else unchanged++;
    }
    if (isNumber(m.rsi14)) {
      rsiSum += m.rsi14;
      rsiCoverage++;
      rsiValues.push(m.rsi14);
    }
    if (m.isNew52wHigh) new52wHighs++;
    if (m.isNew52wLow) new52wLows++;
  }

  const returnCoverage = advancers + decliners + unchanged;
  const ema20 = pctAbove(members, "ema20");
  const ema50 = pctAbove(members, "ema50");
  const ema200 = pctAbove(members, "ema200");

  return {
    total: members.length,
    advancers,
    decliners,
    unchanged,
    returnCoverage,
    pctPositive: returnCoverage > 0 ? advancers / returnCoverage : null,
    pctAboveEma20: ema20.pct,
    pctAboveEma50: ema50.pct,
    pctAboveEma200: ema200.pct,
    emaCoverage: { ema20: ema20.coverage, ema50: ema50.coverage, ema200: ema200.coverage },
    averageRsi14: rsiCoverage > 0 ? rsiSum / rsiCoverage : null,
    medianRsi14: median(rsiValues),
    rsiCoverage,
    new52wHighs,
    new52wLows,
  };
}
