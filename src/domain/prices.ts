/**
 * Precios diarios canónicos de MarketRadar (independientes del proveedor).
 *
 * Fuente de verdad: OHLC SIN ajustar (tal como cotizó ese día) + acciones corporativas.
 * Las series ajustadas (splits / total return) se calculan internamente con funciones puras
 * (`src/lib/calculations/adjustments.ts`). El cierre ajustado del proveedor se guarda solo
 * para validación.
 */

/**
 * Base del volumen que entrega el proveedor.
 *   * raw: acciones negociadas ese día, sin tocar.
 *   * split_adjusted: re-expresado según los splits conocidos EN EL MOMENTO DE LA DESCARGA
 *     (EODHD). Si aparece un split nuevo, el histórico almacenado queda desfasado y debe
 *     volver a descargarse.
 */
export type VolumeBasis = "raw" | "split_adjusted";

export interface DailyBar {
  /** Fecha de sesión local de la bolsa (YYYY-MM-DD). */
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** Cierre ajustado según el proveedor (splits + dividendos). SOLO validación. */
  providerAdjustedClose: number | null;
}

export interface DailyBarSeries {
  bars: DailyBar[];
  currency: string;
  volumeBasis: VolumeBasis;
}

/** Barra ya ajustada por MarketRadar (lo que consumen gráficos e indicadores). */
export interface AdjustedBar {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/** Tipo de ajuste: precio (solo splits) o total return (splits + dividendos reinvertidos). */
export type AdjustmentMode = "split" | "total_return";

/** Rentabilidad por defecto de MarketRadar: price return (decisión de Fase 2B). */
export type ReturnBasis = "price_return" | "total_return";
export const DEFAULT_RETURN_BASIS: ReturnBasis = "price_return";

export const RETURN_BASIS_MODE: Record<ReturnBasis, AdjustmentMode> = {
  price_return: "split",
  total_return: "total_return",
};
