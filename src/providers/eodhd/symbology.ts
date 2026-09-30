import type { SymbologyRule } from "../symbology";

/**
 * EODHD: `{TICKER}.{EXCHANGE}`. Todas las bolsas de EE. UU. comparten el código virtual "US".
 * Las clases de acción usan guion: BRK.B (MarketRadar) → BRK-B.US (EODHD).
 *
 * Solo se declaran las bolsas del universo actual. Japón no está cubierto por EODHD
 * (auditoría 2A): no hay regla para XTKS y el valor queda sin identificador.
 */
export const EODHD_EXCHANGE_CODES: Readonly<Record<string, string>> = {
  XNYS: "US",
  XNAS: "US",
  BATS: "US",
  XASE: "US",
  ARCX: "US",
};

export const eodhdSymbology: SymbologyRule = {
  provider: "eodhd",
  toProviderSymbol({ ticker, exchangeMic }) {
    const exchangeCode = EODHD_EXCHANGE_CODES[exchangeMic];
    if (!exchangeCode) return null;
    return { symbol: `${ticker.replaceAll(".", "-")}.${exchangeCode}`, exchangeCode };
  },
};
