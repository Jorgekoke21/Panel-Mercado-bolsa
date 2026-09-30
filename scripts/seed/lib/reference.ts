import { join } from "node:path";
import { z } from "zod";
import { readCsv } from "./csv";

/** Datos de referencia mantenidos a mano en `data/seed/reference/*.csv`. */

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const optional = z.string().transform((v) => (v === "" ? null : v));

export const countryCsvSchema = z.object({
  code: z.string().regex(/^[A-Z]{2}$/),
  iso3: z.string().regex(/^[A-Z]{3}$/),
  iso_numeric: z.string().regex(/^\d{3}$/),
  name: z.string().min(1),
  region: optional,
});

export const exchangeCsvSchema = z.object({
  mic: z.string().regex(/^[A-Z0-9]{4}$/),
  name: z.string().min(1),
  acronym: optional,
  country_code: z.string().regex(/^[A-Z]{2}$/),
  timezone: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const indexCsvSchema = z.object({
  code: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  short_name: optional,
  kind: z.enum(["official", "synthetic"]),
  methodology: z.enum(["provider", "equal_weight", "cap_weight"]),
  provider: z.string().min(1),
  country_code: optional,
  currency: optional,
  constituents_tracked: bool,
});

export const themeCsvSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const companyThemeCsvSchema = z.object({
  ticker: z.string().min(1),
  theme_slug: z.string().min(1),
  source: z.enum(["manual", "provider", "ai"]),
  note: optional,
});

export interface ReferenceData {
  countries: z.infer<typeof countryCsvSchema>[];
  exchanges: z.infer<typeof exchangeCsvSchema>[];
  indices: z.infer<typeof indexCsvSchema>[];
  themes: z.infer<typeof themeCsvSchema>[];
  companyThemes: z.infer<typeof companyThemeCsvSchema>[];
}

export const REFERENCE_FILES = {
  countries: "reference/countries.csv",
  exchanges: "reference/exchanges.csv",
  indices: "reference/indices.csv",
  themes: "reference/themes.csv",
  companyThemes: "reference/company_themes.csv",
} as const;

export function readReferenceData(seedDir: string): ReferenceData {
  return {
    countries: readCsv(join(seedDir, REFERENCE_FILES.countries), countryCsvSchema),
    exchanges: readCsv(join(seedDir, REFERENCE_FILES.exchanges), exchangeCsvSchema),
    indices: readCsv(join(seedDir, REFERENCE_FILES.indices), indexCsvSchema),
    themes: readCsv(join(seedDir, REFERENCE_FILES.themes), themeCsvSchema),
    companyThemes: readCsv(join(seedDir, REFERENCE_FILES.companyThemes), companyThemeCsvSchema),
  };
}
