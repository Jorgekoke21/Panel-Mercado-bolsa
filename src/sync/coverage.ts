import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_LINE_ITEMS, type LineItemCode } from "@/domain/fundamentals";
import { VALUATION_METRICS, type ValuationMetric } from "@/domain/valuation";
import type { Database } from "@/data/supabase/database.types";
import { num, rowToAdjustmentFactor } from "@/data/supabase/market-mappers";
import { adjustBars, reconcileWithProviderAdjusted } from "@/lib/calculations/adjustments";
import { FCF_DIVERGENCE_THRESHOLD, relativeDifference } from "@/lib/calculations/derived-financials";
import { isLikelyMultiClass, type MarketCapCheck, verifyMarketCap } from "@/lib/calculations/market-cap";
import { subtractCalendar } from "@/lib/calculations/period-returns";
import { EODHD_LINE_ITEM_MAP } from "@/providers/eodhd/mappers";
import { classifyPilot, PILOT_CHECKS, type PilotCell, type PilotCheck } from "./pilot-matrix";
import type { SyncStore, SyncSecurity } from "./store";

/**
 * Informe de cobertura del piloto: qué hay en NUESTRA base de datos para cada valor.
 * Lo que no existe se marca MISSING; nunca se rellena.
 */
export interface CoverageRow {
  ticker: string;
  identifier: { symbol: string; source: string; verified: boolean; note: string | null } | null;
  prices: { count: number; first: string | null; last: string | null; lastClose: number | null };
  splits: number;
  dividends: number;
  unsupportedActions: string[];
  factors: number;
  reconciliation: { compared: number; maxDeviation: number | null; worstDate: string | null };
  /** Solo valores del PROVEEDOR. */
  lineItems: Record<LineItemCode, { quarterly: number; annual: number }>;
  /** EPS calculado por MarketRadar: periodos con valor y periodos NULL por motivo. */
  calculatedEps: { computed: number; missing: Record<string, number> };
  providerEarningsEps: number;
  fcf: { provider: number; calculated: number; divergences: { period: string; provider: number; calculated: number; relativeDifference: number }[] };
  shares: { lastPeriodEnd: string | null; current: string | null };
  marketCap: MarketCapCheck;
  earnings: { events: number; lastReported: string | null; nextReport: string | null; withSurprise: number; withTiming: number };
  estimates: number;
  valuation: Partial<Record<ValuationMetric, { asOf: string }>>;
  matrix: Record<PilotCheck, PilotCell>;
}

type Db = SupabaseClient<Database>;

const PAGE = 1000; // max_rows de PostgREST

type RangeQuery<T> = { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> };

/** Lee todas las filas paginando (PostgREST corta en max_rows). */
async function all<T>(query: RangeQuery<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Partidas que EODHD sí publica (las demás son MISSING por diseño del proveedor). */
const PROVIDER_MAPPED_ITEMS = CANONICAL_LINE_ITEMS.filter((i) => EODHD_LINE_ITEM_MAP[i.code].fields.length > 0).map((i) => i.code);

export async function collectCoverage(db: Db, store: SyncStore, security: SyncSecurity, provider: string, today: string): Promise<CoverageRow> {
  const sid = security.securityId;
  const cid = security.companyId;
  const [identifiers, actions, factorRows, statements, shares, events, estimates, valuations, listings, stored] = await Promise.all([
    all(db.from("security_identifiers").select("symbol, source, verified_at, verification_note").eq("security_id", sid).eq("provider", provider).is("valid_to", null)),
    all(db.from("corporate_actions").select("action_type, support_status, ex_date, unsupported_reason").eq("security_id", sid)),
    all(db.from("adjustment_factors").select("*").eq("security_id", sid)),
    all(
      db
        .from("financial_statement_values")
        .select("line_item_code, period_type, fiscal_period_end, value_origin, value, missing_reason")
        .eq("company_id", cid)
        .eq("source", provider)
        .order("line_item_code")
        .order("period_type")
        .order("fiscal_period_end")
        .order("value_origin"),
    ),
    all(db.from("shares_outstanding").select("as_of_date, basis, shares").eq("security_id", sid).order("as_of_date")),
    all(db.from("earnings_events").select("fiscal_period_end, report_date, provider_eps_actual, provider_eps_surprise, report_timing").eq("company_id", cid)),
    all(db.from("earnings_estimates").select("period_code").eq("company_id", cid)),
    all(db.from("valuation_snapshots").select("metric, as_of_date, value, value_origin").eq("security_id", sid).eq("value_origin", "provider")),
    all(db.from("securities").select("id").eq("company_id", cid)),
    store.getDailyBars(sid),
  ]);

  const identifier = identifiers[0];
  const bars = stored.bars;
  const factors = factorRows.map(rowToAdjustmentFactor);
  const adjusted = adjustBars(bars, factors, { mode: "total_return", volumeBasis: stored.volumeBasis ?? "split_adjusted" });
  const reconciliation = reconcileWithProviderAdjusted(bars, adjusted);

  const lineItems = Object.fromEntries(CANONICAL_LINE_ITEMS.map((i) => [i.code, { quarterly: 0, annual: 0 }])) as CoverageRow["lineItems"];
  const calculatedEps: CoverageRow["calculatedEps"] = { computed: 0, missing: {} };
  const fcfProvider = new Map<string, number>();
  const fcfCalculated = new Map<string, number>();
  for (const s of statements) {
    const code = s.line_item_code as LineItemCode;
    const period = `${s.period_type} ${s.fiscal_period_end}`;
    if (s.value_origin === "provider") {
      const entry = lineItems[code];
      if (entry) entry[s.period_type === "annual" ? "annual" : "quarterly"]++;
      if (code === "free_cash_flow" && s.value !== null) fcfProvider.set(period, num(s.value));
    } else {
      if (code === "eps_basic" || code === "eps_diluted") {
        if (s.value !== null) calculatedEps.computed++;
        else if (s.missing_reason) calculatedEps.missing[s.missing_reason] = (calculatedEps.missing[s.missing_reason] ?? 0) + 1;
      }
      if (code === "free_cash_flow" && s.value !== null) fcfCalculated.set(period, num(s.value));
    }
  }
  const divergences: CoverageRow["fcf"]["divergences"] = [];
  for (const [period, provided] of fcfProvider) {
    const calculated = fcfCalculated.get(period);
    if (calculated === undefined) continue;
    const diff = relativeDifference(provided, calculated);
    if (diff > FCF_DIVERGENCE_THRESHOLD) divergences.push({ period, provider: provided, calculated, relativeDifference: diff });
  }
  divergences.sort((a, b) => a.period.localeCompare(b.period));

  const reported = events.filter((e) => e.provider_eps_actual !== null).map((e) => e.report_date ?? e.fiscal_period_end).sort();
  const upcoming = events.filter((e) => e.provider_eps_actual === null && e.report_date !== null && e.report_date >= today).map((e) => e.report_date as string).sort();
  const latestShares = (basis: string) => shares.filter((s) => s.basis === basis).at(-1) ?? null;
  const newestShares = shares.reduce<(typeof shares)[number] | null>((acc, s) => (!acc || s.as_of_date >= acc.as_of_date ? s : acc), null);

  const valuation: CoverageRow["valuation"] = {};
  let providerMarketCap: { value: number; asOfDate: string } | null = null;
  for (const v of valuations) {
    const metric = v.metric as ValuationMetric;
    const current = valuation[metric];
    if (!current || v.as_of_date > current.asOf) valuation[metric] = { asOf: v.as_of_date };
    if (metric === "market_cap" && (!providerMarketCap || v.as_of_date > providerMarketCap.asOfDate)) providerMarketCap = { value: num(v.value), asOfDate: v.as_of_date };
  }

  const last = bars.at(-1) ?? null;
  const marketCap = verifyMarketCap({
    price: last?.close ?? null,
    priceDate: last?.tradeDate ?? null,
    shares: newestShares ? { value: num(newestShares.shares), asOfDate: newestShares.as_of_date } : null,
    providerMarketCap,
    isMultiClass: isLikelyMultiClass({ ticker: security.ticker, shareClass: null, listingsOfIssuer: listings.length }),
  });

  const presentProviderItems = PROVIDER_MAPPED_ITEMS.filter((code) => lineItems[code].quarterly + lineItems[code].annual > 0).length;
  const matrix = classifyPilot({
    identifier: identifier ? { symbol: identifier.symbol, verified: identifier.verified_at !== null } : null,
    prices: { count: bars.length, first: bars[0]?.tradeDate ?? null, last: last?.tradeDate ?? null },
    today,
    required5yStart: last ? subtractCalendar(last.tradeDate, { years: 5 }) : null,
    splits: actions.filter((a) => a.action_type === "split").length,
    dividends: actions.filter((a) => a.action_type === "cash_dividend").length,
    unsupportedActions: actions.filter((a) => a.support_status === "unsupported").length,
    shares: { lastPeriodEnd: latestShares("period_end")?.as_of_date ?? null, current: latestShares("current")?.as_of_date ?? null },
    marketCap: { status: marketCap.status, reason: marketCap.reason },
    fundamentals: { expected: PROVIDER_MAPPED_ITEMS.length, present: presentProviderItems, fcfDivergences: divergences.length },
    earnings: { events: events.length },
    valuation: { providerMetrics: Object.keys(valuation).length },
    reconciliation: { compared: reconciliation.compared, maxDeviation: reconciliation.maxRelativeDeviation },
    factors: factors.length,
  });

  return {
    ticker: security.ticker,
    identifier: identifier
      ? { symbol: identifier.symbol, source: identifier.source, verified: identifier.verified_at !== null, note: identifier.verification_note }
      : null,
    prices: { count: bars.length, first: bars[0]?.tradeDate ?? null, last: last?.tradeDate ?? null, lastClose: last?.close ?? null },
    splits: actions.filter((a) => a.action_type === "split").length,
    dividends: actions.filter((a) => a.action_type === "cash_dividend").length,
    unsupportedActions: actions.filter((a) => a.support_status === "unsupported").map((a) => `${a.action_type} ${a.ex_date}: ${a.unsupported_reason}`),
    factors: factors.length,
    reconciliation: { compared: reconciliation.compared, maxDeviation: reconciliation.maxRelativeDeviation, worstDate: reconciliation.worstDate },
    lineItems,
    calculatedEps,
    providerEarningsEps: events.filter((e) => e.provider_eps_actual !== null).length,
    fcf: { provider: fcfProvider.size, calculated: fcfCalculated.size, divergences },
    shares: { lastPeriodEnd: latestShares("period_end")?.as_of_date ?? null, current: latestShares("current")?.as_of_date ?? null },
    marketCap,
    earnings: {
      events: events.length,
      lastReported: reported.at(-1) ?? null,
      nextReport: upcoming[0] ?? null,
      withSurprise: events.filter((e) => e.provider_eps_surprise !== null).length,
      withTiming: events.filter((e) => e.report_timing !== null).length,
    },
    estimates: estimates.length,
    valuation,
    matrix,
  };
}

const MISSING = "**MISSING**";
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)}%`);

export function renderCoverageMarkdown(rows: readonly CoverageRow[], meta: { generatedAt: string; provider: string }): string {
  const lines: string[] = [];
  const header = () => {
    lines.push("| Check | " + rows.map((r) => r.ticker).join(" | ") + " |");
    lines.push("|---|" + rows.map(() => "---").join("|") + "|");
  };
  const row = (label: string, cell: (r: CoverageRow) => string) => lines.push(`| ${label} | ${rows.map(cell).join(" | ")} |`);

  lines.push(`# Fase 2B.1 — Informe de cobertura del piloto`, "");
  lines.push(`Generado: ${meta.generatedAt} · Proveedor: ${meta.provider} · Fuente: base de datos local (datos sincronizados).`, "");
  lines.push("Regenerar: `npm run sync -- validate`. PASS / MISSING (el proveedor no lo da) / WARNING / FAIL (fallo del pipeline).", "");

  lines.push("## Matriz", "");
  header();
  for (const check of PILOT_CHECKS) row(check, (r) => r.matrix[check].status);
  lines.push("");
  lines.push("## Detalle de la matriz", "");
  header();
  for (const check of PILOT_CHECKS) row(check, (r) => `${r.matrix[check].status}: ${r.matrix[check].detail}`);
  lines.push("");

  lines.push("## Fundamentales del proveedor por partida (trimestres / años)", "");
  header();
  for (const item of CANONICAL_LINE_ITEMS) {
    row(`\`${item.code}\``, (r) => {
      const c = r.lineItems[item.code];
      return c.quarterly + c.annual === 0 ? MISSING : `${c.quarterly} / ${c.annual}`;
    });
  }
  lines.push("");

  lines.push("## EPS", "");
  header();
  row("GAAP EPS calculated (periods with value)", (r) => String(r.calculatedEps.computed));
  row("GAAP EPS calculated = NULL (reason × periods)", (r) =>
    Object.entries(r.calculatedEps.missing).map(([reason, n]) => `${reason} × ${n}`).join("<br>") || "—",
  );
  row("Provider earnings EPS (EODHD, basis unspecified)", (r) => String(r.providerEarningsEps));
  lines.push("");

  lines.push("## FCF (proveedor vs calculado = OCF − capex)", "");
  header();
  row("Provider FCF periods", (r) => String(r.fcf.provider));
  row("Calculated FCF periods", (r) => String(r.fcf.calculated));
  row(`Material divergences (> ${FCF_DIVERGENCE_THRESHOLD * 100}%)`, (r) => String(r.fcf.divergences.length));
  lines.push("");
  const divergences = rows.flatMap((r) => r.fcf.divergences.map((d) => `- ${r.ticker} ${d.period}: provider ${d.provider} vs calculated ${d.calculated} (${pct(d.relativeDifference)})`));
  if (divergences.length > 0) lines.push(...divergences, "");

  lines.push("## Market cap", "");
  header();
  row("Status", (r) => r.marketCap.status);
  row("Reason", (r) => r.marketCap.reason);
  row("Calculated (price × shares)", (r) => (r.marketCap.calculated === null ? "—" : r.marketCap.calculated.toExponential(4)));
  row("Provider market cap", (r) => (r.marketCap.providerReference === null ? "—" : r.marketCap.providerReference.toExponential(4)));
  row("Deviation", (r) => pct(r.marketCap.deviation));
  lines.push("");

  lines.push("## Valoración (valores del proveedor)", "");
  header();
  for (const metric of VALUATION_METRICS) row(`\`${metric}\``, (r) => (r.valuation[metric] ? `✓ ${r.valuation[metric]?.asOf}` : MISSING));
  lines.push("");

  lines.push("## Earnings", "");
  header();
  row("Events", (r) => String(r.earnings.events));
  row("Last reported / next", (r) => `${r.earnings.lastReported ?? "—"} / ${r.earnings.nextReport ?? "—"}`);
  row("With surprise (actual & estimate)", (r) => `${r.earnings.withSurprise}/${r.earnings.events}`);
  row("With before/after market", (r) => `${r.earnings.withTiming}/${r.earnings.events}`);
  row("Consensus estimates", (r) => String(r.estimates));
  lines.push("");

  lines.push("## Series ajustadas (total return vs adjusted_close del proveedor)", "");
  header();
  row("Compared sessions", (r) => String(r.reconciliation.compared));
  row("Max deviation (date)", (r) => (r.reconciliation.maxDeviation === null ? MISSING : `${pct(r.reconciliation.maxDeviation)} (${r.reconciliation.worstDate})`));
  lines.push("");

  lines.push("## Acciones corporativas no soportadas", "");
  const unsupported = rows.flatMap((r) => r.unsupportedActions.map((u) => `- ${r.ticker}: ${u}`));
  lines.push(...(unsupported.length > 0 ? unsupported : ["Ninguna."]), "");
  return lines.join("\n");
}
