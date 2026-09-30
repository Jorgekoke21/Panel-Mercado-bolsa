import { deriveFinancials, describeFcfDivergence } from "@/lib/calculations/derived-financials";
import { buildFundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";
import { isLikelyMultiClass } from "@/lib/calculations/market-cap";
import { isProviderError } from "@/providers/errors";
import { SEC_PROVIDER_ID } from "@/providers/sec/client";
import { industryTemplate, requiredConcepts } from "@/providers/sec/concepts";
import { normalizeCompanyFacts } from "@/providers/sec/normalize";
import {
  companyFactsSchema,
  filingColumnsSchema,
  flattenCompanyFacts,
  parseFilingColumns,
  parseSubmissions,
  periodicFilingsFromFacts,
  type SecFiling,
  submissionPagesSince,
  submissionsSchema,
} from "@/providers/sec/parse";
import type { SyncIssue, SyncRunFinish, SyncSecurity, SyncStore } from "./store";

/**
 * Job SEC: fundamentales oficiales de EE. UU. (gratuito).
 *
 *   submissions (perfil, SIC ⇒ plantilla, filings, 8-K 2.02) + companyfacts (XBRL)
 *   → normalizeCompanyFacts (reportado / derivado, con accession y concept)
 *   → deriveFinancials (FCF calculado; EPS calculado solo si no hay EPS reportado)
 *   → SyncStore (reemplazo idempotente por emisor) + fundamental_coverage + sync_runs.
 *
 * Un emisor se procesa una sola vez aunque tenga varias clases (GOOGL/GOOG comparten CIK).
 */
export interface SecSource {
  companyFacts(cik: string): Promise<unknown>;
  submissions(cik: string): Promise<unknown>;
  submissionsPage(name: string): Promise<unknown>;
  readonly requestCount: number;
}

export interface SecJobContext {
  store: SyncStore;
  now: () => Date;
  log: (line: string) => void;
  scope: string;
}

export interface SecJobOptions {
  /** Periodos que se guardan (fin ≥ esta fecha). */
  minPeriodEnd: string;
  /** Publicaciones de resultados (8-K 2.02): se buscan desde esta fecha… */
  releasesSince: string;
  /** …leyendo como máximo estas páginas adicionales del índice por emisor. */
  maxSubmissionPages: number;
}

export interface SecCompanyResult {
  companyId: string;
  tickers: string[];
  template: string;
  values: number;
  derived: number;
  calculated: number;
  removed: number;
  filings: number;
  coverage: Record<string, number>;
  warnings: number;
}

export interface SecJobReport extends SyncRunFinish {
  runId: string;
  companies: SecCompanyResult[];
}

const WARNINGS_PER_COMPANY = 25;

export async function syncSecFundamentals(
  ctx: SecJobContext,
  source: SecSource,
  securities: readonly SyncSecurity[],
  options: SecJobOptions,
): Promise<SecJobReport> {
  const { store } = ctx;
  const errors: SyncIssue[] = [];
  const warnings: SyncIssue[] = [];
  const companies: SecCompanyResult[] = [];
  let recordsRead = 0;
  let recordsWritten = 0;
  const requestsBefore = source.requestCount;

  const byCompany = new Map<string, SyncSecurity[]>();
  for (const s of securities) byCompany.set(s.companyId, [...(byCompany.get(s.companyId) ?? []), s]);

  const runId = await store.startRun({
    provider: SEC_PROVIDER_ID,
    jobType: "sec_fundamentals",
    scope: ctx.scope,
    params: { companies: byCompany.size, minPeriodEnd: options.minPeriodEnd },
    startedAt: ctx.now().toISOString(),
  });
  ctx.log(`▶ sec_fundamentals (${byCompany.size} issuers) run=${runId}`);

  const [factsDataset, filingsDataset] = await Promise.all([store.resolveDatasetId("sec-companyfacts"), store.resolveDatasetId("sec-submissions")]);

  for (const [companyId, listings] of byCompany) {
    const tickers = listings.map((l) => l.ticker).sort();
    const label = tickers.join("/");
    const cik = listings[0]?.cik ?? null;
    try {
      if (!cik) throw Object.assign(new Error("No SEC CIK in the MarketRadar seed for this issuer"), { name: "NoData" });
      const ingestedAt = ctx.now().toISOString();

      const submissions = submissionsSchema.safeParse(await source.submissions(cik));
      if (!submissions.success) throw Object.assign(new Error(`Unexpected submissions shape: ${submissions.error.issues[0]?.message}`), { name: "InvalidResponse" });
      const parsed = parseSubmissions(submissions.data);
      const { profile } = parsed;
      const template = industryTemplate(profile.sic);
      const indexed = new Map<string, SecFiling>(parsed.filings.map((f) => [f.accessionNumber, f]));
      const { pages, truncated } = submissionPagesSince(submissions.data, options.releasesSince, options.maxSubmissionPages);
      for (const page of pages) {
        const columns = filingColumnsSchema.safeParse(await source.submissionsPage(page));
        if (!columns.success) throw Object.assign(new Error(`Unexpected submissions page ${page}`), { name: "InvalidResponse" });
        for (const f of parseFilingColumns(columns.data)) if (!indexed.has(f.accessionNumber)) indexed.set(f.accessionNumber, f);
      }
      if (truncated) {
        warnings.push({ security: label, kind: "filing_index_truncated", message: `Earnings-release history limited to the ${options.maxSubmissionPages} most recent index pages (very high filing volume)` });
      }

      const factsJson = companyFactsSchema.safeParse(await source.companyFacts(cik));
      if (!factsJson.success) throw Object.assign(new Error(`Unexpected companyfacts shape: ${factsJson.error.issues[0]?.message}`), { name: "InvalidResponse" });
      const { facts, rejected } = flattenCompanyFacts(factsJson.data, requiredConcepts());
      // 10-K/10-Q completos desde los hechos (el índice puede estar paginado).
      for (const f of periodicFilingsFromFacts(facts)) if (!indexed.has(f.accessionNumber)) indexed.set(f.accessionNumber, f);
      const filings = [...indexed.values()];
      recordsRead += facts.length + filings.length;
      if (rejected > 0) warnings.push({ security: label, kind: "fact_rejected", message: `${rejected} facts with unexpected shape ignored` });

      const normalized = normalizeCompanyFacts(facts, { template, minPeriodEnd: options.minPeriodEnd });
      const derived = deriveFinancials(normalized.values);
      const values = [...normalized.values, ...derived.values];

      const companyWarnings = [...normalized.warnings, ...derived.fcfDivergences.map(describeFcfDivergence)];
      for (const w of companyWarnings.slice(0, WARNINGS_PER_COMPANY)) warnings.push({ security: label, kind: "sec_normalization", message: w });
      if (companyWarnings.length > WARNINGS_PER_COMPANY) {
        warnings.push({ security: label, kind: "sec_normalization", message: `${companyWarnings.length - WARNINGS_PER_COMPANY} more warnings not shown` });
      }

      const factsProv = { source: SEC_PROVIDER_ID, datasetId: factsDataset, ingestedAt };
      const filingsProv = { source: SEC_PROVIDER_ID, datasetId: filingsDataset, ingestedAt };
      const primary = listings.find((l) => l.isPrimary) ?? (listings[0] as SyncSecurity);

      await store.upsertSecEntity(companyId, profile, template, filingsProv);
      const filingCount = await store.upsertSecFilings(companyId, filings, filingsProv);
      const { written, removed } = await store.replaceStatementValues(companyId, primary.securityId, values, factsProv);
      await store.replaceCoverage(companyId, normalized.coverage, factsProv);
      // Materialización para agregados (sector / industria / índice): métricas sin precio.
      await store.upsertFundamentalSnapshot(companyId, buildFundamentalSnapshot(values, template), factsProv);

      // Acciones de portada: son del EMISOR. Solo se asignan a la security si hay una única clase.
      let sharesWritten = 0;
      const multiClass = isLikelyMultiClass({ ticker: primary.ticker, shareClass: primary.shareClass, listingsOfIssuer: primary.listingsOfIssuer });
      if (normalized.coverShares.length > 0 && !multiClass) {
        sharesWritten = await store.upsertShares(primary.securityId, normalized.coverShares, factsProv);
      } else if (normalized.coverShares.length > 0) {
        warnings.push({ security: label, kind: "multi_class_shares", message: "Cover-page shares are issuer-level; not assigned to a single share class" });
      }

      recordsWritten += written + filingCount + normalized.coverage.length + sharesWritten;
      const coverage: Record<string, number> = {};
      for (const c of normalized.coverage) coverage[c.status] = (coverage[c.status] ?? 0) + 1;
      companies.push({
        companyId,
        tickers,
        template,
        values: normalized.values.filter((v) => v.origin === "reported").length,
        derived: normalized.values.filter((v) => v.origin === "derived").length,
        calculated: derived.values.length,
        removed,
        filings: filingCount,
        coverage,
        warnings: companyWarnings.length,
      });
      ctx.log(
        `  ${label.padEnd(10)} ${template.padEnd(9)} reported ${companies.at(-1)?.values} · derived ${companies.at(-1)?.derived} · calculated ${derived.values.length} · filings ${filingCount} · coverage ${JSON.stringify(coverage)}`,
      );
    } catch (error) {
      const kind = isProviderError(error) ? error.kind : error instanceof Error && error.name === "SyncStoreError" ? "database" : error instanceof Error && error.name === "NoData" ? "no_data" : "invalid_response";
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ security: label, kind, message });
      ctx.log(`  ✗ ${label} [${kind}] ${message}`);
    }
  }

  const result: SyncRunFinish = {
    status: errors.length === 0 ? "succeeded" : companies.length > 0 ? "partial" : "failed",
    finishedAt: ctx.now().toISOString(),
    recordsRead,
    recordsWritten,
    requestsMade: source.requestCount - requestsBefore,
    creditsUsed: 0,
    creditsEstimated: 0,
    errors,
    warnings,
  };
  await store.finishRun(runId, result);
  ctx.log(`  ${result.status} · issuers ${companies.length}/${byCompany.size} · written ${recordsWritten} · SEC requests ${result.requestsMade} · errors ${errors.length} · warnings ${warnings.length}`);
  return { ...result, runId, companies };
}
