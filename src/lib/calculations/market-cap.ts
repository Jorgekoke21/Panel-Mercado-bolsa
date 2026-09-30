/**
 * Verificación de la capitalización calculada (precio de la security × acciones en circulación).
 *
 * NO se asume que "precio de una clase × acciones de la compañía" sea una capitalización válida:
 * el proveedor puede dar acciones a nivel compañía (todas las clases) o de una clase concreta, y
 * no lo declara. Por eso:
 *
 *   * MISSING    — falta el precio o las acciones.
 *   * UNVERIFIED — el valor existe pero no se puede confirmar (varias clases de acciones, acciones
 *                  desfasadas, sin referencia independiente o discrepancia con el proveedor).
 *   * VERIFIED   — valor único por clase y coherente con la capitalización publicada por el
 *                  proveedor dentro de la tolerancia.
 *
 * Solo un valor VERIFIED se presenta como capitalización en la UI.
 */
export type MarketCapStatus = "VERIFIED" | "UNVERIFIED" | "MISSING";

export type MarketCapReason =
  | "missing_price"
  | "missing_shares_outstanding"
  | "multi_class_share_scope_unverified"
  | "shares_outstanding_stale"
  | "no_independent_reference"
  | "deviates_from_provider_market_cap"
  | "consistent_with_provider_market_cap"
  | "shares_inconsistent_with_weighted_average"
  | "consistent_with_weighted_average_shares"
  | "consistent_with_filing_eps_shares"
  | "share_class_unresolved";

export interface MarketCapInput {
  price: number | null;
  priceDate: string | null;
  shares: { value: number; asOfDate: string } | null;
  /** Capitalización publicada por el proveedor (referencia independiente del cálculo). */
  providerMarketCap: { value: number; asOfDate: string } | null;
  /**
   * Referencias alternativas (sin proveedor), por orden de preferencia: acciones medias diluidas y
   * básicas del último trimestre reportado (SEC). Basta con que UNA sea coherente (una puede venir mal
   * etiquetada, p. ej. en millones).
   */
  referenceShares?: { value: number; asOfDate: string } | null;
  alternateReferenceShares?: { value: number; asOfDate: string } | null;
  /**
   * Splits de la security (fecha ex + factor de acciones to/from). Acciones y referencias anteriores a
   * un split se re-expresan en la base de acciones del precio (p. ej. KLAC 10:1).
   */
  splits?: readonly { exDate: string; shareFactor: number }[];
  /** El emisor tiene (o puede tener) varias clases de acciones. */
  isMultiClass: boolean;
  /**
   * Acciones de la CLASE de esta security leídas de la portada XBRL del último 10-Q/10-K, con su
   * comprobación frente a las medias ponderadas del BPA del mismo filing. Si existe, sustituye a
   * `shares` / referencias: resuelve el alcance (clase) que impide verificar a los emisores multiclase.
   */
  shareClass?: {
    status: "consistent" | "inconsistent" | "no_reference" | "unresolved";
    shares: number | null;
    asOfDate: string | null;
    note: string | null;
  } | null;
}

export interface MarketCapCheck {
  status: MarketCapStatus;
  reason: MarketCapReason;
  /** price × shares, siempre informativo; solo se publica si status = VERIFIED. */
  calculated: number | null;
  providerReference: number | null;
  /** |calculated / provider − 1| si ambos existen. */
  deviation: number | null;
}

export const MARKET_CAP_TOLERANCE = 0.05;
/**
 * Tolerancia frente a acciones MEDIAS ponderadas del último trimestre: recompras, emisiones por
 * adquisiciones y dilución de opciones mueven legítimamente la cifra varios puntos (NVR −5 %, HBAN +7 %,
 * TSLA +12 %). La comprobación busca errores groseros (escala, split, alcance de clase: ≥ 2×).
 */
export const WEIGHTED_AVERAGE_TOLERANCE = 0.15;
/** Las acciones reportadas a cierre de trimestre pueden tener hasta ~2 trimestres de antigüedad. */
export const MAX_SHARES_AGE_DAYS = 190;

/** Ticker con sufijo de clase (BRK.B, BF.B): indica una clase concreta de un emisor multiclase. */
const CLASS_SUFFIX = /\.[A-Z]$/;

export function isLikelyMultiClass(input: { ticker: string; shareClass: string | null; listingsOfIssuer: number }): boolean {
  return input.shareClass !== null || input.listingsOfIssuer > 1 || CLASS_SUFFIX.test(input.ticker);
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

export function verifyMarketCap(input: MarketCapInput): MarketCapCheck {
  if (input.shareClass) return verifyClassMarketCap(input, input.shareClass);
  const providerReference = input.providerMarketCap?.value ?? null;
  if (input.price === null || !(input.price > 0)) {
    return { status: "MISSING", reason: "missing_price", calculated: null, providerReference, deviation: null };
  }
  if (!input.shares || !(input.shares.value > 0)) {
    return { status: "MISSING", reason: "missing_shares_outstanding", calculated: null, providerReference, deviation: null };
  }
  // Re-expresa una cifra de acciones en la base del precio (splits con fecha ex posterior a la cifra).
  const toPriceBasis = (value: number, asOfDate: string) =>
    (input.splits ?? []).reduce((v, s) => (s.exDate > asOfDate && (!input.priceDate || s.exDate <= input.priceDate) ? v * s.shareFactor : v), value);
  const shares = toPriceBasis(input.shares.value, input.shares.asOfDate);
  const calculated = input.price * shares;
  const deviation = providerReference && providerReference > 0 ? Math.abs(calculated / providerReference - 1) : null;
  const unverified = (reason: MarketCapReason): MarketCapCheck => ({ status: "UNVERIFIED", reason, calculated, providerReference, deviation });

  // Varias clases: no sabemos si las acciones son de esta clase o de toda la compañía.
  if (input.isMultiClass) return unverified("multi_class_share_scope_unverified");
  if (input.priceDate && days(input.shares.asOfDate, input.priceDate) > MAX_SHARES_AGE_DAYS) return unverified("shares_outstanding_stale");
  if (deviation !== null) {
    if (deviation > MARKET_CAP_TOLERANCE) return unverified("deviates_from_provider_market_cap");
    return { status: "VERIFIED", reason: "consistent_with_provider_market_cap", calculated, providerReference, deviation };
  }
  const refs = [input.referenceShares, input.alternateReferenceShares].filter((r): r is { value: number; asOfDate: string } => !!r && r.value > 0);
  if (refs.length === 0) return unverified("no_independent_reference");
  const deviations = refs.map((r) => Math.abs(shares / toPriceBasis(r.value, r.asOfDate) - 1));
  const best = Math.min(...deviations);
  if (best > WEIGHTED_AVERAGE_TOLERANCE) return { ...unverified("shares_inconsistent_with_weighted_average"), deviation: best };
  return { status: "VERIFIED", reason: "consistent_with_weighted_average_shares", calculated, providerReference, deviation: best };
}

function verifyClassMarketCap(input: MarketCapInput, sc: NonNullable<MarketCapInput["shareClass"]>): MarketCapCheck {
  const base = { providerReference: null, deviation: null };
  if (input.price === null || !(input.price > 0)) return { ...base, status: "MISSING", reason: "missing_price", calculated: null };
  if (sc.status === "unresolved" || sc.shares === null || !sc.asOfDate) return { ...base, status: "UNVERIFIED", reason: "share_class_unresolved", calculated: null };
  const shares = (input.splits ?? []).reduce(
    (v, s) => (s.exDate > (sc.asOfDate as string) && (!input.priceDate || s.exDate <= input.priceDate) ? v * s.shareFactor : v),
    sc.shares,
  );
  const calculated = input.price * shares;
  if (input.priceDate && days(sc.asOfDate, input.priceDate) > MAX_SHARES_AGE_DAYS) return { ...base, status: "UNVERIFIED", reason: "shares_outstanding_stale", calculated };
  if (sc.status === "consistent") return { ...base, status: "VERIFIED", reason: "consistent_with_filing_eps_shares", calculated };
  return { ...base, status: "UNVERIFIED", reason: sc.status === "inconsistent" ? "shares_inconsistent_with_weighted_average" : "no_independent_reference", calculated };
}

/** Textos (UI en inglés) que explican cada estado. */
export const MARKET_CAP_STATUS_TEXT: Record<MarketCapStatus, string> = {
  VERIFIED: "Verified",
  UNVERIFIED: "Unverified — not shown",
  MISSING: "Missing",
};

export const MARKET_CAP_REASON_TEXT: Record<MarketCapReason, string> = {
  missing_price: "no price data synced for this security",
  missing_shares_outstanding: "no shares outstanding available",
  multi_class_share_scope_unverified: "the issuer has several share classes and the share count is not stated per class",
  shares_outstanding_stale: "the latest shares outstanding figure is too old",
  no_independent_reference: "no independent reference to cross-check against",
  deviates_from_provider_market_cap: "it differs by more than 5% from the provider's market cap",
  consistent_with_provider_market_cap: "consistent with the provider's market cap (within 5%)",
  shares_inconsistent_with_weighted_average: "cover-page shares differ by more than 15% from the latest reported weighted-average shares (diluted and basic)",
  consistent_with_weighted_average_shares: "cover-page shares consistent with the latest reported weighted-average shares (within 15%, split-adjusted)",
  consistent_with_filing_eps_shares: "shares of this share class from the latest 10-Q/10-K cover page, consistent with the same filing's EPS weighted-average shares (within 15%)",
  share_class_unresolved: "the latest filing does not map this ticker to a single share class",
};
