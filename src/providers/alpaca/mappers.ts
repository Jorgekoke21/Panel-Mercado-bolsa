import type { CorporateAction } from "@/domain/corporate-actions";
import type { DailyBar } from "@/domain/prices";
import type { AlpacaAsset, AlpacaBar, AlpacaCorporateActions } from "./schemas";

/**
 * Traducción PURA Alpaca → dominio canónico.
 *
 *   * Barras diarias pedidas con adjustment=raw ⇒ OHLC y volumen SIN ajustar (volume_basis = raw).
 *   * `t` de una barra diaria es la medianoche de Nueva York expresada en UTC ⇒ la fecha de sesión es
 *     la fecha en America/New_York.
 *   * Splits: new_rate por old_rate. Dividendos: `rate` = importe por acción declarado (sin ajustar).
 *     Dividendos especiales o en divisa extranjera ⇒ unsupported (no se descartan).
 */
const NY_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

export function sessionDate(timestamp: string): string {
  return NY_DATE.format(new Date(timestamp));
}

export function mapBars(raw: readonly AlpacaBar[]): { bars: DailyBar[]; issues: string[] } {
  const bars: DailyBar[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const b of raw) {
    const date = sessionDate(b.t);
    if (!(b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0)) {
      issues.push(`${date}: rejected, non-positive price`);
      continue;
    }
    if (b.l > b.h) {
      issues.push(`${date}: rejected, low ${b.l} > high ${b.h}`);
      continue;
    }
    if (seen.has(date)) {
      issues.push(`${date}: rejected, duplicated session`);
      continue;
    }
    seen.add(date);
    bars.push({ tradeDate: date, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v >= 0 ? b.v : null, providerAdjustedClose: null });
  }
  bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return { bars, issues };
}

/**
 * Alpaca puede publicar varios dividendos con la misma fecha ex:
 *   * registros IDÉNTICOS (mismo importe y fecha de registro; a veces con la fecha de pago corregida)
 *     ⇒ duplicado del proveedor: se conserva uno;
 *   * importes DISTINTOS (dividendo base + variable/suplementario, p. ej. COP, F, CME) ⇒ se pagan
 *     ambos: se suman (el precio cae por el total en la fecha ex).
 */
export function mergeSameDayDividends<T extends { ex_date: string; rate: number; record_date?: string | null; special?: boolean; foreign?: boolean }>(
  dividends: readonly T[],
): { merged: (T & { combinedFrom?: number[] })[]; duplicates: number } {
  const groups = new Map<string, T[]>();
  for (const d of dividends) {
    const key = `${d.ex_date}|${d.special ? "s" : "r"}|${d.foreign ? "f" : "d"}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  let duplicates = 0;
  const merged: (T & { combinedFrom?: number[] })[] = [];
  for (const list of groups.values()) {
    const unique: T[] = [];
    for (const d of list) {
      if (unique.some((u) => u.rate === d.rate && (u.record_date ?? null) === (d.record_date ?? null))) duplicates++;
      else unique.push(d);
    }
    const first = unique[0] as T;
    merged.push(unique.length === 1 ? first : { ...first, rate: Math.round(unique.reduce((s, u) => s + u.rate, 0) * 1e8) / 1e8, combinedFrom: unique.map((u) => u.rate) });
  }
  return { merged, duplicates };
}

export function mapCorporateActions(raw: AlpacaCorporateActions, expectedCurrency: string): { splits: CorporateAction[]; dividends: CorporateAction[] } {
  const splits: CorporateAction[] = [...(raw.forward_splits ?? []), ...(raw.reverse_splits ?? [])]
    .filter((s) => s.new_rate > 0 && s.old_rate > 0 && s.new_rate !== s.old_rate)
    .map((s) => ({ kind: "split", exDate: s.ex_date, toShares: s.new_rate, fromShares: s.old_rate }));

  const dividends: CorporateAction[] = mergeSameDayDividends(raw.cash_dividends ?? []).merged.map((d): CorporateAction => {
    const label = d.combinedFrom ? `combined ${d.combinedFrom.join(" + ")}` : null;
    if (d.special) {
      return { kind: "unsupported", type: "special_dividend", exDate: d.ex_date, reason: "Special cash dividend", amount: d.rate, currency: expectedCurrency, providerLabel: label ?? "special" };
    }
    if (d.foreign) {
      return { kind: "unsupported", type: "other", exDate: d.ex_date, reason: "Foreign dividend (amount may be net of withholding / in another currency)", amount: d.rate, currency: null, providerLabel: "foreign" };
    }
    if (!(d.rate > 0)) {
      return { kind: "unsupported", type: "other", exDate: d.ex_date, reason: "Non-positive dividend rate", amount: d.rate, currency: expectedCurrency, providerLabel: null };
    }
    return {
      kind: "cash_dividend",
      exDate: d.ex_date,
      amount: d.rate,
      currency: expectedCurrency,
      providerAdjustedAmount: null,
      declarationDate: null,
      recordDate: d.record_date ?? null,
      paymentDate: d.payable_date ?? null,
      frequency: null,
      providerLabel: label,
    };
  });

  const other: CorporateAction[] = [
    ...(raw.stock_dividends ?? []).map((s) => ({ kind: "unsupported" as const, type: "stock_dividend" as const, exDate: s.ex_date, reason: "Stock dividend", amount: null, currency: null, providerLabel: "stock_dividend" })),
    ...(raw.spin_offs ?? []).map((s) => ({ kind: "unsupported" as const, type: "spinoff" as const, exDate: s.ex_date, reason: "Spin-off", amount: null, currency: null, providerLabel: "spin_off" })),
  ];
  return { splits, dividends: [...dividends, ...other] };
}

/** Bolsas de Alpaca → MIC de MarketRadar. */
const EXCHANGE_TO_MIC: Readonly<Record<string, string>> = { NASDAQ: "XNAS", NYSE: "XNYS", BATS: "BATS", AMEX: "XASE", ARCA: "ARCX", NYSEARCA: "ARCX" };

const STOP_WORDS = new Set(["inc", "corp", "corporation", "co", "company", "plc", "ltd", "limited", "the", "class", "common", "stock", "shares", "holdings", "group", "nv", "sa", "of", "and", "capital", "ordinary", "new"]);

export const nameTokens = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

/** ¿Designan a la misma compañía? Tokens comunes, iniciales (IBM) o nombre sin espacios (Supermicro). */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setA = new Set(ta);
  if (tb.some((t) => setA.has(t))) return true;
  const initials = (tokens: string[]) => tokens.map((t) => t[0]).join("");
  if ((ta.length === 1 && initials(tb) === ta[0]) || (tb.length === 1 && initials(ta) === tb[0])) return true;
  const squashA = ta.join("");
  const squashB = tb.join("");
  return squashA.length >= 5 && squashB.length >= 5 && (squashA.includes(squashB) || squashB.includes(squashA));
}

export interface AssetVerification {
  /** Motivo del rechazo o null si verifica. */
  rejection: string | null;
  /** Diferencias aceptadas que conviene registrar (p. ej. cambio de bolsa). */
  warnings: string[];
}

/**
 * Verificación de identidad (Alpaca no publica CIK): activo, bolsa de EE. UU. y nombre compatible con
 * alguno de los nombres conocidos (seed y nombre registrado en la SEC).
 *
 * Un símbolo de la cinta consolidada de EE. UU. es único entre bolsas, así que un cambio de bolsa
 * (p. ej. NYSE → Nasdaq) no invalida la identidad: se acepta con aviso (el seed puede estar desfasado).
 */
export function verifyAsset(asset: AlpacaAsset, expected: { exchangeMic: string; companyNames: readonly string[] }): AssetVerification {
  const warnings: string[] = [];
  if (asset.status !== "active") return { rejection: `Asset status is ${asset.status}`, warnings };
  const mic = EXCHANGE_TO_MIC[asset.exchange.toUpperCase()];
  if (!mic) return { rejection: `Exchange ${asset.exchange} is not a US listing venue`, warnings };
  if (mic !== expected.exchangeMic) warnings.push(`Listed on ${asset.exchange} (${mic}); MarketRadar seed says ${expected.exchangeMic}`);
  const names = expected.companyNames.filter((n) => n.trim() !== "");
  if (!names.some((n) => namesMatch(n, asset.name))) return { rejection: `Name "${asset.name}" does not match ${names.map((n) => `"${n}"`).join(" / ")}`, warnings };
  return { rejection: null, warnings };
}
