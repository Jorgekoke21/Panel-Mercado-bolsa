/**
 * Portada XBRL de un 10-Q / 10-K (instancia completa del filing, no companyfacts).
 *
 * companyfacts de la SEC NO publica hechos dimensionales: en los emisores con varias clases las acciones
 * de portada (`dei:EntityCommonStockSharesOutstanding`) solo existen por clase
 * (`us-gaap:StatementClassOfStockAxis`). La instancia del filing sí las trae, junto con:
 *   * `dei:TradingSymbol` / `dei:Security12bTitle` por clase ⇒ qué clase es cada ticker (oficial);
 *   * acciones medias ponderadas (básicas / diluidas) del BPA, a veces por clase ⇒ referencia
 *     independiente para comprobar la cifra de portada.
 *
 * Funciones puras (sin red). Nada de heurísticas por nombre de empresa: solo hechos del filing.
 */

export interface CoverContext {
  classMembers: string[];
  /** Nº de dimensiones distintas del eje de clase (segmentos, reexpresiones…). */
  otherDimensions: number;
  instant: string | null;
  start: string | null;
  end: string | null;
}

export interface CoverClass {
  /** Miembro del eje de clase (p. ej. "us-gaap:CommonClassAMember"); null = acciones sin dimensión (clase única). */
  member: string | null;
  shares: number;
  asOfDate: string;
}

export interface WeightedAverage {
  member: string | null;
  basic: number | null;
  diluted: number | null;
  periodEnd: string;
}

export interface CoverData {
  documentType: string | null;
  periodEnd: string | null;
  classes: CoverClass[];
  /** Símbolos cotizados y la clase a la que el filing los asocia (null si el contexto no lleva dimensión). */
  symbols: { symbol: string; member: string | null; title: string | null }[];
  /** Medias ponderadas del último periodo reportado, por clase (member) y/o total (member null). */
  weightedAverages: WeightedAverage[];
}

const CLASS_AXIS = /StatementClassOfStockAxis$/;
const localName = (qname: string) => qname.split(":").at(-1) ?? qname;
/** Miembros de acciones ordinarias (se excluyen preferentes, notas, depositary shares…). */
const isCommonMember = (member: string) => /Common|Capital|Class[A-Z]\d?Member$|Ordinary/i.test(localName(member)) && !/Preferred|Note|Debenture|Depositary|Warrant|Unit|FullyDiluted|Exchangeable|Equivalent/i.test(localName(member));

function decode(text: string): string {
  return text
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCoverInstance(xml: string): CoverData {
  const contexts = new Map<string, CoverContext>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const body = m[2] as string;
    const dims = [...body.matchAll(/<(?:[\w-]+:)?explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)].map((d) => [d[1] as string, d[2] as string] as const);
    contexts.set(m[1] as string, {
      classMembers: dims.filter(([d]) => CLASS_AXIS.test(d)).map(([, v]) => v),
      otherDimensions: dims.filter(([d]) => !CLASS_AXIS.test(d)).length + (/typedMember/.test(body) ? 1 : 0),
      instant: body.match(/<(?:[\w-]+:)?instant>\s*([^<\s]+)/)?.[1] ?? null,
      start: body.match(/<(?:[\w-]+:)?startDate>\s*([^<\s]+)/)?.[1] ?? null,
      end: body.match(/<(?:[\w-]+:)?endDate>\s*([^<\s]+)/)?.[1] ?? null,
    });
  }
  const facts = (name: string) =>
    [...xml.matchAll(new RegExp(`<${name}\\b[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<`, "g"))].flatMap((f) => {
      const ctx = contexts.get(f[1] as string);
      return ctx ? [{ ctx, value: decode(f[2] as string) }] : [];
    });
  const single = (ctx: CoverContext) => (ctx.classMembers.length === 1 ? (ctx.classMembers[0] as string) : null);

  const classes: CoverClass[] = facts("dei:EntityCommonStockSharesOutstanding").flatMap(({ ctx, value }) => {
    const shares = Number(value);
    // Un hecho con dos miembros de clase (p. ej. un rango) o con otras dimensiones no es la cifra de una clase.
    if (!Number.isFinite(shares) || ctx.otherDimensions > 0 || ctx.classMembers.length > 1 || !ctx.instant) return [];
    const member = single(ctx);
    if (member !== null && !isCommonMember(member)) return [];
    return [{ member, shares, asOfDate: ctx.instant }];
  });

  const titles = new Map<CoverContext, string>();
  for (const f of facts("dei:Security12bTitle")) titles.set(f.ctx, f.value);
  const symbols = facts("dei:TradingSymbol").map(({ ctx, value }) => ({ symbol: value.toUpperCase(), member: single(ctx), title: titles.get(ctx) ?? null }));

  // Medias ponderadas: último periodo con fin más reciente; se prefiere el periodo más corto (trimestre).
  const averages = new Map<string, WeightedAverage & { days: number }>();
  for (const [name, field] of [
    ["us-gaap:WeightedAverageNumberOfSharesOutstandingBasic", "basic"],
    ["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", "diluted"],
  ] as const) {
    for (const { ctx, value } of facts(name)) {
      const v = Number(value);
      if (!Number.isFinite(v) || ctx.otherDimensions > 0 || ctx.classMembers.length > 1 || !ctx.start || !ctx.end) continue;
      const member = single(ctx);
      const days = (Date.parse(ctx.end) - Date.parse(ctx.start)) / 86_400_000;
      const key = member ?? "";
      const current = averages.get(key);
      if (current && (current.periodEnd > ctx.end || (current.periodEnd === ctx.end && current.days < days - 1))) continue;
      const base = current && current.periodEnd === ctx.end && Math.abs(current.days - days) <= 1 ? current : { member, basic: null, diluted: null, periodEnd: ctx.end, days };
      base[field] = v;
      averages.set(key, base);
    }
  }

  return {
    documentType: facts("dei:DocumentType")[0]?.value ?? null,
    periodEnd: facts("dei:DocumentPeriodEndDate")[0]?.value ?? null,
    classes,
    symbols,
    weightedAverages: [...averages.values()].map(({ member, basic, diluted, periodEnd }) => ({ member, basic, diluted, periodEnd })),
  };
}

const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type ClassResolution =
  | { ok: true; member: string | null; shares: number; asOfDate: string; via: "symbol_dimension" | "security_title" | "single_class" }
  | { ok: false; reason: string };

/**
 * Qué cifra de portada corresponde a un ticker:
 *   1. `dei:TradingSymbol` con miembro de clase ⇒ esa clase (GOOGL → Class A, GOOG → Class C, BF.B → Nonvoting).
 *   2. Símbolo sin dimensión ⇒ la clase que nombra su `dei:Security12bTitle` ("Class A Common Stock").
 *   3. Emisor de clase única (cifra sin dimensión) ⇒ esa cifra.
 */
export function resolveSecurityClass(cover: CoverData, ticker: string): ClassResolution {
  const latest = (list: CoverClass[]) => list.sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0];
  const target = normalizeSymbol(ticker);
  const matches = cover.symbols.filter((s) => normalizeSymbol(s.symbol) === target);
  const dimensioned = matches.find((s) => s.member !== null);
  if (dimensioned) {
    const found = latest(cover.classes.filter((c) => c.member === dimensioned.member));
    if (found) return { ok: true, member: found.member, shares: found.shares, asOfDate: found.asOfDate, via: "symbol_dimension" };
    // El miembro del símbolo no tiene cifra propia (p. ej. miembro de la empresa distinto del de la portada):
    // se sigue con la cifra única o con el título del valor.
  }
  const undimensioned = cover.classes.filter((c) => c.member === null);
  const dimensionedClasses = cover.classes.filter((c) => c.member !== null);
  if (dimensionedClasses.length === 0) {
    const found = latest(undimensioned);
    return found ? { ok: true, member: null, shares: found.shares, asOfDate: found.asOfDate, via: "single_class" } : { ok: false, reason: "No cover-page shares in the filing" };
  }
  if (matches.length === 0) return { ok: false, reason: `Ticker ${ticker} is not among the filing's trading symbols` };
  const title = (dimensioned ?? matches[0])?.title ?? "";
  const letter = title.match(/\bClass\s+([A-Z])(?:-?(\d))?\b/i);
  const members = [...new Set(dimensionedClasses.map((c) => c.member as string))];
  const candidates = letter
    ? members.filter((m) => new RegExp(`Class${letter[1]?.toUpperCase()}${letter[2] ?? ""}Member$`).test(localName(m)))
    : members.filter((m) => !/Class[A-Z]\d?Member$/.test(localName(m)) && !/Nonvoting/i.test(localName(m)));
  if (candidates.length !== 1) return { ok: false, reason: `Cannot map "${title || ticker}" to one share class (${candidates.length} candidates)` };
  const found = latest(dimensionedClasses.filter((c) => c.member === candidates[0]));
  return found ? { ok: true, member: found.member, shares: found.shares, asOfDate: found.asOfDate, via: "security_title" } : { ok: false, reason: "No cover shares for the mapped class" };
}

export const CLASS_CHECK_TOLERANCE = 0.15;

export type ClassCheck =
  | { status: "consistent"; rule: "class_weighted_average" | "all_classes_total" | "listed_class_total"; reference: number; referenceKind: "basic" | "diluted"; periodEnd: string; deviation: number }
  | { status: "inconsistent" | "no_reference"; reason: string; deviation: number | null };

/**
 * Comprobación independiente de la cifra de portada con las medias ponderadas del BPA del MISMO filing:
 *   1. media de la MISMA clase (si el filing reporta BPA por clase) — si existe y no cuadra ⇒ inconsistente;
 *   2. suma de todas las clases ordinarias vs media total;
 *   3. solo la clase cotizada vs media total (estructuras donde el BPA solo cuenta esa clase, p. ej. Up-C).
 * Tolerancia ±15 % (recompras, emisiones y dilución entre el periodo y la fecha de portada).
 */
export function checkClassShares(cover: CoverData, resolved: Extract<ClassResolution, { ok: true }>): ClassCheck {
  const within = (a: number, b: number) => Math.abs(a / b - 1);
  const best = (shares: number, avg: WeightedAverage | undefined) => {
    const opts = (["basic", "diluted"] as const).flatMap((k) => (avg?.[k] && (avg[k] as number) > 0 ? [{ kind: k, ref: avg[k] as number, dev: within(shares, avg[k] as number) }] : []));
    return opts.sort((a, b) => a.dev - b.dev)[0] ?? null;
  };
  if (resolved.member !== null) {
    const own = cover.weightedAverages.find((w) => w.member === resolved.member);
    const b = best(resolved.shares, own);
    if (b) {
      return b.dev <= CLASS_CHECK_TOLERANCE
        ? { status: "consistent", rule: "class_weighted_average", reference: b.ref, referenceKind: b.kind, periodEnd: (own as WeightedAverage).periodEnd, deviation: b.dev }
        : { status: "inconsistent", reason: `Class shares differ ${(b.dev * 100).toFixed(1)}% from the class weighted-average shares`, deviation: b.dev };
    }
  }
  // Clase única cuyo BPA se etiqueta con un único miembro de clase (p. ej. BKR): esa media es la del emisor.
  const total = cover.weightedAverages.find((w) => w.member === null) ?? (resolved.member === null && cover.weightedAverages.length === 1 ? cover.weightedAverages[0] : undefined);
  if (!total) return { status: "no_reference", reason: resolved.member ? "No weighted-average shares for this class or in total (e.g. reported only as class equivalents)" : "No weighted-average shares in the filing", deviation: null };
  const asOf = resolved.asOfDate;
  const latestPerClass = new Map<string, number>();
  for (const c of cover.classes) if (c.member !== null && c.asOfDate === asOf) latestPerClass.set(c.member, c.shares);
  const sum = resolved.member === null ? resolved.shares : [...latestPerClass.values()].reduce((s, v) => s + v, 0);
  const all = best(sum, total);
  if (all && all.dev <= CLASS_CHECK_TOLERANCE) {
    return { status: "consistent", rule: resolved.member === null ? "all_classes_total" : "all_classes_total", reference: all.ref, referenceKind: all.kind, periodEnd: total.periodEnd, deviation: all.dev };
  }
  if (resolved.member !== null) {
    const listed = best(resolved.shares, total);
    if (listed && listed.dev <= CLASS_CHECK_TOLERANCE) {
      return { status: "consistent", rule: "listed_class_total", reference: listed.ref, referenceKind: listed.kind, periodEnd: total.periodEnd, deviation: listed.dev };
    }
  }
  return { status: "inconsistent", reason: `Cover-page shares differ ${all ? (all.dev * 100).toFixed(1) : "?"}% from the reported weighted-average shares`, deviation: all?.dev ?? null };
}
