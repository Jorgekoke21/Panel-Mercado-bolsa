/**
 * Comandos SEC EDGAR / XBRL (gratuito, sin credenciales).
 *
 *   sec [--tickers AAPL,JPM | --index sp500] [--offline] [--max-age-hours 20] [--since 2016-01-01]
 *       descarga (o lee de caché) submissions + companyfacts, normaliza y guarda.
 *   sec-report
 *       resumen de cobertura por partida sobre lo guardado → docs/data/sec-coverage.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CANONICAL_LINE_ITEMS } from "@/domain/fundamentals";
import { SecClient } from "@/providers/sec/client";
import { isLikelyMultiClass } from "@/lib/calculations/market-cap";
import { CachedCoverSource, CachedSecSource } from "@/sync/sec-cache";
import { syncShareClasses } from "@/sync/share-class-job";
import { syncSecFundamentals } from "@/sync/sec-job";
import { argValue, type CommandDeps, parseTickers } from "./shared";

export const SEC_COMMANDS = ["sec", "sec-report", "sec-classes"] as const;

/** Casos de validación: industrial, semis, poco histórico, banco, aseguradora multiclase, patrimonio negativo. */
export const SEC_VALIDATION_TICKERS = ["AAPL", "NVDA", "PLTR", "JPM", "BRK.B", "ORLY"];
const CACHE_DIR = resolve(process.cwd(), "data/cache/sec");
const REPORT_PATH = resolve(process.cwd(), "docs/data/sec-coverage.md");
const DEFAULT_SINCE = "2016-01-01";

/** Descarga (o lee de caché) y normaliza los datos SEC de un conjunto de securities. Lo usan `sec` y `auto`. */
export async function runSecSync(
  deps: CommandDeps,
  securities: Awaited<ReturnType<CommandDeps["store"]["listIndexSecurities"]>>,
  options: { scope: string; offline?: boolean; maxAgeHours: number; since?: string },
) {
  const { env, store, log } = deps;
  const source = new CachedSecSource(new SecClient({ userAgent: env.SEC_USER_AGENT }), CACHE_DIR, { offline: options.offline ?? false, maxAgeHours: options.maxAgeHours });
  if (!env.SEC_USER_AGENT) log("  (SEC_USER_AGENT not set: using a generic User-Agent. The SEC asks for a contact e-mail — add it to .env.local.)");
  const t0 = Date.now();
  const report = await syncSecFundamentals({ store, now: () => new Date(), log, scope: options.scope }, source, securities, {
    minPeriodEnd: options.since ?? DEFAULT_SINCE,
    releasesSince: new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10),
    maxSubmissionPages: 12,
  });
  log(`  elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return report;
}

/**
 * Acciones por clase desde la portada XBRL del último 10-Q/10-K (EDGAR Archives; requiere SEC_USER_AGENT).
 * Solo para securities cuya capitalización no se verifica con companyfacts, multiclase o ya registradas.
 */
export async function runShareClassSync(deps: CommandDeps, securities: Awaited<ReturnType<CommandDeps["store"]["listIndexSecurities"]>>, scope: string) {
  const { env, store, log } = deps;
  if (!env.SEC_USER_AGENT) throw new Error("SEC_USER_AGENT is required to read EDGAR filing archives (www.sec.gov blocks undeclared tools).");
  const [statuses, existing] = await Promise.all([store.getMarketCapStatuses(), store.listShareClassSecurityIds()]);
  const targets = securities.filter(
    (s) =>
      existing.has(s.securityId) ||
      statuses.get(s.securityId) !== "VERIFIED" ||
      isLikelyMultiClass({ ticker: s.ticker, shareClass: s.shareClass, listingsOfIssuer: s.listingsOfIssuer }),
  );
  const source = new CachedCoverSource(new SecClient({ userAgent: env.SEC_USER_AGENT }), resolve(CACHE_DIR, "covers"));
  return syncShareClasses({ store, now: () => new Date(), log, scope }, source, targets);
}

export async function runSecCommand(command: string, args: string[], deps: CommandDeps): Promise<void> {
  const { db, store, log } = deps;

  if (command === "sec") {
    const index = argValue(args, "--index");
    const securities = index ? await store.listIndexSecurities(index) : await store.findSecuritiesByTicker(parseTickers(args, SEC_VALIDATION_TICKERS));
    const report = await runSecSync(deps, securities, {
      scope: index ? `index:${index}` : "tickers",
      offline: args.includes("--offline"),
      maxAgeHours: Number(argValue(args, "--max-age-hours") ?? 20),
      since: argValue(args, "--since") ?? DEFAULT_SINCE,
    });
    process.exitCode = report.status === "failed" ? 1 : 0;
    return;
  }

  if (command === "sec-classes") {
    const index = argValue(args, "--index") ?? "sp500";
    const result = await runShareClassSync(deps, await store.listIndexSecurities(index), `index:${index}`);
    process.exitCode = result.status === "failed" ? 1 : 0;
    return;
  }

  if (command === "sec-report") {
    const rows: { line_item_code: string; status: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("fundamental_coverage").select("line_item_code, status").eq("source", "sec").order("company_id").order("line_item_code").range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const { data: entities, error } = await db.from("sec_entities").select("industry_template");
    if (error) throw new Error(error.message);
    const issuers = entities.length;
    const templates: Record<string, number> = {};
    for (const e of entities) templates[e.industry_template] = (templates[e.industry_template] ?? 0) + 1;

    const lines = [
      "# SEC fundamentals — cobertura por partida",
      "",
      `Generado: ${new Date().toISOString()} · Emisores: ${issuers} (${Object.entries(templates).map(([t, n]) => `${t} ${n}`).join(", ")}) · Regenerar: \`npm run sync -- sec-report\``,
      "",
      "| Partida | available | not_applicable | discontinued | missing |",
      "|---|---|---|---|---|",
    ];
    for (const item of CANONICAL_LINE_ITEMS) {
      const of = (status: string) => rows.filter((r) => r.line_item_code === item.code && r.status === status).length;
      if (item.code === "free_cash_flow") continue;
      lines.push(`| \`${item.code}\` | ${of("available")} | ${of("not_applicable")} | ${of("discontinued")} | ${of("missing")} |`);
    }
    lines.push("", "`free_cash_flow` no es un concept XBRL: MarketRadar lo calcula (OCF − capex) cuando existen ambos.");
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
    console.log(lines.join("\n"));
    log(`\nWritten ${REPORT_PATH}`);
    return;
  }
  throw new Error(`Unknown SEC command: ${command}`);
}
