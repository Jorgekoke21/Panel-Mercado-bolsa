import { z } from "zod";
import { DEI_SHARES_OUTSTANDING } from "./concepts";
import type { SecFact } from "./normalize";

/**
 * Parseo de las respuestas de data.sec.gov (companyfacts y submissions).
 * Solo se valida la estructura que usamos; los tipos crudos no salen de src/providers/sec.
 */

const factSchema = z.object({
  start: z.string().optional(),
  end: z.string(),
  val: z.number(),
  accn: z.string(),
  fy: z.number().nullable().optional(),
  fp: z.string().nullable().optional(),
  form: z.string(),
  filed: z.string(),
  frame: z.string().optional(),
});

const conceptSchema = z.object({ units: z.record(z.string(), z.array(z.unknown())) });

export const companyFactsSchema = z.object({
  cik: z.union([z.number(), z.string()]),
  entityName: z.string(),
  facts: z.record(z.string(), z.record(z.string(), conceptSchema)),
});
export type CompanyFactsRaw = z.infer<typeof companyFactsSchema>;

/**
 * Aplana companyfacts a hechos, SOLO para los concepts pedidos (us-gaap por nombre, dei con prefijo).
 * Los hechos con formato inesperado se cuentan y se devuelven como incidencias, nunca se inventan.
 */
export function flattenCompanyFacts(raw: CompanyFactsRaw, concepts: ReadonlySet<string>): { facts: SecFact[]; rejected: number } {
  const facts: SecFact[] = [];
  let rejected = 0;
  const wanted: [string, string, string][] = [];
  for (const c of concepts) wanted.push(c.startsWith("dei:") ? ["dei", c.slice(4), c] : ["us-gaap", c, c]);
  if (concepts.has(DEI_SHARES_OUTSTANDING) === false) wanted.push(["dei", "EntityCommonStockSharesOutstanding", DEI_SHARES_OUTSTANDING]);
  for (const [taxonomy, name, key] of wanted) {
    const concept = raw.facts[taxonomy]?.[name];
    if (!concept) continue;
    for (const [unit, entries] of Object.entries(concept.units)) {
      for (const entry of entries) {
        const parsed = factSchema.safeParse(entry);
        if (!parsed.success) {
          rejected++;
          continue;
        }
        const f = parsed.data;
        facts.push({ concept: key, unit, start: f.start ?? null, end: f.end, val: f.val, accn: f.accn, fy: f.fy ?? null, fp: f.fp ?? null, form: f.form, filed: f.filed });
      }
    }
  }
  return { facts, rejected };
}

// --- submissions ---------------------------------------------------------------------------------------

export const submissionsSchema = z.object({
  cik: z.union([z.number(), z.string()]),
  name: z.string(),
  sic: z.string().nullable().optional(),
  sicDescription: z.string().nullable().optional(),
  tickers: z.array(z.string()).optional(),
  exchanges: z.array(z.string().nullable()).optional(),
  fiscalYearEnd: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  filings: z.object({
    recent: z.lazy(() => filingColumnsSchema),
    files: z.array(z.object({ name: z.string(), filingFrom: z.string(), filingTo: z.string() })).optional(),
  }),
});

/** Columnas de filings (bloque `recent` y páginas adicionales CIK…-submissions-NNN.json). */
export const filingColumnsSchema = z.object({
  accessionNumber: z.array(z.string()),
  filingDate: z.array(z.string()),
  reportDate: z.array(z.string()),
  acceptanceDateTime: z.array(z.string()),
  form: z.array(z.string()),
  items: z.array(z.string()),
  primaryDocument: z.array(z.string()),
});
export type FilingColumns = z.infer<typeof filingColumnsSchema>;
export type SubmissionsRaw = z.infer<typeof submissionsSchema>;

export interface SecEntityProfile {
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  tickers: string[];
  exchanges: string[];
  /** MMDD */
  fiscalYearEnd: string | null;
  filerCategory: string | null;
}

export type ReleaseTiming = "before_market" | "during_market" | "after_market";

export interface SecFiling {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  acceptedAt: string | null;
  items: string[];
  primaryDocument: string | null;
  /** Solo 8-K 2.02 (resultados): momento DERIVADO de la hora de aceptación en EDGAR (hora de Nueva York). */
  releaseTiming: ReleaseTiming | null;
}

const RELEVANT_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "8-K", "8-K/A"]);

/** Hora de Nueva York (HH*60+MM) de un instante ISO. */
export function newYorkMinutes(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

export function timingFromAcceptance(iso: string | null): ReleaseTiming | null {
  if (!iso) return null;
  const minutes = newYorkMinutes(iso);
  if (minutes === null) return null;
  if (minutes < 9 * 60 + 30) return "before_market";
  if (minutes >= 16 * 60) return "after_market";
  return "during_market";
}

/** Filings relevantes (10-K/10-Q y 8-K item 2.02) de un bloque de columnas. */
export function parseFilingColumns(r: FilingColumns): SecFiling[] {
  const filings: SecFiling[] = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const form = r.form[i] ?? "";
    if (!RELEVANT_FORMS.has(form)) continue;
    const items = (r.items[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const isEarnings = form.startsWith("8-K") && items.includes("2.02");
    if (form.startsWith("8-K") && !isEarnings) continue;
    const acceptedAt = r.acceptanceDateTime[i] || null;
    filings.push({
      accessionNumber: r.accessionNumber[i] as string,
      form,
      filingDate: r.filingDate[i] as string,
      reportDate: r.reportDate[i] || null,
      acceptedAt,
      items,
      primaryDocument: r.primaryDocument[i] || null,
      releaseTiming: isEarnings ? timingFromAcceptance(acceptedAt) : null,
    });
  }
  return filings;
}

/** Páginas históricas que hay que leer para cubrir desde `since` (las más recientes primero, con tope). */
export function submissionPagesSince(raw: SubmissionsRaw, since: string, maxPages: number): { pages: string[]; truncated: boolean } {
  const needed = (raw.filings.files ?? []).filter((f) => f.filingTo >= since).sort((a, b) => b.filingTo.localeCompare(a.filingTo));
  return { pages: needed.slice(0, maxPages).map((f) => f.name), truncated: needed.length > maxPages };
}

/**
 * 10-K / 10-Q deducidos de los hechos XBRL (accession, formulario, fecha): lista completa aunque el
 * índice de submissions esté paginado. Se completan con los datos del índice cuando existen.
 */
export function periodicFilingsFromFacts(facts: readonly { accn: string; form: string; filed: string }[]): SecFiling[] {
  const byAccession = new Map<string, SecFiling>();
  for (const f of facts) {
    if (!/^10-[KQ]/.test(f.form) || byAccession.has(f.accn)) continue;
    byAccession.set(f.accn, {
      accessionNumber: f.accn,
      form: f.form,
      filingDate: f.filed,
      reportDate: null,
      acceptedAt: null,
      items: [],
      primaryDocument: null,
      releaseTiming: null,
    });
  }
  return [...byAccession.values()];
}

export function parseSubmissions(raw: SubmissionsRaw): { profile: SecEntityProfile; filings: SecFiling[] } {
  const filings = parseFilingColumns(raw.filings.recent);
  return {
    profile: {
      cik: String(raw.cik).padStart(10, "0"),
      name: raw.name,
      sic: raw.sic || null,
      sicDescription: raw.sicDescription ?? null,
      tickers: raw.tickers ?? [],
      exchanges: (raw.exchanges ?? []).filter((e): e is string => typeof e === "string"),
      fiscalYearEnd: raw.fiscalYearEnd ?? null,
      filerCategory: raw.category ?? null,
    },
    filings,
  };
}

export { filingIndexUrl } from "@/lib/sec-links";
