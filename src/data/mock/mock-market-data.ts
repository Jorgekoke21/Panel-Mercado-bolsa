import type { MarketDataRepository, SecurityRef } from "@/data/repositories/market-data-repository";
import type { BenchmarkDefinition, BenchmarkQuote, SecurityMarketSnapshot } from "@/domain/market-data";
import type { Provenance, WithProvenance } from "@/domain/provenance";
import type { TimeRange } from "@/domain/time-range";

/**
 * DATOS SIMULADOS (Fase 1).
 *
 * Generador determinista: el mismo ticker produce siempre los mismos valores. Sirve para
 * diseñar y probar layouts (heatmap, rankings, breadth) sin API financiera.
 *   * No imita precios reales ni se basa en ellos.
 *   * Nunca se escribe en la base de datos.
 *   * Toda respuesta lleva `isDemo: true` y la UI la marca como DEMO.
 */
export const MOCK_SEED = "marketradar-phase1-demo";

export const MOCK_PROVENANCE_SOURCE = "mock";

export function mockProvenance(now: Date = new Date()): Provenance {
  return {
    source: MOCK_PROVENANCE_SOURCE,
    sourceLabel: "Simulated data (MarketRadar Phase 1 mock)",
    asOf: now.toISOString(),
    isDelayed: false,
    isDemo: true,
  };
}

/** Hash FNV-1a de 32 bits → semilla. */
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG mulberry32: rápido, determinista, suficiente para datos de demostración. */
export function createRng(seedText: string): () => number {
  let state = hashSeed(seedText);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Sesiones aproximadas por periodo (solo para escalar la volatilidad simulada). */
const RANGE_SESSIONS: Record<TimeRange, number> = {
  "1D": 1, "1W": 5, "1M": 21, "3M": 63, "6M": 126, YTD: 190, "1Y": 252, "3Y": 756, "5Y": 1260,
};

export function mockSnapshot(ref: SecurityRef): SecurityMarketSnapshot {
  const rng = createRng(`${MOCK_SEED}:${ref.ticker}`);
  const dailyVol = 0.012 + rng() * 0.02;
  const drift = normal(rng) * 0.0006;

  const returns: Partial<Record<TimeRange, number>> = {};
  for (const [range, sessions] of Object.entries(RANGE_SESSIONS) as [TimeRange, number][]) {
    const logReturn = drift * sessions + normal(rng) * dailyVol * Math.sqrt(sessions);
    returns[range] = round(Math.exp(logReturn) - 1, 6);
  }

  const price = round(Math.exp(Math.log(8) + rng() * Math.log(120)), 2);
  const marketCap = Math.round(clamp(Math.exp(Math.log(40e9) + normal(rng) * 1.1), 4e9, 3.5e12));
  const relativeVolume = round(clamp(Math.exp(normal(rng) * 0.45), 0.2, 6), 2);
  const averageVolume20 = Math.round((marketCap / price) * (0.002 + rng() * 0.01));
  const volume = Math.round(averageVolume20 * relativeVolume);

  const month = returns["1M"] ?? 0;
  const year = returns["1Y"] ?? 0;
  const ema20 = round(price / (1 + month * 0.35 + normal(rng) * 0.01), 2);
  const ema50 = round(price / (1 + month * 0.6 + normal(rng) * 0.02), 2);
  const ema200 = round(price / (1 + year * 0.4 + normal(rng) * 0.04), 2);
  const rsi14 = round(clamp(50 + (returns["1W"] ?? 0) * 400 + normal(rng) * 8, 4, 96), 2);

  const extreme = rng();
  const isNew52wHigh = extreme < 0.03;
  const isNew52wLow = extreme > 0.975;
  const high52w = isNew52wHigh ? price : round(price * (1 + Math.abs(normal(rng)) * 0.18 + 0.01), 2);
  const low52w = isNew52wLow ? price : round(price * (1 - clamp(Math.abs(normal(rng)) * 0.2 + 0.02, 0.02, 0.8)), 2);

  return {
    securityId: ref.securityId,
    currency: ref.currency,
    asOfDate: null,
    price,
    previousClose: round(price / (1 + (returns["1D"] ?? 0)), 2),
    returns,
    marketCap,
    marketCapStatus: "VERIFIED",
    marketCapReason: null,
    volume,
    averageVolume20,
    relativeVolume,
    averageDollarVolume20: Math.round(averageVolume20 * price),
    rsi14,
    sma20: ema20,
    sma50: ema50,
    sma200: ema200,
    ema20,
    ema50,
    ema200,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    atr14: null,
    high52w,
    low52w,
    isNew52wHigh,
    isNew52wLow,
  };
}

const BENCHMARK_BASE: Record<BenchmarkDefinition["kind"], { min: number; max: number; vol: number }> = {
  equity_index: { min: 1500, max: 30000, vol: 0.01 },
  volatility: { min: 10, max: 35, vol: 0.06 },
  fx: { min: 85, max: 115, vol: 0.004 },
  commodity: { min: 40, max: 3000, vol: 0.015 },
  rate: { min: 2, max: 6, vol: 0.02 },
};

export function mockBenchmarkQuote(definition: BenchmarkDefinition): BenchmarkQuote {
  const rng = createRng(`${MOCK_SEED}:benchmark:${definition.id}`);
  const base = BENCHMARK_BASE[definition.kind];
  let value = base.min + rng() * (base.max - base.min);
  const sparkline: number[] = [];
  for (let i = 0; i < 30; i++) {
    value *= 1 + normal(rng) * base.vol;
    sparkline.push(round(value, 2));
  }
  const last = sparkline.at(-1) ?? null;
  const previous = sparkline.at(-2) ?? null;
  return {
    benchmarkId: definition.id,
    value: last,
    change1D: last !== null && previous ? round(last / previous - 1, 6) : null,
    sparkline,
  };
}

export class MockMarketDataRepository implements MarketDataRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async getSnapshots(securities: readonly SecurityRef[]): Promise<WithProvenance<Map<string, SecurityMarketSnapshot>>> {
    return {
      data: new Map(securities.map((s) => [s.securityId, mockSnapshot(s)])),
      provenance: mockProvenance(this.now()),
    };
  }

  async getBenchmarkQuotes(benchmarks: readonly BenchmarkDefinition[]): Promise<WithProvenance<BenchmarkQuote[]>> {
    return { data: benchmarks.map(mockBenchmarkQuote), provenance: mockProvenance(this.now()) };
  }
}
