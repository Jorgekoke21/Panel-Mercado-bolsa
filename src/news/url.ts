import { sha1 } from "./text";

/**
 * Canonicalización de URLs para la deduplicación exacta:
 *   * esquema https, host en minúsculas sin "www." / "m." / "amp.",
 *   * sin fragmento ni parámetros de seguimiento (utm_*, fbclid, gclid, ref, cmpid…),
 *   * sin "/amp" final ni barra final, parámetros restantes ordenados.
 */
const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|ref|ref_src|cmpid|cmp|src|source|ocid|mod|taid|guccounter|guce_referrer\w*|smid|partner|feature|rss|traffic_source|outputType|output)$/i;

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^(www\d?|m|amp|mobile)\./, "");
  const kept = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);
  let path = url.pathname.replace(/\/amp\/?$/i, "").replace(/\.amp(\.html)?$/i, "$1").replace(/\/+$/, "");
  if (path === "") path = "/";
  url.pathname = path;
  return url.toString();
}

export function urlHash(canonical: string): string {
  return sha1(canonical);
}

/** Sufijos públicos de dos niveles más comunes (aproximación sin la Public Suffix List completa). */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.kr", "co.in", "com.br", "com.mx", "com.ar", "com.cn",
  "com.hk", "com.sg", "com.tw", "co.za", "co.nz", "com.tr", "com.es", "com.co", "com.pe", "com.my", "com.ph", "com.pk", "co.id", "gov.br",
]);

/**
 * Dominio registrable (eTLD+1): wmrn.iheart.com ⇒ iheart.com, uk.reuters.com ⇒ reuters.com,
 * www.bbc.co.uk ⇒ bbc.co.uk. Agrupa redes de emisoras/ediciones como UN editor.
 */
export function registrableDomain(hostOrUrl: string): string {
  let host = hostOrUrl.trim().toLowerCase();
  try {
    if (host.includes("/")) host = new URL(host.startsWith("http") ? host : `https://${host}`).hostname;
  } catch {
    // se usa tal cual
  }
  host = host.replace(/^www\d?\./, "").replace(/\.$/, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/** Ruta de la URL sin host (misma ruta en distintos subdominios = republicación sindicada). */
export function urlPath(canonical: string): string {
  try {
    return new URL(canonical).pathname;
  } catch {
    return canonical;
  }
}
