import { checkClassShares, type CoverData, resolveSecurityClass } from "@/providers/sec/cover";
import { SEC_PROVIDER_ID } from "@/providers/sec/client";
import type { StoredShareClass, SyncIssue, SyncSecurity, SyncStore } from "./store";

/**
 * Acciones por clase desde la portada XBRL del último 10-Q/10-K (ver src/providers/sec/cover.ts).
 * Solo para las securities cuya capitalización no se verifica con companyfacts (multiclase, portada
 * ausente o desfasada, sin referencia) y las que ya tienen registro de clase (para refrescarlas).
 */
export interface CoverSource {
  /** Portada ya analizada de un filing (cacheable por accession: un filing no cambia). */
  cover(cik: string, accession: string): Promise<CoverData>;
  readonly requestCount: number;
}

export interface ShareClassJobContext {
  store: SyncStore;
  now: () => Date;
  log: (line: string) => void;
  scope: string;
}

export interface ShareClassOutcome {
  ticker: string;
  status: StoredShareClass["checkStatus"];
  detail: string;
}

export async function syncShareClasses(ctx: ShareClassJobContext, source: CoverSource, securities: readonly SyncSecurity[]) {
  const { store } = ctx;
  const errors: SyncIssue[] = [];
  const warnings: SyncIssue[] = [];
  const outcomes: ShareClassOutcome[] = [];
  let written = 0;
  const requestsBefore = source.requestCount;
  const byCompany = new Map<string, SyncSecurity[]>();
  for (const s of securities) byCompany.set(s.companyId, [...(byCompany.get(s.companyId) ?? []), s]);

  const runId = await store.startRun({ provider: SEC_PROVIDER_ID, jobType: "sec_share_classes", scope: ctx.scope, params: { securities: securities.length }, startedAt: ctx.now().toISOString() });
  ctx.log(`▶ sec_share_classes (${securities.length} securities, ${byCompany.size} issuers) run=${runId}`);
  const datasetId = await store.resolveDatasetId("sec-filing-cover");

  for (const [companyId, listings] of byCompany) {
    const label = listings.map((l) => l.ticker).join("/");
    try {
      const cik = listings[0]?.cik;
      if (!cik) throw Object.assign(new Error("No SEC CIK for this issuer"), { name: "NoData" });
      const filing = await store.getLatestPeriodicFiling(companyId);
      if (!filing) throw Object.assign(new Error("No 10-Q/10-K filing stored (run the SEC sync first)"), { name: "NoData" });
      const cover = await source.cover(cik, filing.accessionNumber);
      for (const security of listings) {
        const base = {
          securityId: security.securityId,
          companyId,
          accessionNumber: filing.accessionNumber,
          form: filing.form,
          periodEnd: cover.periodEnd,
          source: SEC_PROVIDER_ID,
          datasetId,
          computedAt: ctx.now().toISOString(),
        };
        const resolved = resolveSecurityClass(cover, security.ticker);
        let record: StoredShareClass;
        if (!resolved.ok) {
          record = { ...base, classMember: null, resolvedVia: null, shares: null, sharesAsOf: null, checkStatus: "unresolved", checkRule: null, referenceShares: null, referenceKind: null, referencePeriodEnd: null, deviation: null, note: resolved.reason };
        } else {
          const check = checkClassShares(cover, resolved);
          record = {
            ...base,
            classMember: resolved.member,
            resolvedVia: resolved.via,
            shares: resolved.shares,
            sharesAsOf: resolved.asOfDate,
            checkStatus: check.status,
            checkRule: check.status === "consistent" ? check.rule : null,
            referenceShares: check.status === "consistent" ? check.reference : null,
            referenceKind: check.status === "consistent" ? check.referenceKind : null,
            referencePeriodEnd: check.status === "consistent" ? check.periodEnd : null,
            deviation: check.deviation,
            note: check.status === "consistent" ? null : check.reason,
          };
          // La cifra oficial de portada entra en el histórico de acciones (índices cap-weighted, market cap).
          written += await store.upsertShares(
            security.securityId,
            [{ asOfDate: resolved.asOfDate, shares: resolved.shares, basis: "cover_page", sourceField: `dei:EntityCommonStockSharesOutstanding[${resolved.member ?? "total"}] (${filing.accessionNumber})` }],
            { source: SEC_PROVIDER_ID, datasetId, ingestedAt: ctx.now().toISOString() },
          );
        }
        await store.upsertShareClass(record);
        written++;
        outcomes.push({ ticker: security.ticker, status: record.checkStatus, detail: record.note ?? `${record.classMember ?? "single class"} · ${record.checkRule}` });
        if (record.checkStatus !== "consistent") warnings.push({ security: security.ticker, kind: `share_class_${record.checkStatus}`, message: record.note ?? "" });
      }
    } catch (error) {
      errors.push({ security: label, kind: error instanceof Error ? error.name : "unexpected", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const status = errors.length === 0 ? "succeeded" : outcomes.length > 0 ? "partial" : "failed";
  await store.finishRun(runId, {
    status,
    finishedAt: ctx.now().toISOString(),
    recordsRead: securities.length,
    recordsWritten: written,
    requestsMade: source.requestCount - requestsBefore,
    creditsUsed: null,
    creditsEstimated: 0,
    errors,
    warnings,
  });
  const count = (s: string) => outcomes.filter((o) => o.status === s).length;
  ctx.log(`  ${status} · consistent ${count("consistent")} · inconsistent ${count("inconsistent")} · no reference ${count("no_reference")} · unresolved ${count("unresolved")} · errors ${errors.length} · SEC requests ${source.requestCount - requestsBefore}`);
  for (const o of outcomes.filter((x) => x.status !== "consistent")) ctx.log(`  ${o.status.padEnd(13)} ${o.ticker.padEnd(6)} ${o.detail}`);
  for (const e of errors) ctx.log(`  ✗ ${e.security} [${e.kind}] ${e.message}`);
  return { runId, status, outcomes, errors };
}
