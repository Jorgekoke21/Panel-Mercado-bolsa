import {
  CANONICAL_LINE_ITEMS,
  type FinancialStatementValue,
  type LineItemCode,
  type LineItemCoverage,
  lineItemDefinition,
  type SharesOutstandingPoint,
} from "@/domain/fundamentals";
import { BALANCE_CHECK_CONCEPTS, DEI_SHARES_OUTSTANDING, type DerivationRule, type IndustryTemplate, SEC_LINE_ITEMS, type SecLineItemSpec } from "./concepts";

/**
 * Motor de normalización SEC XBRL → partidas canónicas (función PURA, sin I/O).
 *
 * Problemas que resuelve (docs/sec-fundamentals.md):
 *   1. Duplicados: cada filing repite los periodos comparativos ⇒ por (concept, periodo) se usa el
 *      valor del filing MÁS RECIENTE; si difiere de otro filing, `restated = true`.
 *   2. Calendario fiscal: años de 52/53 semanas y cierres no naturales ⇒ se reconstruye a partir de
 *      los periodos de 10-K (anual) y 10-Q (trimestres), etiquetados con el fy/fp del filing ORIGINAL.
 *   3. 10-Q acumulados (YTD): los flujos de caja solo se publican YTD ⇒ trimestre = YTD − YTD previo.
 *   4. Q4: no hay 10-Q del cuarto trimestre ⇒ Q4 = FY − 9M YTD (o FY − Q1 − Q2 − Q3).
 *   5. Magnitudes no aditivas (EPS, acciones medias, dividendo por acción): nunca se restan; su Q4
 *      queda ausente con motivo.
 *   6. Concepts distintos por empresa y por época ⇒ lista ordenada + concept principal por emisor.
 *   7. Partidas que no existen en bancos/aseguradoras ⇒ NOT APPLICABLE (nunca 0).
 *   8. Extensiones propias de la empresa (no están en companyfacts) ⇒ DISCONTINUED/MISSING explícito.
 */

export interface SecFact {
  /** "Revenues" (us-gaap) o "dei:EntityCommonStockSharesOutstanding". */
  concept: string;
  unit: string;
  start: string | null;
  end: string;
  val: number;
  accn: string;
  fy: number | null;
  fp: string | null;
  form: string;
  filed: string;
}

export interface FiscalQuarter {
  quarter: 1 | 2 | 3 | 4;
  start: string;
  end: string;
}

export interface FiscalYear {
  fiscalYear: number;
  start: string;
  /** null si el año está en curso (aún sin 10-K). */
  end: string | null;
  quarters: FiscalQuarter[];
}

export interface NormalizeOptions {
  template: IndustryTemplate;
  /** Solo se emiten periodos que terminan en o después de esta fecha. */
  minPeriodEnd: string;
}

export interface NormalizedFundamentals {
  calendar: FiscalYear[];
  values: FinancialStatementValue[];
  coverage: LineItemCoverage[];
  coverShares: SharesOutstandingPoint[];
  warnings: string[];
}

export const PERIODIC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "10-KT/A"]);
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "10-KT/A"]);
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A"]);

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);

type DurationClass = "quarter" | "half" | "nine_months" | "annual" | "other";
export function classifyDuration(start: string, end: string): DurationClass {
  const d = daysBetween(start, end);
  // Hasta 16 semanas: Kroger (16/12/12/12), PepsiCo y Domino's (12/12/12/16) tienen trimestres de 112 días.
  if (d >= 75 && d <= 120) return "quarter";
  if (d >= 165 && d <= 200) return "half";
  if (d >= 255 && d <= 290) return "nine_months";
  if (d >= 340 && d <= 385) return "annual";
  return "other";
}

// --- 1. Deduplicación / reexpresiones -----------------------------------------------------------------

export interface DedupedFact extends SecFact {
  restated: boolean;
  /** fy/fp del filing ORIGINAL (el primero que publicó el periodo). */
  originalFy: number | null;
  originalFp: string | null;
  originalForm: string;
  /** Fecha del filing original (el primero que publicó el periodo). */
  originalFiled: string;
}

export function dedupeFacts(facts: readonly SecFact[]): DedupedFact[] {
  const groups = new Map<string, SecFact[]>();
  for (const f of facts) {
    if (!PERIODIC_FORMS.has(f.form) || !Number.isFinite(f.val)) continue;
    const key = `${f.concept}|${f.unit}|${f.start ?? ""}|${f.end}`;
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }
  const out: DedupedFact[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.filed.localeCompare(b.filed) || a.accn.localeCompare(b.accn));
    const first = group[0] as SecFact;
    const latest = group[group.length - 1] as SecFact;
    const restated = group.some((g) => Math.abs(g.val - latest.val) > Math.max(1e-9, Math.abs(latest.val) * 1e-9));
    out.push({ ...latest, restated, originalFy: first.fy, originalFp: first.fp, originalForm: first.form, originalFiled: first.filed });
  }
  return out;
}

// --- 2. Calendario fiscal ------------------------------------------------------------------------------

function mode<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

export function buildFiscalCalendar(facts: readonly DedupedFact[]): FiscalYear[] {
  const durations = facts.filter((f) => f.start !== null);
  // Años cerrados: periodos anuales cuyo filing ORIGINAL fue un 10-K.
  const annualByEnd = new Map<string, DedupedFact[]>();
  for (const f of durations) {
    if (classifyDuration(f.start as string, f.end) !== "annual" || !ANNUAL_FORMS.has(f.originalForm)) continue;
    // Solo el EJERCICIO del 10-K: se presenta 0–120 días después de su cierre. Otros periodos de 12 meses
    // dentro del 10-K (desgloses marzo–marzo, julio–junio…) no son el año fiscal (TE, Altria).
    const lag = daysBetween(f.end, f.originalFiled);
    if (lag < 0 || lag > 120) continue;
    const list = annualByEnd.get(f.end);
    if (list) list.push(f);
    else annualByEnd.set(f.end, [f]);
  }
  // Un mismo ejercicio a veces se etiqueta con cierres que difieren en días entre filings
  // (Deere: 2016-10-30 y 2016-10-31). Se agrupan los cierres a ≤ 7 días y se usa el más frecuente.
  const clusters: DedupedFact[][] = [];
  for (const end of [...annualByEnd.keys()].sort()) {
    const list = annualByEnd.get(end) as DedupedFact[];
    const last = clusters.at(-1);
    if (last && daysBetween((last[0] as DedupedFact).end, end) <= 7) last.push(...list);
    else clusters.push([...list]);
  }
  const years: FiscalYear[] = clusters
    .map((list) => {
      const end = mode(list.map((f) => f.end)) as string;
      return {
        fiscalYear: mode(list.map((f) => f.originalFy).filter((v): v is number => v !== null)) ?? Number(end.slice(0, 4)),
        start: mode(list.filter((f) => f.end === end).map((f) => f.start as string)) as string,
        end,
        quarters: [] as FiscalQuarter[],
      };
    })
    .sort((a, b) => a.end.localeCompare(b.end))
    // Red de seguridad: años solapados ⇒ se conserva el primero (los ejercicios son consecutivos).
    .filter((y, i, all) => i === 0 || daysBetween((all[i - 1] as FiscalYear).end as string, y.end as string) > 300);

  // Fin de trimestre: periodos de 10-Q (3 meses o YTD) etiquetados con el fp del filing original.
  const quarterEnds = new Map<string, string[]>();
  for (const f of durations) {
    if (!QUARTERLY_FORMS.has(f.originalForm)) continue;
    const quarterLag = daysBetween(f.end, f.originalFiled);
    if (quarterLag < 0 || quarterLag > 90) continue;
    const cls = classifyDuration(f.start as string, f.end);
    if (cls === "annual" || cls === "other") continue;
    const list = quarterEnds.get(f.end);
    if (list) list.push(f.originalFp ?? "");
    else quarterEnds.set(f.end, [f.originalFp ?? ""]);
  }
  // Año en curso (sin 10-K todavía).
  const lastEnd = years.at(-1)?.end;
  const pending = [...quarterEnds.keys()].filter((e) => !lastEnd || e > lastEnd).sort();
  if (pending.length > 0) {
    const labels = durations.filter((f) => pending.includes(f.end) && f.originalFy !== null).map((f) => f.originalFy as number);
    const start = lastEnd ? addDays(lastEnd, 1) : (mode(durations.filter((f) => f.end === pending[0]).map((f) => f.start as string)) as string);
    years.push({ fiscalYear: mode(labels) ?? Number((pending.at(-1) as string).slice(0, 4)), start, end: null, quarters: [] });
  }

  // Etiquetas fiscales estrictamente crecientes (algunos emisores, p. ej. Kroger, etiquetan dos
  // ejercicios consecutivos con el mismo DocumentFiscalYearFocus).
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1] as FiscalYear;
    const year = years[i] as FiscalYear;
    if (year.fiscalYear <= prev.fiscalYear) year.fiscalYear = prev.fiscalYear + 1;
  }

  for (const year of years) {
    const upper = year.end ?? addDays(year.start, 385);
    const ends = [...quarterEnds.keys()].filter((e) => e > year.start && e < upper && (!year.end || daysBetween(e, year.end) >= 60)).sort();
    const byFp = new Map<number, string>();
    for (const end of ends) {
      const fp = mode(quarterEnds.get(end) ?? []);
      const n = fp === "Q1" ? 1 : fp === "Q2" ? 2 : fp === "Q3" ? 3 : null;
      if (n && !byFp.has(n)) byFp.set(n, end);
    }
    let assigned: [number, string][] = [...byFp.entries()].sort((a, b) => a[0] - b[0]);
    const monotonic = assigned.every(([, end], i) => i === 0 || end > (assigned[i - 1] as [number, string])[1]);
    // Sin etiquetas fiables: posición dentro del año (máx. 3 trimestres antes del cierre).
    if (assigned.length === 0 || !monotonic) assigned = ends.slice(0, 3).map((e, i) => [i + 1, e]);
    let prevEnd: string | null = null;
    for (const [n, end] of assigned) {
      year.quarters.push({ quarter: n as 1 | 2 | 3, start: n === 1 || !prevEnd ? year.start : addDays(prevEnd, 1), end });
      prevEnd = end;
    }
    const q3 = year.quarters.find((q) => q.quarter === 3);
    if (year.end && q3) year.quarters.push({ quarter: 4, start: addDays(q3.end, 1), end: year.end });
  }
  return years;
}

// --- 3. Series por concept ----------------------------------------------------------------------------

interface PeriodValue {
  value: number;
  origin: "reported" | "derived";
  concept: string;
  accn: string | null;
  form: string | null;
  filed: string | null;
  restated: boolean;
  derivation: string | null;
  periodStart: string | null;
}

/** Clave de periodo: "A|<fin FY>" o "Q|<fin trimestre>". */
type PeriodKey = string;

interface PeriodRef {
  key: PeriodKey;
  type: "annual" | "quarterly";
  fiscalYear: number;
  fiscalQuarter: number | null;
  start: string;
  end: string;
}

export function periodsOf(calendar: readonly FiscalYear[]): PeriodRef[] {
  const out: PeriodRef[] = [];
  for (const y of calendar) {
    if (y.end) out.push({ key: `A|${y.end}`, type: "annual", fiscalYear: y.fiscalYear, fiscalQuarter: null, start: y.start, end: y.end });
    for (const q of y.quarters) out.push({ key: `Q|${q.end}`, type: "quarterly", fiscalYear: y.fiscalYear, fiscalQuarter: q.quarter, start: q.start, end: q.end });
  }
  return out;
}

const near = (a: string, b: string, days: number) => Math.abs(daysBetween(a, b)) <= days;

function reported(f: DedupedFact): PeriodValue {
  return {
    value: f.val,
    origin: "reported",
    concept: f.concept,
    accn: f.accn,
    form: f.form,
    filed: f.filed,
    restated: f.restated,
    derivation: null,
    periodStart: f.start,
  };
}

/**
 * Valores de UN concept por periodo del calendario.
 *   additive: permite derivar trimestres restando acumulados (importes en USD).
 */
function conceptSeries(
  facts: readonly DedupedFact[],
  calendar: readonly FiscalYear[],
  nature: "duration" | "instant",
  additive: boolean,
): Map<PeriodKey, PeriodValue> {
  const out = new Map<PeriodKey, PeriodValue>();
  if (facts.length === 0) return out;

  if (nature === "instant") {
    const instants = facts.filter((f) => f.start === null);
    const byEnd = new Map(instants.map((f) => [f.end, f]));
    for (const p of periodsOf(calendar)) {
      const f = byEnd.get(p.end) ?? instants.find((x) => near(x.end, p.end, 3));
      if (f) out.set(p.key, reported(f));
    }
    return out;
  }

  const durations = facts.filter((f) => f.start !== null);
  // Coincidencia exacta de cierre primero; si no, tolerancia de ±3 días (cierres etiquetados de forma distinta).
  const find = (start: string, end: string, cls: DurationClass) => {
    const matches = (f: DedupedFact) => classifyDuration(f.start as string, f.end) === cls && near(f.start as string, start, 10);
    return durations.find((f) => f.end === end && matches(f)) ?? durations.find((f) => near(f.end, end, 3) && matches(f));
  };

  for (const y of calendar) {
    const annual = y.end ? find(y.start, y.end, "annual") : undefined;
    if (y.end && annual) out.set(`A|${y.end}`, reported(annual));

    const quarterly = new Map<number, PeriodValue>();
    for (const q of y.quarters) {
      const direct = find(q.start, q.end, "quarter");
      let value: PeriodValue | null = direct ? reported(direct) : null;
      if (!value && additive && q.quarter > 1) {
        const prev = y.quarters.find((x) => x.quarter === q.quarter - 1);
        if (q.quarter < 4) {
          const ytd = find(y.start, q.end, q.quarter === 2 ? "half" : "nine_months");
          const prevYtd = prev ? (q.quarter === 2 ? find(y.start, prev.end, "quarter") : find(y.start, prev.end, "half")) : undefined;
          if (ytd && prevYtd) {
            value = {
              value: ytd.val - prevYtd.val,
              origin: "derived",
              concept: ytd.concept,
              accn: ytd.accn,
              form: ytd.form,
              filed: ytd.filed,
              restated: ytd.restated || prevYtd.restated,
              derivation: `${ytd.concept}: YTD to ${q.end} (${ytd.accn}) − YTD to ${prev?.end} (${prevYtd.accn})`,
              periodStart: q.start,
            };
          }
        } else if (annual) {
          const nine = prev ? find(y.start, prev.end, "nine_months") : undefined;
          if (nine) {
            value = {
              value: annual.val - nine.val,
              origin: "derived",
              concept: annual.concept,
              accn: annual.accn,
              form: annual.form,
              filed: annual.filed,
              restated: annual.restated || nine.restated,
              derivation: `${annual.concept}: FY to ${y.end} (${annual.accn}) − 9M YTD to ${prev?.end} (${nine.accn})`,
              periodStart: q.start,
            };
          } else if ([1, 2, 3].every((n) => quarterly.has(n))) {
            const sum = [1, 2, 3].reduce((s, n) => s + (quarterly.get(n) as PeriodValue).value, 0);
            value = {
              value: annual.val - sum,
              origin: "derived",
              concept: annual.concept,
              accn: annual.accn,
              form: annual.form,
              filed: annual.filed,
              restated: annual.restated,
              derivation: `${annual.concept}: FY to ${y.end} (${annual.accn}) − Q1 − Q2 − Q3`,
              periodStart: q.start,
            };
          }
        }
      }
      if (value) {
        quarterly.set(q.quarter, value);
        out.set(`Q|${q.end}`, value);
      }
    }
  }
  return out;
}

// --- 4. Partidas canónicas ------------------------------------------------------------------------------

function groupByConcept(facts: readonly DedupedFact[]): Map<string, DedupedFact[]> {
  const out = new Map<string, DedupedFact[]>();
  for (const f of facts) {
    const list = out.get(f.concept);
    if (list) list.push(f);
    else out.set(f.concept, [f]);
  }
  return out;
}

const UNIT_OF: Record<SecLineItemSpec["unit"], string> = { USD: "USD", "USD/shares": "USD/shares", shares: "shares" };

function applyDerivation(
  rule: DerivationRule,
  key: PeriodKey,
  resolve: (concept: string) => PeriodValue | undefined,
): PeriodValue | null {
  const parts = [...rule.plus.map((c) => ({ c, s: 1 })), ...(rule.minus ?? []).map((c) => ({ c, s: -1 }))];
  const optional = new Set(rule.optional ?? []);
  let total = 0;
  const used: string[] = [];
  let restated = false;
  let latest: PeriodValue | null = null;
  for (const { c, s } of parts) {
    const v = resolve(c);
    if (!v) {
      if (optional.has(c)) continue;
      return null;
    }
    total += s * v.value;
    used.push(`${s > 0 ? "+" : "−"} ${v.concept}${v.accn ? ` (${v.accn})` : ""}`);
    restated ||= v.restated;
    if (!latest || (v.filed ?? "") > (latest.filed ?? "")) latest = v;
  }
  if (rule.requireAnyOf && !rule.requireAnyOf.some((c) => resolve(c))) return null;
  if (!latest) return null;
  void key;
  return {
    value: total,
    origin: "derived",
    concept: rule.label,
    accn: latest.accn,
    form: latest.form,
    filed: latest.filed,
    restated,
    derivation: `${rule.label}: ${used.join(" ")}`,
    periodStart: latest.periodStart,
  };
}

export function normalizeCompanyFacts(allFacts: readonly SecFact[], options: NormalizeOptions): NormalizedFundamentals {
  const warnings: string[] = [];
  const facts = dedupeFacts(allFacts);
  const calendar = buildFiscalCalendar(facts.filter((f) => !f.concept.startsWith("dei:")));
  const periods = periodsOf(calendar);
  const byConcept = groupByConcept(facts);
  const latestEnd = periods.map((p) => p.end).sort().at(-1) ?? null;
  const recentCutoff = latestEnd ? addDays(latestEnd, -800) : null;

  const seriesCache = new Map<string, Map<PeriodKey, PeriodValue>>();
  const series = (concept: string, unit: string, nature: "duration" | "instant", additive: boolean) => {
    const cacheKey = `${concept}|${unit}|${nature}|${additive}`;
    let s = seriesCache.get(cacheKey);
    if (!s) {
      s = conceptSeries((byConcept.get(concept) ?? []).filter((f) => f.unit === unit), calendar, nature, additive);
      seriesCache.set(cacheKey, s);
    }
    return s;
  };

  const itemSeries = new Map<LineItemCode, Map<PeriodKey, PeriodValue>>();
  const coverage: LineItemCoverage[] = [];

  // Orden: las partidas referenciadas con @ (revenue) se resuelven antes.
  const order = CANONICAL_LINE_ITEMS.map((i) => i.code).sort((a, b) => (a === "revenue" ? -1 : b === "revenue" ? 1 : 0));
  for (const code of order) {
    const spec = SEC_LINE_ITEMS[code];
    if (!spec) continue;
    const def = lineItemDefinition(code);
    const unit = UNIT_OF[spec.unit];
    const additive = def.nature === "duration" && def.unit === "currency";
    const candidates = [...new Set([...(options.template === "financial" ? (spec.financialConcepts ?? []) : []), ...spec.concepts])];

    // Concept principal: el primero con datos recientes ANUALES Y TRIMESTRALES (misma magnitud en ambos:
    // ADP etiqueta "Revenues" solo en el 10-K y RevenueFromContract… en 10-K y 10-Q); si ninguno, el
    // primero con algún dato reciente.
    const withData = candidates.filter((c) => series(c, unit, def.nature, additive).size > 0);
    const recentKinds = (c: string) => {
      const keys = [...series(c, unit, def.nature, additive).keys()].filter((k) => recentCutoff && k.slice(2) >= recentCutoff);
      return { annual: keys.some((k) => k.startsWith("A|")), quarterly: keys.some((k) => k.startsWith("Q|")) };
    };
    const recent =
      withData.find((c) => {
        const r = recentKinds(c);
        return r.annual && r.quarterly;
      }) ?? withData.find((c) => {
        const r = recentKinds(c);
        return r.annual || r.quarterly;
      });
    const ordered = recent ? [recent, ...withData.filter((c) => c !== recent)] : withData;

    // Los concepts alternativos solo rellenan periodos FUERA del rango del principal (cambio de
    // concept con los años). Un hueco dentro del rango queda vacío: taparlo con otro concept podría
    // mezclar magnitudes distintas (p. ej. efectivo vs efectivo + restringido).
    const merged = new Map<PeriodKey, PeriodValue>();
    const principal = ordered[0] ? series(ordered[0], unit, def.nature, additive) : new Map<PeriodKey, PeriodValue>();
    const principalEnds = [...principal.keys()].map((k) => k.slice(2)).sort();
    const [rangeStart, rangeEnd] = [principalEnds[0], principalEnds.at(-1)];
    for (const [key, v] of principal) merged.set(key, v);
    for (const concept of ordered.slice(1)) {
      for (const [key, v] of series(concept, unit, def.nature, additive)) {
        const end = key.slice(2);
        const outside = !rangeStart || !rangeEnd || end < rangeStart || end > rangeEnd;
        if (outside && !merged.has(key)) merged.set(key, v);
      }
    }

    // Derivaciones para los periodos sin valor reportado.
    for (const rule of spec.derive ?? []) {
      for (const p of periods) {
        if (merged.has(p.key)) continue;
        const derived = applyDerivation(rule, p.key, (c) =>
          c.startsWith("@") ? itemSeries.get(c.slice(1) as LineItemCode)?.get(p.key) : series(c, unit, def.nature, additive).get(p.key),
        );
        if (derived) merged.set(p.key, derived);
      }
    }

    if (spec.sign === "abs") for (const v of merged.values()) v.value = Math.abs(v.value);
    itemSeries.set(code, merged);

    // Cobertura.
    const keys = [...merged.keys()];
    const latestKey = keys.map((k) => k.slice(2)).sort().at(-1) ?? null;
    const hasRecent = latestKey !== null && recentCutoff !== null && latestKey >= recentCutoff;
    const concepts = [...new Set([...merged.values()].map((v) => v.concept))];
    let status: LineItemCoverage["status"] = "available";
    let reason: string | null = null;
    if (!hasRecent) {
      if (options.template === "financial" && spec.financialTemplate === "not_applicable") {
        status = "not_applicable";
        reason = "Not part of a bank / insurer income statement or balance-sheet template.";
      } else if (latestKey) {
        status = "discontinued";
        reason = `No value with a standard US-GAAP concept since the period ending ${latestKey}. Either the item no longer exists for this company (e.g. debt repaid) or it is now reported with a company-specific extension, which SEC companyfacts does not publish.`;
      } else {
        const anyHistoric = candidates.some((c) => (byConcept.get(c) ?? []).length > 0);
        status = "missing";
        reason = anyHistoric
          ? "Reported only outside the periods MarketRadar keeps, or with dimensions (e.g. per share class), which SEC companyfacts excludes."
          : "Not reported with any standard US-GAAP concept MarketRadar maps.";
      }
    }
    coverage.push({
      lineItem: code,
      status,
      reason,
      concepts,
      annualPeriods: keys.filter((k) => k.startsWith("A|")).length,
      quarterlyPeriods: keys.filter((k) => k.startsWith("Q|")).length,
      latestPeriodEnd: latestKey,
    });
  }

  // Salida + validaciones.
  const values: FinancialStatementValue[] = [];
  for (const [code, merged] of itemSeries) {
    const def = lineItemDefinition(code);
    for (const p of periods) {
      const v = merged.get(p.key);
      if (!v || p.end < options.minPeriodEnd) continue;
      // Un revenue trimestral derivado negativo delata un etiquetado YTD incoherente: no se publica.
      if (code === "revenue" && v.origin === "derived" && v.value < 0) {
        warnings.push(`revenue ${p.key}: derived quarter would be negative (${v.value}); not published — inconsistent YTD tagging`);
        continue;
      }
      values.push({
        lineItem: code,
        periodType: p.type,
        fiscalPeriodEnd: p.end,
        periodStart: def.nature === "duration" ? p.start : null,
        fiscalYear: p.fiscalYear,
        fiscalQuarter: p.fiscalQuarter,
        filingDate: v.filed,
        currency: def.unit === "currency" || def.unit === "per_share" ? "USD" : null,
        origin: v.origin,
        value: v.value,
        missingReason: null,
        // Solo el concepto: la fórmula de un derivado vive en provenance.derivation (no se duplica).
        sourceField: v.origin === "reported" ? `us-gaap:${v.concept}` : v.concept,
        provenance: {
          concept: v.origin === "reported" ? `us-gaap:${v.concept}` : v.concept,
          accessionNumber: v.accn,
          form: v.form,
          filedDate: v.filed,
          restated: v.restated,
          derivation: v.derivation,
        },
      });
    }
  }

  // Coherencia de balance: activos ≈ pasivos + patrimonio (incl. minoritarios).
  const assets = itemSeries.get("total_assets");
  const liabilities = itemSeries.get("total_liabilities");
  const equityIncl = series(BALANCE_CHECK_CONCEPTS.equityIncludingNci, "USD", "instant", false);
  const minority = series(BALANCE_CHECK_CONCEPTS.minorityInterest, "USD", "instant", false);
  const temporary = BALANCE_CHECK_CONCEPTS.temporaryEquity.map((c) => series(c, "USD", "instant", false));
  const equity = itemSeries.get("total_equity");
  for (const p of periods) {
    const a = assets?.get(p.key)?.value;
    const l = liabilities?.get(p.key)?.value;
    const parentEquity = equity?.get(p.key)?.value;
    if (a === undefined || l === undefined || parentEquity === undefined || p.end < options.minPeriodEnd) continue;
    // Lecturas legítimas del lado derecho del balance (los emisores etiquetan minoritarios y patrimonio
    // temporal de formas distintas). Solo se avisa si NINGUNA cuadra con el activo.
    const temp = temporary.map((t) => t.get(p.key)?.value).find((v) => v !== undefined) ?? 0;
    const nci = minority.get(p.key)?.value ?? 0;
    const incl = equityIncl.get(p.key)?.value;
    const candidates = [l + parentEquity, l + parentEquity + nci, l + parentEquity + nci + temp, ...(incl !== undefined ? [l + incl, l + incl + temp] : [])];
    const best = candidates.reduce((b, c) => (Math.abs(a - c) < Math.abs(a - b) ? c : b));
    const gap = Math.abs(a - best) / Math.max(Math.abs(a), 1);
    if (gap > 0.02) warnings.push(`balance ${p.key}: assets ${a} vs liabilities + equity (+ NCI / temporary equity) ${best} (${(gap * 100).toFixed(1)}% gap)`);
  }

  // Acciones de portada (dei), sin dimensiones.
  const coverShares: SharesOutstandingPoint[] = (byConcept.get(DEI_SHARES_OUTSTANDING) ?? [])
    .filter((f) => f.unit === "shares" && f.val > 0 && f.end >= options.minPeriodEnd)
    .map((f) => ({ asOfDate: f.end, shares: Math.round(f.val), basis: "cover_page" as const, sourceField: `${DEI_SHARES_OUTSTANDING} (${f.accn})` }))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));

  values.sort((a, b) => a.lineItem.localeCompare(b.lineItem) || a.fiscalPeriodEnd.localeCompare(b.fiscalPeriodEnd) || a.periodType.localeCompare(b.periodType));
  return { calendar, values, coverage, coverShares, warnings };
}
