/**
 * Reglas de simbología por proveedor: ÚNICO lugar donde se traduce
 * (ticker canónico de MarketRadar, bolsa MIC) → símbolo del proveedor.
 *
 * Solo se usan para PROPONER identificadores al dar de alta un valor en
 * `security_identifiers` (source = 'rule'). A partir de ahí, jobs y adaptadores leen siempre
 * de esa tabla; nadie concatena símbolos por el código. Si un proveedor usa un símbolo que no
 * sigue la regla, se corrige en la tabla (source = 'manual') sin tocar código.
 */
export interface SecurityListingKey {
  ticker: string;
  exchangeMic: string;
}

export interface SymbologyRule {
  provider: string;
  /** Símbolo propuesto o null si el proveedor no cubre esa bolsa. */
  toProviderSymbol(listing: SecurityListingKey): { symbol: string; exchangeCode: string } | null;
}
