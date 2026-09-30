import type { Metadata } from "next";
import Link from "next/link";
import { IndexKindBadge } from "@/components/market/index-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { getRepositories } from "@/data/registry";
import { METHODOLOGY_LABELS } from "@/domain/market-index";
import { formatInteger } from "@/lib/format";
import { indexPath } from "@/lib/routes";
import { getMarketsOverview } from "@/services/markets";
import { getServerMessages } from "@/i18n/server";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage() {
  const { locale, messages } = await getServerMessages();
  const { indices } = await getMarketsOverview(getRepositories());
  const methodLabels = locale === "es" ? { provider: "Metodología del proveedor", equal_weight: "Ponderación igual", cap_weight: "Ponderación por capitalización" } : METHODOLOGY_LABELS;
  return (
    <div className="flex flex-col gap-2 p-2">
      <Panel title={messages.navigation.markets} subtitle={locale === "es" ? "Índices oficiales e índices sintéticos de MarketRadar" : "Official indices and MarketRadar synthetic indices"}>
        <Table caption={locale === "es" ? "Índices de mercado" : "Market indices"}>
          <THead>
            <tr>
              <Th>{messages.common.index}</Th>
              <Th>{locale === "es" ? "Tipo" : "Type"}</Th>
              <Th className="hidden md:table-cell">{locale === "es" ? "Metodología" : "Methodology"}</Th>
              <Th className="hidden md:table-cell">{locale === "es" ? "Proveedor" : "Provider"}</Th>
              <Th>{locale === "es" ? "País" : "Country"}</Th>
              <Th numeric>{locale === "es" ? "Componentes" : "Constituents"}</Th>
              <Th>{locale === "es" ? "Estado" : "Status"}</Th>
            </tr>
          </THead>
          <tbody>
            {indices.map(({ index, constituents }) => (
              <Tr key={index.id}>
                <Td>
                  <Link href={indexPath(index.slug)} className="flex items-baseline gap-2 hover:text-accent">
                    <span className="font-semibold text-fg">{index.name}</span>
                    <span className="font-mono text-[10px] text-fg-muted">{index.code}</span>
                  </Link>
                </Td>
                <Td>
                  <IndexKindBadge kind={index.kind} />
                </Td>
                <Td className="hidden text-fg-secondary md:table-cell">{methodLabels[index.methodology]}</Td>
                <Td className="hidden text-fg-secondary md:table-cell">{index.provider}</Td>
                <Td className="text-fg-secondary">{index.countryCode ?? (locale === "es" ? "Global" : "Global")}</Td>
              <Td numeric>{index.constituentsTracked ? formatInteger(constituents, locale) : "—"}</Td>
                <Td>
                  {index.constituentsTracked ? (
                    <Badge variant="positive">{locale === "es" ? "En seguimiento" : "Tracked"}</Badge>
                  ) : (
                    <Badge variant="outline" title={locale === "es" ? "Aún no se han cargado los componentes" : "Constituents are not loaded yet"}>
                      {locale === "es" ? "Fase 7" : "Phase 7"}
                    </Badge>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <Panel title={locale === "es" ? "Índices sintéticos" : "Synthetic indices"} subtitle={locale === "es" ? "Construidos por MarketRadar a partir de componentes de sectores e industrias" : "Built by MarketRadar from sector / industry constituents"}>
        <p className="px-2.5 py-3 text-2xs text-fg-muted">
          {locale === "es" ? <>Los índices de MarketRadar por sector e industria con ponderación igual y por capitalización (p. ej., <em>Índice de semiconductores de MarketRadar · Ponderado por capitalización · Sintético</em>) se definirán cuando haya historial de precios diarios. Siempre se identificarán como sintéticos y nunca como índices oficiales.</> : <>Equal-weighted and cap-weighted MarketRadar indices per sector and industry (e.g. <em>MarketRadar Semiconductors Index · Cap weighted · Synthetic</em>) are defined in Phase 2, when daily price history is available. They are always labelled as synthetic and never presented as official indices.</>}
        </p>
      </Panel>
    </div>
  );
}
