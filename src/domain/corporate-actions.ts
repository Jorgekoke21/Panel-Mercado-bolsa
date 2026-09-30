/**
 * Acciones corporativas canónicas.
 *
 * Solo `split` y `cash_dividend` participan en los ajustes de precio en Fase 2B. Cualquier
 * otro evento (dividendo extraordinario, dividendo en acciones, spin-off, dividendo en otra
 * divisa…) NO se descarta: se registra como `unsupported` con el motivo, para que sepamos que
 * existe y que las series ajustadas pueden no reflejarlo.
 */

export const CORPORATE_ACTION_TYPES = [
  "split",
  "cash_dividend",
  "special_dividend",
  "stock_dividend",
  "spinoff",
  "other",
] as const;

export type CorporateActionType = (typeof CORPORATE_ACTION_TYPES)[number];

export interface SplitAction {
  kind: "split";
  exDate: string;
  /** Acciones nuevas por cada `fromShares` antiguas (split 4:1 ⇒ toShares 4, fromShares 1). */
  toShares: number;
  fromShares: number;
}

export interface CashDividendAction {
  kind: "cash_dividend";
  exDate: string;
  /** Importe por acción TAL COMO SE PAGÓ (sin ajustar por splits posteriores). */
  amount: number;
  currency: string;
  /** Importe re-expresado por el proveedor (ajustado por splits posteriores). Solo validación. */
  providerAdjustedAmount: number | null;
  declarationDate: string | null;
  recordDate: string | null;
  paymentDate: string | null;
  /** Periodicidad declarada por el proveedor (Quarterly, Annual…) o null si no la declara. */
  frequency: string | null;
  /** Etiqueta del proveedor, p. ej. "combined 0.58 + 0.2" cuando se suman dos pagos con la misma fecha ex. */
  providerLabel?: string | null;
}

export interface UnsupportedAction {
  kind: "unsupported";
  type: Exclude<CorporateActionType, "split" | "cash_dividend">;
  exDate: string;
  /** Por qué no se soporta todavía (se muestra en informes de cobertura). */
  reason: string;
  amount: number | null;
  currency: string | null;
  /** Etiqueta original del proveedor (p. ej. period = "Special"). */
  providerLabel: string | null;
}

export type CorporateAction = SplitAction | CashDividendAction | UnsupportedAction;

export function actionType(action: CorporateAction): CorporateActionType {
  return action.kind === "unsupported" ? action.type : action.kind;
}
