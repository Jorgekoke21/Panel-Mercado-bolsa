import { CompanyTable } from "@/components/market/company-table";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { getCompanyPeers } from "@/services/companies";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { classificationLabel } from "@/i18n/classification";

export default async function CompanyPeersPage({ params }: PageProps<"/company/[ticker]/peers">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const peers = await getCompanyPeers(getRepositories(), header.security);

  return (
    <Panel
      title={messages.company.peers}
      subtitle={peers.scope ? `${locale === "es" ? "Misma clasificación" : "Same classification"}: ${classificationLabel(locale, peers.scope)} · ${peers.rows.length} ${messages.navigation.companies.toLowerCase()}` : undefined}
      actions={<DataProvenanceBadge provenance={peers.provenance} />}
    >
      {peers.rows.length === 0 ? (
        <EmptyState title={messages.company.noPeers} description={messages.company.peersDefinition} />
      ) : (
        <CompanyTable
          rows={peers.rows}
          locale={locale}
          columns={["company", "subIndustry", "country", "exchange", "price", "change", "marketCap", "rsi"]}
          range="1D"
          caption={`${header.security.companyName} peers`}
          marketDataIsDemo={peers.provenance.isDemo}
        />
      )}
      <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
        {locale === "es" ? "Los comparables se obtienen de la clasificación (misma subindustria; se amplía a la industria cuando hay menos de tres). La lista seleccionada de competidores y la comparación lado a lado estarán disponibles en Comparar (fase 3)." : "Peers are derived from the classification (same sub-industry, widened to the industry when there are fewer than three). A curated competitor list and side-by-side comparison arrive with Compare (Phase 3)."}
      </p>
    </Panel>
  );
}
