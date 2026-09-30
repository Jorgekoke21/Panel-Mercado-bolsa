import type { CashDividendAction, CorporateAction, SplitAction } from "@/domain/corporate-actions";
import type { AdjustedBar, AdjustmentMode, DailyBar, VolumeBasis } from "@/domain/prices";

/**
 * Motor de precios ajustados (funciones puras).
 *
 * Entrada: OHLC SIN ajustar + acciones corporativas. Salida: series re-expresadas en la base
 * de acciones ACTUAL.
 *
 *   * Split N:M con fecha ex E → precios de sesiones < E × (M/N); volumen × (N/M).
 *   * Dividendo en efectivo D con fecha ex E → precios de sesiones < E × (1 − D / C), donde C es
 *     el cierre sin ajustar de la última sesión anterior a E (método CRSP, reinversión en la
 *     fecha ex). D y C están en la misma base (ambos sin ajustar), así que no hace falta ajustar
 *     D por splits.
 *
 * Modos: `split` (price return, por defecto en MarketRadar) y `total_return` (split + dividendos).
 * Las acciones `unsupported` no se aplican: el resultado lo indica en `ignoredActions`.
 */

export interface AdjustmentFactor {
  exDate: string;
  kind: "split" | "cash_dividend";
  /** Multiplicador aplicado a los precios de las sesiones anteriores a exDate. */
  priceFactor: number;
  /** Multiplicador del volumen (solo splits; 1 para dividendos). */
  volumeFactor: number;
  /** Cierre sin ajustar usado como referencia (dividendos). */
  referenceClose: number | null;
  referenceDate: string | null;
}

export interface FactorComputation {
  factors: AdjustmentFactor[];
  /** Acciones que no se pudieron convertir en factor (con motivo). Nunca se ocultan. */
  skipped: { exDate: string; kind: string; reason: string }[];
}

const byDate = <T extends { tradeDate: string }>(a: T, b: T) => a.tradeDate.localeCompare(b.tradeDate);

export function splitFactor(split: SplitAction): AdjustmentFactor {
  return {
    exDate: split.exDate,
    kind: "split",
    priceFactor: split.fromShares / split.toShares,
    volumeFactor: split.toShares / split.fromShares,
    referenceClose: null,
    referenceDate: null,
  };
}

/** Último cierre sin ajustar ANTERIOR a `exDate` (bars ordenadas). */
function previousBar(bars: readonly DailyBar[], exDate: string): DailyBar | null {
  let lo = 0;
  let hi = bars.length - 1;
  let found: DailyBar | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bar = bars[mid] as DailyBar;
    if (bar.tradeDate < exDate) {
      found = bar;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function dividendFactor(dividend: CashDividendAction, bars: readonly DailyBar[]): AdjustmentFactor | { reason: string } {
  const reference = previousBar(bars, dividend.exDate);
  if (!reference) return { reason: "No session before the ex-date in the stored price history" };
  if (!(dividend.amount < reference.close)) {
    return { reason: `Dividend ${dividend.amount} is not lower than the reference close ${reference.close}` };
  }
  return {
    exDate: dividend.exDate,
    kind: "cash_dividend",
    priceFactor: 1 - dividend.amount / reference.close,
    volumeFactor: 1,
    referenceClose: reference.close,
    referenceDate: reference.tradeDate,
  };
}

/** Movimiento máximo (tras descontar el split) que se acepta en la sesión ex. */
export const SPLIT_EVIDENCE_TOLERANCE = 0.4;

/**
 * Los precios SIN ajustar son la fuente de verdad: si en la sesión ex el cierre no se mueve como
 * indica el split (p. ej. un "reverse split 1:2" publicado el día de un spin-off con el precio
 * −2 %), el split NO se aplica (duplicaría el histórico). Devuelve el motivo o null si cuadra o si
 * no hay barras para comprobarlo.
 */
export function splitContradiction(split: SplitAction, bars: readonly DailyBar[]): string | null {
  const exIndex = bars.findIndex((b) => b.tradeDate >= split.exDate);
  if (exIndex <= 0) return null;
  const ex = bars[exIndex] as DailyBar;
  const prev = bars[exIndex - 1] as DailyBar;
  const implied = ex.close / prev.close / (split.fromShares / split.toShares);
  if (implied >= 1 - SPLIT_EVIDENCE_TOLERANCE && implied <= 1 / (1 - SPLIT_EVIDENCE_TOLERANCE)) return null;
  return `Split ${split.toShares}:${split.fromShares} not reflected in raw prices (close ${prev.close} → ${ex.close}); not applied`;
}

/** Factores por evento a partir de las barras SIN ajustar y las acciones corporativas. */
export function computeAdjustmentFactors(rawBars: readonly DailyBar[], actions: readonly CorporateAction[]): FactorComputation {
  const bars = [...rawBars].sort(byDate);
  const factors: AdjustmentFactor[] = [];
  const skipped: FactorComputation["skipped"] = [];
  const lastSession = bars.at(-1)?.tradeDate;
  for (const action of actions) {
    // Evento anunciado pero aún no efectivo: ajustar ya el histórico sería un error.
    if (lastSession !== undefined && action.exDate > lastSession) {
      skipped.push({ exDate: action.exDate, kind: action.kind === "unsupported" ? action.type : action.kind, reason: "Ex-date after the last stored session (not yet effective)" });
      continue;
    }
    if (action.kind === "split") {
      const contradiction = splitContradiction(action, bars);
      if (contradiction) skipped.push({ exDate: action.exDate, kind: "split", reason: contradiction });
      else factors.push(splitFactor(action));
    } else if (action.kind === "cash_dividend") {
      const result = dividendFactor(action, bars);
      if ("reason" in result) skipped.push({ exDate: action.exDate, kind: action.kind, reason: result.reason });
      else factors.push(result);
    } else {
      skipped.push({ exDate: action.exDate, kind: action.type, reason: `Unsupported: ${action.reason}` });
    }
  }
  factors.sort((a, b) => a.exDate.localeCompare(b.exDate) || a.kind.localeCompare(b.kind));
  return { factors, skipped };
}

export interface AdjustOptions {
  mode: AdjustmentMode;
  /** Base del volumen almacenado. Si ya viene ajustado por splits, no se vuelve a ajustar. */
  volumeBasis: VolumeBasis;
}

/**
 * Aplica los factores: cada barra se multiplica por el producto de los factores cuya fecha ex
 * es POSTERIOR a su sesión. O(n + k) recorriendo hacia atrás.
 */
export function adjustBars(rawBars: readonly DailyBar[], factors: readonly AdjustmentFactor[], options: AdjustOptions): AdjustedBar[] {
  const bars = [...rawBars].sort(byDate);
  const applicable = factors
    .filter((f) => options.mode === "total_return" || f.kind === "split")
    .sort((a, b) => b.exDate.localeCompare(a.exDate));

  const out: AdjustedBar[] = new Array(bars.length);
  let priceMultiplier = 1;
  let volumeMultiplier = 1;
  let next = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i] as DailyBar;
    // Incorpora los factores cuya fecha ex es posterior a esta sesión.
    while (next < applicable.length && (applicable[next] as AdjustmentFactor).exDate > bar.tradeDate) {
      const f = applicable[next] as AdjustmentFactor;
      priceMultiplier *= f.priceFactor;
      volumeMultiplier *= f.volumeFactor;
      next++;
    }
    const volume =
      bar.volume === null ? null : options.volumeBasis === "raw" ? Math.round(bar.volume * volumeMultiplier) : bar.volume;
    out[i] = {
      tradeDate: bar.tradeDate,
      open: bar.open * priceMultiplier,
      high: bar.high * priceMultiplier,
      low: bar.low * priceMultiplier,
      close: bar.close * priceMultiplier,
      volume,
    };
  }
  return out;
}

export interface ReconciliationResult {
  compared: number;
  /** Máxima desviación relativa |nuestro / proveedor − 1| tras normalizar por la última barra. */
  maxRelativeDeviation: number | null;
  worstDate: string | null;
}

/**
 * Compara nuestra serie total return con el `adjusted_close` del proveedor. Ambas se normalizan
 * a la última sesión (los proveedores anclan el ajuste en fechas distintas).
 */
export function reconcileWithProviderAdjusted(rawBars: readonly DailyBar[], adjusted: readonly AdjustedBar[]): ReconciliationResult {
  const provider = new Map(rawBars.filter((b) => b.providerAdjustedClose !== null).map((b) => [b.tradeDate, b.providerAdjustedClose as number]));
  const pairs = adjusted.filter((b) => provider.has(b.tradeDate));
  const last = pairs.at(-1);
  if (!last) return { compared: 0, maxRelativeDeviation: null, worstDate: null };
  const scale = (provider.get(last.tradeDate) as number) / last.close;
  let max = 0;
  let worst: string | null = null;
  for (const b of pairs) {
    const deviation = Math.abs((b.close * scale) / (provider.get(b.tradeDate) as number) - 1);
    if (deviation > max) {
      max = deviation;
      worst = b.tradeDate;
    }
  }
  return { compared: pairs.length, maxRelativeDeviation: max, worstDate: worst };
}
