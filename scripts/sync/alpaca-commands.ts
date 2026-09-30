/**
 * Comandos Alpaca (plan Basic gratuito; requiere ALPACA_API_KEY_ID y ALPACA_API_SECRET_KEY, o los
 * nombres de la consola ALPACA_API_KEY / ALPACA_SECRET_KEY).
 *
 *   alpaca [--tickers AAPL,JPM | --index sp500]
 *       calendario → identificadores → verificación (catálogo de activos, 1 petición) → precios diarios
 *       SIN ajustar (por lotes, incremental) → acciones corporativas (por lotes) → análisis por serie
 *       (factores + calidad PASS/WARNING/MISSING/FAIL + indicadores + market cap).
 *       Reanudable: cada security guarda su cursor al escribir; repetir el comando continúa donde quedó.
 *   alpaca-report     → docs/data/price-coverage.md (estado de cada serie, sin llamar a Alpaca)
 *   alpaca-validate [--tickers …] → concilia los ajustes de MarketRadar con los de Alpaca (split / all)
 *                                    → docs/data/alpaca-validation.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireSyncSecret } from "@/config/sync-env";
import { adjustBars, computeAdjustmentFactors } from "@/lib/calculations/adjustments";
import { AlpacaAdapter, alpacaSymbology } from "@/providers/alpaca/adapter";
import { AlpacaClient } from "@/providers/alpaca/client";
import { GroupIndexAccumulator } from "@/lib/calculations/synthetic-index";
import {
  analyzePriceSeries,
  groupIndexSessions,
  persistGroupIndices,
  type JobReport,
  resolveTargets,
  type SeriesOutcome,
  type SyncContext,
  syncCorporateActions,
  syncDailyPrices,
  syncMarketCalendar,
  verifyIdentifiers,
} from "@/sync/jobs";
import { argValue, type CommandDeps, parseTickers } from "./shared";
import { SEC_VALIDATION_TICKERS } from "./sec-commands";

export const ALPACA_COMMANDS = ["alpaca", "alpaca-report", "alpaca-validate"] as const;

const REPORT_DIR = path.join(process.cwd(), "docs", "data");

function createAdapter(deps: CommandDeps) {
  return new AlpacaAdapter(new AlpacaClient({ keyId: requireSyncSecret(deps.env, "ALPACA_API_KEY_ID"), secretKey: requireSyncSecret(deps.env, "ALPACA_API_SECRET_KEY") }));
}

async function tickersFrom(args: string[], deps: CommandDeps): Promise<{ tickers: string[]; scope: string }> {
  const index = argValue(args, "--index");
  if (index) return { tickers: (await deps.store.listIndexSecurities(index)).map((s) => s.ticker), scope: `index:${index}` };
  const tickers = parseTickers(args, SEC_VALIDATION_TICKERS);
  return { tickers, scope: `tickers:${tickers.join(",")}` };
}

export async function runAlpacaCommand(command: string, args: string[], deps: CommandDeps): Promise<void> {
  if (command === "alpaca-report") return writeCoverageReport(deps);
  if (command === "alpaca-validate") return validateAdjustments(args, deps);
  if (command !== "alpaca") throw new Error(`Unknown Alpaca command: ${command}`);
  const { tickers, scope } = await tickersFrom(args, deps);
  const index = argValue(args, "--index");
  const result = await runPricePipeline(deps, { tickers, scope, groupIndices: !!index, indexSlug: index });
  process.exitCode = result.failed ? 1 : 0;
}

export interface PricePipelineResult {
  counts: Record<"PASS" | "WARNING" | "MISSING" | "FAIL", number>;
  seconds: number;
  requests: number;
  /** Algún job terminó en `failed` (ninguna security procesada). */
  failed: boolean;
  runIds: string[];
}

/**
 * Pipeline completo de precios (Alpaca): calendario → identidades → precios → acciones corporativas →
 * análisis por serie → índices sintéticos (solo con el universo completo: un subconjunto daría grupos
 * incompletos). Lo usan `alpaca` y el sync automático.
 */
export async function runPricePipeline(
  deps: CommandDeps,
  input: { tickers: string[]; scope: string; groupIndices: boolean; indexSlug?: string },
): Promise<PricePipelineResult> {
  const { store, log } = deps;
  const started = Date.now();
  const adapter = createAdapter(deps);
  const ctx: SyncContext = { adapter, store, now: () => new Date(), log, scope: input.scope };
  const reports: JobReport[] = [];

  reports.push(await syncMarketCalendar(ctx));
  const { targets, unresolved } = await resolveTargets(ctx, alpacaSymbology, input.tickers);
  for (const u of unresolved) log(`  ✗ ${u.security} [${u.kind}] ${u.message}`);
  // Serie sintética del conjunto de constituyentes (además de sectores e industrias).
  if (input.indexSlug) for (const t of targets) t.security.groups = [...(t.security.groups ?? []), `index:${input.indexSlug}`];
  if (targets.some((t) => !t.identifier.verifiedAt)) log(`  asset catalogue: ${await adapter.prefetchAssets()} active US equities`);
  reports.push(await verifyIdentifiers(ctx, targets, (t) => adapter.verifyIdentifier(t.symbol, { exchangeMic: t.security.exchangeMic, companyNames: [t.security.companyName, ...(t.security.alternateNames ?? [])] })));
  const verified = targets.filter((t) => t.identifier.verifiedAt);
  reports.push(await syncDailyPrices(ctx, verified));
  reports.push(await syncCorporateActions(ctx, verified));
  const outcomes: SeriesOutcome[] = [];
  const accumulator = input.groupIndices ? new GroupIndexAccumulator(await groupIndexSessions(ctx)) : undefined;
  reports.push(await analyzePriceSeries(ctx, targets, outcomes, accumulator));
  if (accumulator) reports.push(await persistGroupIndices(ctx, accumulator));

  // Resumen PASS / WARNING / MISSING / FAIL por security (incluye las no resueltas o sin verificar).
  const failed = new Map<string, string>();
  for (const r of reports) for (const e of r.errors) if (e.security) failed.set(e.security, `${e.kind}: ${e.message}`);
  const counts: PricePipelineResult["counts"] = { PASS: 0, WARNING: 0, MISSING: 0, FAIL: 0 };
  for (const o of outcomes) counts[o.status] += 1;
  const analysed = new Set(outcomes.map((o) => o.ticker));
  const extraFails = [...unresolved.map((u) => u.security ?? "?"), ...targets.filter((t) => !analysed.has(t.security.ticker)).map((t) => t.security.ticker)];
  counts.FAIL += extraFails.length;
  const seconds = (Date.now() - started) / 1000;
  log(`\nAlpaca sync · ${seconds.toFixed(0)} s · HTTP requests ${adapter.requestCount} · ${verified.length}/${targets.length} identifiers verified`);
  log(`  PASS ${counts.PASS} · WARNING ${counts.WARNING} · MISSING ${counts.MISSING} · FAIL ${counts.FAIL}`);
  for (const o of outcomes.filter((x) => x.status !== "PASS")) {
    log(`  ${o.status.padEnd(7)} ${o.ticker.padEnd(6)} ${o.notes.filter((n) => n.severity !== "info").map((n) => n.kind).join(", ")}`);
  }
  for (const t of extraFails) log(`  FAIL    ${t.padEnd(6)} ${failed.get(t) ?? "not analysed"}`);
  return { counts, seconds, requests: adapter.requestCount, failed: reports.some((r) => r.status === "failed"), runIds: reports.map((r) => r.runId) };
}

// --- Informe de cobertura -------------------------------------------------------------------------------

async function writeCoverageReport(deps: CommandDeps) {
  const { db, log } = deps;
  const universe = await deps.store.listIndexSecurities("sp500");
  const series = await db.from("price_series").select("security_id, source, feed, first_date, last_date, bar_count, quality_status, quality_notes, last_ingested_at");
  if (series.error) throw new Error(series.error.message);
  const snaps = await db.from("security_market_snapshots").select("security_id, as_of_date, market_cap_status, market_cap_reason, ema200, return_5y");
  if (snaps.error) throw new Error(snaps.error.message);
  const bySecurity = new Map(series.data.map((s) => [s.security_id, s]));
  const snapBySecurity = new Map(snaps.data.map((s) => [s.security_id, s]));
  const statusCount = new Map<string, number>();
  const capCount = new Map<string, number>();
  const rows: string[] = [];
  let bars = 0;
  for (const sec of universe) {
    const s = bySecurity.get(sec.securityId);
    const snap = snapBySecurity.get(sec.securityId);
    const status = s?.quality_status ?? "MISSING";
    statusCount.set(status, (statusCount.get(status) ?? 0) + 1);
    if (snap) capCount.set(`${snap.market_cap_status} (${snap.market_cap_reason})`, (capCount.get(`${snap.market_cap_status} (${snap.market_cap_reason})`) ?? 0) + 1);
    bars += s?.bar_count ?? 0;
    const notes = Array.isArray(s?.quality_notes) ? (s.quality_notes as { severity: string; kind: string; message: string }[]) : [];
    const issues = notes.filter((n) => n.severity !== "info");
    if (status !== "PASS") rows.push(`| ${sec.ticker} | ${status} | ${s?.first_date ?? "—"} | ${s?.last_date ?? "—"} | ${s?.bar_count ?? 0} | ${issues.map((n) => n.message.replace(/\|/g, "/")).join("<br>") || "—"} |`);
  }
  const lines = [
    "# Cobertura de precios (Alpaca SIP) — S&P 500",
    "",
    `Generado: ${new Date().toISOString()} · \`npm run sync -- alpaca-report\``,
    "",
    `Securities del índice: **${universe.length}** · con serie: **${series.data.length}** · barras almacenadas: **${bars.toLocaleString("en-US")}**`,
    "",
    "| Estado | Securities |",
    "|---|---|",
    ...["PASS", "WARNING", "MISSING", "FAIL"].map((k) => `| ${k} | ${statusCount.get(k) ?? 0} |`),
    "",
    "## Capitalización (tamaño del heatmap)",
    "",
    "| Estado (motivo) | Securities |",
    "|---|---|",
    ...[...capCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Series con incidencias",
    "",
    "| Ticker | Estado | Desde | Hasta | Barras | Motivos |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ];
  await mkdir(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, "price-coverage.md");
  await writeFile(file, lines.join("\n"), "utf8");
  log(`Coverage report → ${path.relative(process.cwd(), file)}`);
  for (const k of ["PASS", "WARNING", "MISSING", "FAIL"]) log(`  ${k}: ${statusCount.get(k) ?? 0}`);
}

// --- Conciliación de ajustes con Alpaca -----------------------------------------------------------------------

async function validateAdjustments(args: string[], deps: CommandDeps) {
  const { store, log } = deps;
  const adapter = createAdapter(deps);
  const tickers = parseTickers(args, SEC_VALIDATION_TICKERS);
  const lines = [
    "# Conciliación de ajustes: MarketRadar vs Alpaca",
    "",
    `Generado: ${new Date().toISOString()} · \`npm run sync -- alpaca-validate\``,
    "",
    "MarketRadar calcula sus series ajustadas a partir de barras SIN ajustar + acciones corporativas (split: ratio; dividendos: método CRSP `1 − D / cierre previo`). Aquí se comparan con las series que ajusta la propia Alpaca (`adjustment=split` y `adjustment=all`), que solo se descargan para esta comprobación.",
    "",
    "| Ticker | Sesiones | Split: máx. dif. | Split: sesiones > 0,01 % | Total return vs `all`: máx. dif. | Mediana dif. `all` | Splits | Dividendos |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const ticker of tickers) {
    const [sec] = await store.findSecuritiesByTicker([ticker]);
    if (!sec) continue;
    const identifier = await store.getActiveIdentifier("alpaca", sec.securityId);
    const stored = await store.getDailyBars(sec.securityId);
    if (!identifier || stored.bars.length === 0) {
      lines.push(`| ${ticker} | — | sin datos | | | | | |`);
      continue;
    }
    const actions = await store.getCorporateActions(sec.securityId, stored.source ?? undefined);
    const { factors } = computeAdjustmentFactors(stored.bars, actions);
    const range = { from: stored.bars[0]?.tradeDate as string, to: stored.bars.at(-1)?.tradeDate as string };
    const symbol = { provider: "alpaca", symbol: identifier.symbol };
    const [theirSplit, theirAll] = [await adapter.getProviderAdjustedCloses(symbol, range, "split"), await adapter.getProviderAdjustedCloses(symbol, range, "all")];
    const compare = (ours: { tradeDate: string; close: number }[], theirs: Map<string, number>) => {
      const diffs: number[] = [];
      for (const b of ours) {
        const t = theirs.get(b.tradeDate);
        if (t) diffs.push(Math.abs(b.close / t - 1));
      }
      diffs.sort((a, b) => a - b);
      return { n: diffs.length, max: diffs.at(-1) ?? 0, median: diffs[Math.floor(diffs.length / 2)] ?? 0, over: diffs.filter((d) => d > 1e-4).length };
    };
    const split = compare(adjustBars(stored.bars, factors, { mode: "split", volumeBasis: "raw" }), theirSplit);
    const total = compare(adjustBars(stored.bars, factors, { mode: "total_return", volumeBasis: "raw" }), theirAll);
    const pct = (x: number) => `${(x * 100).toFixed(4)} %`;
    const nSplits = actions.filter((a) => a.kind === "split").length;
    const nDivs = actions.filter((a) => a.kind === "cash_dividend").length;
    lines.push(`| ${ticker} | ${split.n} | ${pct(split.max)} | ${split.over} | ${pct(total.max)} | ${pct(total.median)} | ${nSplits} | ${nDivs} |`);
    log(`  ${ticker}: split max ${pct(split.max)} (${split.over} > 0.01%) · total-return vs all max ${pct(total.max)} median ${pct(total.median)} · splits ${nSplits} · dividends ${nDivs}`);
  }
  lines.push(
    "",
    "Las diferencias de total return son esperables: Alpaca ajusta los dividendos con otro método (no documentado públicamente) y MarketRadar usa CRSP con el cierre SIN ajustar de la sesión anterior a la fecha ex. La serie por defecto de MarketRadar es price return (solo splits): coincide con la de Alpaca salvo el redondeo que Alpaca aplica a sus precios ajustados (3–4 cifras; p. ej. NVDA 136,22 / 40 = 3,4055 → 3,406). MarketRadar conserva la precisión completa.",
    "",
  );
  await mkdir(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, "alpaca-validation.md");
  await writeFile(file, lines.join("\n"), "utf8");
  log(`Validation report → ${path.relative(process.cwd(), file)} · HTTP requests ${adapter.requestCount}`);
}
