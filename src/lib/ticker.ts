/**
 * Tickers canónicos de MarketRadar.
 *
 * Formato canónico: mayúsculas y la clase de acción separada por punto (BRK.B, BF.B).
 * Cada proveedor usa su propia variante (BRK-B, BRK/B, BRK B); la traducción por
 * proveedor vivirá en `security_identifiers` (Fase 2). Aquí solo se normaliza la
 * entrada del usuario y de las URLs.
 */
export const TICKER_PATTERN = /^[A-Z0-9]+([.-][A-Z0-9]+)*$/;
const MAX_TICKER_LENGTH = 15;

export function normalizeTicker(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[/\s]+/g, ".")
    .replace(/-(?=[A-Z]$)/, ".");
}

export function isValidTicker(value: string): boolean {
  return value.length > 0 && value.length <= MAX_TICKER_LENGTH && TICKER_PATTERN.test(value);
}

/** Decodifica y normaliza un segmento de URL; devuelve null si no es un ticker válido. */
export function parseTickerParam(param: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    return null;
  }
  const ticker = normalizeTicker(decoded);
  return isValidTicker(ticker) ? ticker : null;
}

export function companyPath(ticker: string, tab?: string): string {
  const base = `/company/${encodeURIComponent(ticker)}`;
  return tab ? `${base}/${tab}` : base;
}
