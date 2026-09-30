import type { MarketCapStatus } from "@/lib/calculations/market-cap";

/**
 * Matriz de validación del piloto (función pura sobre datos ya recogidos de la base de datos).
 *
 *   PASS    — el dato existe y es coherente.
 *   MISSING — el proveedor no lo proporciona (válido).
 *   WARNING — existe pero con salvedades (divergencias, no verificado, incompleto).
 *   FAIL    — nuestro pipeline no ha producido lo que debía.
 */
export type CellStatus = "PASS" | "MISSING" | "WARNING" | "FAIL";

export const PILOT_CHECKS = [
  "Identifier",
  "CIK verification",
  "Price history",
  "Latest EOD",
  "Splits",
  "Dividends",
  "Shares",
  "Market cap",
  "Fundamentals",
  "Earnings",
  "Valuation",
  "Adjusted series",
  "UI real data",
] as const;
export type PilotCheck = (typeof PILOT_CHECKS)[number];

export interface PilotCell {
  status: CellStatus;
  detail: string;
}

export interface PilotFacts {
  identifier: { symbol: string; verified: boolean } | null;
  prices: { count: number; first: string | null; last: string | null };
  /** Fecha de referencia (hoy) para frescura e histórico requerido. */
  today: string;
  /** Inicio necesario para 5Y (último EOD − 5 años). */
  required5yStart: string | null;
  splits: number;
  dividends: number;
  unsupportedActions: number;
  shares: { lastPeriodEnd: string | null; current: string | null };
  marketCap: { status: MarketCapStatus; reason: string };
  /** Partidas del proveedor esperables (mapeadas) vs presentes. */
  fundamentals: { expected: number; present: number; fcfDivergences: number };
  earnings: { events: number };
  valuation: { providerMetrics: number };
  reconciliation: { compared: number; maxDeviation: number | null };
  factors: number;
}

export const RECONCILIATION_PASS = 0.005;
export const RECONCILIATION_WARN = 0.02;
const MAX_EOD_AGE_DAYS = 5;

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const cell = (status: CellStatus, detail: string): PilotCell => ({ status, detail });

export function classifyPilot(f: PilotFacts): Record<PilotCheck, PilotCell> {
  const hasPrices = f.prices.count > 0 && f.prices.last !== null;
  const dev = f.reconciliation.maxDeviation;
  return {
    Identifier: f.identifier ? cell("PASS", f.identifier.symbol) : cell("FAIL", "no provider identifier"),
    "CIK verification": !f.identifier
      ? cell("FAIL", "no identifier")
      : f.identifier.verified
        ? cell("PASS", "CIK matches provider profile")
        : cell("FAIL", "identifier not verified"),
    "Price history": !hasPrices
      ? cell("FAIL", "no bars stored")
      : f.required5yStart && f.prices.first && f.prices.first > f.required5yStart
        ? cell("WARNING", `starts ${f.prices.first}: shorter than 5Y`)
        : cell("PASS", `${f.prices.count} bars since ${f.prices.first}`),
    "Latest EOD": !hasPrices
      ? cell("FAIL", "no bars")
      : days(f.prices.last as string, f.today) > MAX_EOD_AGE_DAYS
        ? cell("WARNING", `last session ${f.prices.last}`)
        : cell("PASS", f.prices.last as string),
    Splits: cell(f.unsupportedActions > 0 ? "WARNING" : "PASS", `${f.splits} reported`),
    Dividends: cell(f.unsupportedActions > 0 ? "WARNING" : "PASS", `${f.dividends} cash dividends${f.unsupportedActions ? `, ${f.unsupportedActions} unsupported` : ""}`),
    Shares: f.shares.current || f.shares.lastPeriodEnd ? cell("PASS", `current ${f.shares.current ?? "—"} · period ${f.shares.lastPeriodEnd ?? "—"}`) : cell("MISSING", "no shares outstanding"),
    "Market cap":
      f.marketCap.status === "VERIFIED"
        ? cell("PASS", f.marketCap.reason)
        : f.marketCap.status === "UNVERIFIED"
          ? cell("WARNING", `UNVERIFIED · ${f.marketCap.reason}`)
          : cell("MISSING", f.marketCap.reason),
    Fundamentals:
      f.fundamentals.present === 0
        ? cell("MISSING", "no statements")
        : f.fundamentals.present < f.fundamentals.expected || f.fundamentals.fcfDivergences > 0
          ? cell("WARNING", `${f.fundamentals.present}/${f.fundamentals.expected} provider items · ${f.fundamentals.fcfDivergences} FCF divergences`)
          : cell("PASS", `${f.fundamentals.present}/${f.fundamentals.expected} provider items`),
    Earnings: f.earnings.events > 0 ? cell("PASS", `${f.earnings.events} events`) : cell("MISSING", "no earnings events"),
    Valuation: f.valuation.providerMetrics > 0 ? cell("PASS", `${f.valuation.providerMetrics} provider metrics`) : cell("MISSING", "no provider metrics"),
    "Adjusted series":
      !hasPrices || f.reconciliation.compared === 0 || dev === null
        ? cell(hasPrices ? "MISSING" : "FAIL", "no provider adjusted close to compare")
        : dev <= RECONCILIATION_PASS
          ? cell("PASS", `max deviation ${(dev * 100).toFixed(3)}%`)
          : dev <= RECONCILIATION_WARN
            ? cell("WARNING", `max deviation ${(dev * 100).toFixed(2)}%`)
            : cell("FAIL", `max deviation ${(dev * 100).toFixed(2)}%`),
    "UI real data": hasPrices ? cell("PASS", "company page reads synced EOD data") : cell("FAIL", "page would stay DEMO"),
  };
}
