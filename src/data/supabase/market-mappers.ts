import type { CorporateAction, CorporateActionType, UnsupportedAction } from "@/domain/corporate-actions";
import { actionType } from "@/domain/corporate-actions";
import type { DailyBar } from "@/domain/prices";
import type { AdjustmentFactor } from "@/lib/calculations/adjustments";
import type { Tables, TablesInsert } from "./database.types";

/**
 * Conversión fila ↔ dominio de las tablas de mercado. Compartido por el repositorio de lectura
 * (app, clave anon) y por el store de sincronización (CLI, service_role).
 */

/** PostgREST devuelve numeric como number; si llegara como string se convierte. */
export const num = (value: number | string): number => (typeof value === "number" ? value : Number(value));
export const numOrNull = (value: number | string | null): number | null => (value === null ? null : num(value));

export function toDailyBar(row: Pick<Tables<"daily_bars">, "trade_date" | "open" | "high" | "low" | "close" | "volume" | "provider_adjusted_close">): DailyBar {
  return {
    tradeDate: row.trade_date,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    volume: numOrNull(row.volume),
    providerAdjustedClose: numOrNull(row.provider_adjusted_close),
  };
}

type ActionRow = Tables<"corporate_actions">;
type ActionInsert = TablesInsert<"corporate_actions">;

export function corporateActionToRow(
  securityId: string,
  action: CorporateAction,
  prov: { source: string; datasetId: string; ingestedAt: string },
): ActionInsert {
  const base = {
    security_id: securityId,
    action_type: actionType(action),
    ex_date: action.exDate,
    source: prov.source,
    dataset_id: prov.datasetId,
    ingested_at: prov.ingestedAt,
  };
  if (action.kind === "split") {
    return { ...base, support_status: "supported", split_to: action.toShares, split_from: action.fromShares };
  }
  if (action.kind === "cash_dividend") {
    return {
      ...base,
      support_status: "supported",
      cash_amount: action.amount,
      provider_adjusted_amount: action.providerAdjustedAmount,
      currency: action.currency,
      declaration_date: action.declarationDate,
      record_date: action.recordDate,
      payment_date: action.paymentDate,
      frequency: action.frequency,
      provider_label: action.providerLabel ?? null,
    };
  }
  return {
    ...base,
    support_status: "unsupported",
    cash_amount: action.amount,
    currency: action.currency,
    provider_label: action.providerLabel,
    unsupported_reason: action.reason,
  };
}

export function rowToCorporateAction(row: ActionRow): CorporateAction {
  const type = row.action_type as CorporateActionType;
  if (type === "split" && row.split_to !== null && row.split_from !== null) {
    return { kind: "split", exDate: row.ex_date, toShares: num(row.split_to), fromShares: num(row.split_from) };
  }
  if (type === "cash_dividend" && row.cash_amount !== null && row.currency !== null) {
    return {
      kind: "cash_dividend",
      exDate: row.ex_date,
      amount: num(row.cash_amount),
      currency: row.currency,
      providerAdjustedAmount: numOrNull(row.provider_adjusted_amount),
      declarationDate: row.declaration_date,
      recordDate: row.record_date,
      paymentDate: row.payment_date,
      frequency: row.frequency,
      providerLabel: row.provider_label,
    };
  }
  return {
    kind: "unsupported",
    type: (type === "split" || type === "cash_dividend" ? "other" : type) as UnsupportedAction["type"],
    exDate: row.ex_date,
    reason: row.unsupported_reason ?? "Incomplete row",
    amount: numOrNull(row.cash_amount),
    currency: row.currency,
    providerLabel: row.provider_label,
  };
}

export function rowToAdjustmentFactor(row: Tables<"adjustment_factors">): AdjustmentFactor {
  return {
    exDate: row.ex_date,
    kind: row.factor_kind as AdjustmentFactor["kind"],
    priceFactor: num(row.price_factor),
    volumeFactor: num(row.volume_factor),
    referenceClose: numOrNull(row.reference_close),
    referenceDate: row.reference_date,
  };
}
