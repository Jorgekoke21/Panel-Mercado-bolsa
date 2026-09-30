/**
 * Comandos del proveedor EODHD (Fase 2B.1). Siguen disponibles aunque MarketRadar funcione a 0 €/mes
 * sin EODHD: el adaptador se conserva como opción futura (precios globales).
 *
 *   preflight [--probe] · pilot · validate · idempotency · usage   (requieren EODHD_API_TOKEN)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { requireSyncSecret } from "@/config/sync-env";
import { EodhdAdapter } from "@/providers/eodhd/adapter";
import { EodhdClient } from "@/providers/eodhd/client";
import { eodhdSymbology } from "@/providers/eodhd/symbology";
import { collectCoverage, renderCoverageMarkdown } from "@/sync/coverage";
import { computeFactors, type JobReport, resolveTargets, type SyncContext, syncCorporateActions, syncDailyPrices, syncFundamentals } from "@/sync/jobs";
import { renderPreflight, runPreflight } from "@/sync/preflight";
import { type CommandDeps, parseTickers } from "./shared";

export const EODHD_COMMANDS = ["preflight", "pilot", "validate", "idempotency", "usage"] as const;

const COVERAGE_PATH = resolve(process.cwd(), "docs/pilot/2b1-coverage.md");
const COUNTED_TABLES = [
  "security_identifiers",
  "price_series",
  "daily_bars",
  "corporate_actions",
  "adjustment_factors",
  "shares_outstanding",
  "financial_statement_values",
  "earnings_events",
  "earnings_estimates",
  "valuation_snapshots",
  "sync_cursors",
] as const;


export async function runEodhdCommand(command: string, args: string[], deps: CommandDeps): Promise<void> {
  const tickers = parseTickers(args);

  const { env, db, store, log } = deps;
  const adapter = new EodhdAdapter(new EodhdClient({ token: requireSyncSecret(env, "EODHD_API_TOKEN") }));
  const ctx: SyncContext = { adapter, store, now: () => new Date(), log, scope: `pilot:${tickers.join(",")}` };

  /** Créditos que necesita el piloto según el modelo de coste del adaptador. */
  const cost = adapter.costModel.creditsPerCall;
  const requiredCredits = tickers.length * ((cost.fundamentals ?? 0) + (cost.price_history ?? 0) + 2 * (cost.corporate_actions ?? 0));

  /** Bloquea cualquier sincronización si el plan no la permite. */
  async function preflightGate(): Promise<boolean> {
    const report = await runPreflight(adapter, { now: new Date(), requiredCredits, probe: true });
    log(renderPreflight(report));
    if (report.status !== "READY") {
      log("\nSync not started: provider preflight is not READY. No data requests were made beyond the preflight.");
      process.exitCode = 2;
      return false;
    }
    return true;
  }

  async function runPilot(): Promise<JobReport[]> {
    const { targets, unresolved } = await resolveTargets(ctx, eodhdSymbology, tickers);
    for (const u of unresolved) log(`  ✗ ${u.security} [${u.kind}] ${u.message}`);
    const reports = [
      await syncFundamentals(ctx, targets),
      await syncDailyPrices(ctx, targets),
      await syncCorporateActions(ctx, targets),
    ];
    // Un split nuevo puede haber programado una recarga completa: se ejecuta antes de calcular factores.
    const refresh = [];
    for (const t of targets) {
      const cursor = await store.getCursor(adapter.id, "daily_prices", t.security.securityId);
      if (cursor?.fullRefreshRequired) refresh.push(t);
    }
    if (refresh.length > 0) reports.push(await syncDailyPrices(ctx, refresh));
    reports.push(await computeFactors(ctx, targets));
    const credits = reports.reduce((s, r) => s + (r.creditsUsed ?? 0), 0);
    const estimated = reports.reduce((s, r) => s + (r.creditsEstimated ?? 0), 0);
    log(`\nPilot finished · API credits used (measured): ${credits} · estimated: ${estimated} · HTTP requests: ${adapter.requestCount}`);
    return reports;
  }

  async function countRows(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(`count ${table}: ${error.message}`);
      out[table] = count ?? 0;
    }
    return out;
  }

  switch (command) {
    case "preflight": {
      const report = await runPreflight(adapter, { now: new Date(), requiredCredits, probe: args.includes("--probe") });
      log(renderPreflight(report));
      process.exitCode = report.status === "READY" ? 0 : 2;
      break;
    }
    case "pilot": {
      if (!(await preflightGate())) break;
      const reports = await runPilot();
      process.exitCode = reports.some((r) => r.status === "failed") ? 1 : 0;
      break;
    }
    case "validate": {
      const securities = await store.findSecuritiesByTicker(tickers);
      const ordered = tickers.map((t) => securities.find((s) => s.ticker === t)).filter((s) => s !== undefined);
      const today = new Date().toISOString().slice(0, 10);
      const rows = [];
      for (const s of ordered) rows.push(await collectCoverage(db, store, s, adapter.id, today));
      const markdown = renderCoverageMarkdown(rows, { generatedAt: new Date().toISOString(), provider: adapter.label });
      mkdirSync(dirname(COVERAGE_PATH), { recursive: true });
      writeFileSync(COVERAGE_PATH, `${markdown}\n`, "utf8");
      console.log(markdown);
      log(`\nWritten ${COVERAGE_PATH}`);
      break;
    }
    case "idempotency": {
      if (!(await preflightGate())) break;
      const before = await countRows();
      await runPilot();
      const after = await countRows();
      let identical = true;
      log("\nIdempotency check (row counts before → after re-running the pilot):");
      for (const table of COUNTED_TABLES) {
        const same = before[table] === after[table];
        identical &&= same;
        log(`  ${same ? "=" : "≠"} ${table}: ${before[table]} → ${after[table]}`);
      }
      log(identical ? "✓ No duplicates: counts unchanged." : "✗ Counts changed (see above; new EOD sessions can legitimately add price rows).");
      process.exitCode = identical ? 0 : 1;
      break;
    }
    case "usage": {
      const usage = await adapter.getUsage();
      log(
        usage
          ? `EODHD ${usage.subscriptionType ?? "?"} · ${usage.requestsToday} requests today (daily limit ${usage.dailyLimit ?? "n/a"}, extra ${usage.extraLimit ?? "n/a"}, counter date ${usage.date ?? "n/a"})`
          : "Usage not available",
      );
      break;
    }
    default:
      throw new Error(`Unknown EODHD command: ${command}`);
  }
}
