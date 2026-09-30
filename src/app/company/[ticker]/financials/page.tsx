import Link from "next/link";
import { SecSourceBadge, SecSourceNote } from "@/components/market/sec-source-note";
import { StatementTable } from "@/components/market/statement-table";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { companyPath } from "@/lib/routes";
import { getFinancialsView } from "@/services/company-fundamentals";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { financialTerm } from "@/i18n/domain";
import { segmentGroupClass, segmentItemClass } from "@/components/ui/styles";

const VIEWS = [
  { id: "annual", label: "Annual" },
  { id: "quarterly", label: "Quarterly" },
] as const;

export default async function CompanyFinancialsPage({ params, searchParams }: PageProps<"/company/[ticker]/financials">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const query = await searchParams;
  const view = query.view === "quarterly" ? "quarterly" : "annual";
  const header = await loadCompanyHeader(ticker);
  const data = await getFinancialsView(getRepositories(), header.security, view);

  if (!data) {
    return (
      <Panel title={messages.company.financials}>
        <EmptyState
          title={messages.company.noFinancialStatements}
          description={locale === "es" ? "Los datos fundamentales proceden de informes XBRL de SEC EDGAR (oficiales y gratuitos). Sincroniza la SEC para este emisor para cargar esta pestaña." : "Fundamentals come from SEC EDGAR XBRL filings (free, official). Run the SEC sync for this issuer to populate this tab."}
        />
      </Panel>
    );
  }

  const basePath = companyPath(header.security.ticker, "financials");
  const notAvailable = data.coverage.filter((c) => c.status !== "available");

  return (
    <div className="flex flex-col gap-2">
      <Panel
        title={locale === "es" ? "Estados financieros" : "Financial statements"}
        subtitle={`${data.view === "annual" ? messages.company.annual : messages.company.quarterly} · USD`}
        actions={
          <>
            <nav aria-label={locale === "es" ? "Tipo de periodo" : "Period type"} className={segmentGroupClass}>
              {VIEWS.map((v) => (
                <Link
                  key={v.id}
                  href={`${basePath}?view=${v.id}`}
                  scroll={false}
                  aria-current={v.id === data.view ? "true" : undefined}
                  className={segmentItemClass(v.id === data.view)}
                >
                  {locale === "es" ? (v.id === "annual" ? "Anual" : "Trimestral") : v.label}
                </Link>
              ))}
            </nav>
            <SecSourceBadge profile={data.profile} />
          </>
        }
      >
        {data.columns.length === 0 ? (
          <EmptyState compact title={messages.company.periodsUnavailable} />
        ) : (
          <div className="flex flex-col">
            {data.sections.map((section) => (
              <div key={section.title} className="border-b border-border last:border-b-0">
                <StatementTable title={financialTerm(locale, section.title)} columns={data.columns} rows={section.rows} locale={locale} />
              </div>
            ))}
          </div>
        )}
        <SecSourceNote profile={data.profile} latestFiling={data.latestFiling} />
      </Panel>

      {notAvailable.length > 0 && (
        <Panel title={messages.company.itemsUnavailable} subtitle={locale === "es" ? `${notAvailable.length} de ${data.coverage.length} partidas` : `${notAvailable.length} of ${data.coverage.length} line items`}>
          <dl className="px-2.5 py-1">
            {notAvailable.map((c) => (
              <div key={c.lineItem} className="flex gap-3 border-b border-border/60 py-1 text-2xs last:border-b-0">
                <dt className="w-48 shrink-0 font-mono text-fg-secondary">{financialTerm(locale, c.lineItem)}</dt>
                <dd className="text-fg-muted">
                  <span className="mr-1 font-semibold text-fg-secondary uppercase">{c.status.replaceAll("_", " ")}</span>
                  {c.reason}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
    </div>
  );
}
