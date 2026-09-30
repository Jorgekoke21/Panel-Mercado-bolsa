/**
 * Formateo centralizado de cifras para todas las vistas.
 * Todas las funciones aceptan null/undefined/NaN y devuelven el marcador "—".
 * La divisa siempre viene de los datos; nunca se asume USD.
 */
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";

export const DISPLAY_LOCALE = DEFAULT_LOCALE;
export const EMPTY_VALUE = "—";

type Numeric = number | null | undefined;

const isNumber = (value: Numeric): value is number => typeof value === "number" && Number.isFinite(value);

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const relativeCache = new Map<string, Intl.RelativeTimeFormat>();
export function intlLocale(locale: Locale): string {
  return locale === "es" ? "es-ES" : "en-US";
}

function numberFormat(options: Intl.NumberFormatOptions, locale: Locale): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = numberCache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(intlLocale(locale), { useGrouping: "always", ...options });
    numberCache.set(key, format);
  }
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions, locale: Locale): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = dateCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(locale), options);
    dateCache.set(key, format);
  }
  return format;
}

export function formatNumber(value: Numeric, fractionDigits = 2, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return numberFormat({ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }, locale).format(value);
}

export function formatInteger(value: Numeric, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return numberFormat({ maximumFractionDigits: 0 }, locale).format(value);
}

/** Precio con símbolo de divisa; más decimales para precios < 1. */
export function formatPrice(value: Numeric, currency: string | null, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const digits = Math.abs(value) < 1 && value !== 0 ? 4 : 2;
  const options: Intl.NumberFormatOptions = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  if (!currency) return numberFormat(options, locale).format(value);
  return numberFormat({ ...options, style: "currency", currency }, locale).format(value);
}

/** 1_234_000_000_000 → "$1.23T" (o "1.23T" sin divisa). */
export function formatCompact(value: Numeric, currency: string | null = null, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const options: Intl.NumberFormatOptions = { notation: "compact", maximumFractionDigits: 2 };
  if (!currency) return numberFormat(options, locale).format(value);
  return numberFormat({ ...options, style: "currency", currency }, locale).format(value);
}

/**
 * Fracción → porcentaje. 0.01234 → "+1.23%".
 * `signed` añade "+" a los positivos para que el significado no dependa del color.
 */
export function formatPercent(value: Numeric, options: { signed?: boolean; digits?: number } = {}, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const { signed = true, digits = 2 } = options;
  const text = numberFormat({
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  }, locale).format(value);
  return text.replace("-", "−");
}

export function formatRatio(value: Numeric, digits = 2, locale: Locale = DEFAULT_LOCALE): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return `${formatNumber(value, digits, locale)}×`;
}

export function formatDate(iso: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return dateFormat({ year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }, locale).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return dateFormat({
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }, locale).format(date);
}

export function formatRelativeTime(iso: string | null | undefined, now = new Date(), locale: Locale = DEFAULT_LOCALE): string {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const unit: Intl.RelativeTimeFormatUnit = abs < 60 ? "second" : abs < 3_600 ? "minute" : abs < 86_400 ? "hour" : abs < 2_592_000 ? "day" : abs < 31_536_000 ? "month" : "year";
  const divisor = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3_600 : unit === "day" ? 86_400 : unit === "month" ? 2_592_000 : 31_536_000;
  const key = `${locale}:auto`;
  let format = relativeCache.get(key);
  if (!format) {
    format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
    relativeCache.set(key, format);
  }
  return format.format(Math.round(seconds / divisor), unit);
}

export type Direction = "up" | "down" | "flat" | "none";

export function directionOf(value: Numeric): Direction {
  if (!isNumber(value)) return "none";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}
