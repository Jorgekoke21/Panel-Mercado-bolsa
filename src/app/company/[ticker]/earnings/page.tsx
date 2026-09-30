import { SecSourceBadge, SecSourceNote } from "@/components/market/sec-source-note";
import { StatementCellView } from "@/components/market/statement-table";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { getRepositories } from "@/data/registry";
import { formatDate, formatPercent } from "@/lib/format";
import { filingIndexUrl } from "@/lib/sec-links";
import { getEarningsView } from "@/services/company-fundamentals";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";

/** Momento de ACEPTACIÓN del 8-K en EDGAR (el comunicado puede ser anterior, p. ej. un sábado). */
const TIMING_LABEL = { before_market: "accepted before open", during_market: "accepted during session", after_market: "accepted after close" } as const;

export default async function CompanyEarningsPage({ params }: PageProps<"/company/[ticker]/earnings">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const data = await getEarningsView(getRepositories(), header.security);

  if (!data) {
    return (
      <Panel title={messages.company.earnings}>
        <EmptyState title={messages.company.noEarnings} description={locale === "es" ? "Los resultados publicados proceden de informes SEC (10-Q / 10-K) y las fechas de publicación de los formularios 8-K, apartado 2.02." : "Reported results come from SEC filings (10-Q / 10-K) and release dates from 8-K item 2.02."} />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Panel title={messages.company.reportedResults} subtitle={locale === "es" ? "Últimos 12 trimestres fiscales · GAAP, según el informe" : "Last 12 fiscal quarters · GAAP, as filed"} actions={<SecSourceBadge profile={data.profile} />}>
        <Table caption={locale === "es" ? "Resultados trimestrales publicados" : "Reported quarterly results"}>
          <THead>
            <tr>
              <Th>{messages.company.quarter}</Th>
              <Th>{messages.company.periodEnd}</Th>
              <Th title="Earnings-release filing (Form 8-K item 2.02) and its EDGAR acceptance time. The press release itself may have been published earlier.">8-K 2.02 filed</Th>
              <Th numeric>{messages.company.revenue}</Th>
              <Th numeric title={locale === "es" ? "Ingresos frente al mismo trimestre fiscal del año anterior (calculado)" : "Revenue vs the same fiscal quarter a year earlier (calculated)"}>Rev. YoY</Th>
              <Th numeric>{messages.company.netIncome}</Th>
              <Th numeric title="Diluted EPS as reported (GAAP). Not the adjusted EPS analysts compare against.">EPS (diluted, GAAP)</Th>
            </tr>
          </THead>
          <tbody>
            {data.rows.map((r) => (
              <Tr key={r.periodEnd}>
                <Td className="font-mono text-fg-secondary">{r.label}</Td>
                <Td className="text-fg-muted">{formatDate(r.periodEnd, locale)}</Td>
                <Td>
                  {r.release ? (
                    <a
                      href={filingIndexUrl(data.profile.cik, r.release.accessionNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link hover:underline"
                      title={`8-K item 2.02 · accession ${r.release.accessionNumber}${r.release.acceptedAt ? ` · accepted ${r.release.acceptedAt}` : ""}`}
                    >
                      {formatDate(r.release.filingDate, locale)}
                    </a>
                  ) : (
                    <span className="text-fg-muted" title="No earnings-release 8-K found in the synced filing index for this quarter">
                      —
                    </span>
                  )}
                  {r.release?.releaseTiming && <span className="ml-1 text-[10px] text-fg-muted">{locale === "es" ? ({ before_market: "aceptado antes de apertura", during_market: "aceptado durante la sesión", after_market: "aceptado después del cierre" } as const)[r.release.releaseTiming] : TIMING_LABEL[r.release.releaseTiming]}</span>}
                </Td>
                <Td numeric>
                  <StatementCellView cell={r.revenue} unit="currency" locale={locale} />
                </Td>
                <Td numeric>
                  {r.revenueYoY === null ? <span className="text-fg-muted">—</span> : <span title={messages.common.calculatedByMarketRadar}>{formatPercent(r.revenueYoY, { digits: 1 }, locale)}</span>}
                </Td>
                <Td numeric>
                  <StatementCellView cell={r.netIncome} unit="currency" locale={locale} />
                </Td>
                <Td numeric>
                  <StatementCellView cell={r.epsDiluted} unit="per_share" locale={locale} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <SecSourceNote profile={data.profile} />
      </Panel>
      <Panel title={messages.company.estimateDates} actions={<Badge variant="outline">{locale === "es" ? "No disponible" : "Not available"}</Badge>}>
        <p className="px-2.5 py-2 text-2xs text-fg-muted">
          {locale === "es" ? "Ninguna fuente oficial gratuita publica el consenso de analistas (estimaciones de BPA e ingresos), la sorpresa de resultados ni la fecha del próximo informe. MarketRadar no los estima ni deduce. Requieren un proveedor comercial de datos." : "Analyst consensus (EPS / revenue estimates), earnings surprise and the next report date are not published by any free official source. MarketRadar does not estimate or infer them. They require a commercial data provider."}
        </p>
      </Panel>
    </div>
  );
}
