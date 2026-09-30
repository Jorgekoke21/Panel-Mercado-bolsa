/**
 * Interpretación de la columna "Headquarters Location" del listado de Wikipedia.
 *
 * Formatos observados: "Saint Paul, Minnesota", "Washington, D.C.", "Dublin, Ireland",
 * "none". Si el último segmento es un estado de EE. UU. el país es US; en otro caso se
 * busca por nombre en el catálogo de países.
 */

const US_STATES = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "D.C.", "District of Columbia",
]);

const NO_VALUE = new Set(["", "none", "n/a", "—", "-"]);

export interface Headquarters {
  city: string | null;
  region: string | null;
  countryCode: string;
}

export type HeadquartersResult =
  | { kind: "resolved"; value: Headquarters }
  | { kind: "empty" }
  | { kind: "unresolved"; raw: string };

export function parseHeadquarters(raw: string, countryCodeByName: ReadonlyMap<string, string>): HeadquartersResult {
  const text = raw.trim();
  if (NO_VALUE.has(text.toLowerCase())) return { kind: "empty" };

  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts.at(-1);
  if (!last) return { kind: "unresolved", raw };
  const city = parts.length > 1 ? parts.slice(0, -1).join(", ") : null;

  if (US_STATES.has(last)) {
    return { kind: "resolved", value: { city, region: last, countryCode: "US" } };
  }
  const countryCode = countryCodeByName.get(last.toLowerCase());
  if (countryCode) return { kind: "resolved", value: { city, region: null, countryCode } };
  return { kind: "unresolved", raw };
}

/** "2013 (1888)" → 2013; "1975/1977 (1997)" → 1975; "" → null. */
export function parseFoundedYear(raw: string): number | null {
  const match = /^(\d{4})/.exec(raw.trim());
  return match?.[1] ? Number(match[1]) : null;
}
