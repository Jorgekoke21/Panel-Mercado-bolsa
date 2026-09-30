import type { Metadata } from "next";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, Th, THead } from "@/components/ui/table";
import { getServerMessages } from "@/i18n/server";

export const metadata: Metadata = { title: "Watchlist" };

/** Estados previstos de un elemento de la watchlist (Fase 6). */
const STATES = [
  { id: "watching", label: "Watching", description: "On the radar" },
  { id: "studying", label: "Studying", description: "Researching the business" },
  { id: "interested", label: "Interested", description: "Candidate for a position" },
  { id: "portfolio", label: "Portfolio", description: "Currently held" },
] as const;

export default async function WatchlistPage() {
  const { locale, messages } = await getServerMessages();
  const states = locale === "es"
    ? [{ id: "watching", label: "En seguimiento", description: "En el radar" }, { id: "studying", label: "En estudio", description: "Analizando el negocio" }, { id: "interested", label: "Interés", description: "Candidata para una posición" }, { id: "portfolio", label: "En cartera", description: "Actualmente en cartera" }]
    : STATES;
  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <Panel title={messages.navigation.watchlist} subtitle={locale === "es" ? "Lista personal con estado, nota y fecha" : "Personal list with status, note and date"} actions={<Badge variant="outline">{locale === "es" ? "Disponible en la fase 6" : "Coming in Phase 6"}</Badge>}>
        <EmptyState
          title={locale === "es" ? "Aún no se guarda la lista de seguimiento" : "Watchlist persistence is not enabled yet"}
          description={locale === "es" ? "La fase 1 no incluye autenticación ni guarda datos personales. La lista, las notas y los estados se guardarán con seguridad por fila en la fase 6." : "Phase 1 has no authentication and stores no personal data. Watchlists, notes and statuses will be saved with row-level security in Phase 6."}
        />
      </Panel>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {states.map((state) => (
          <Panel key={state.id} title={state.label} subtitle={state.description} actions={<span className="num font-mono text-2xs text-fg-muted">0</span>}>
            <Table caption={`${state.label} ${messages.navigation.companies.toLowerCase()}`}>
              <THead>
                <tr>
                  <Th>{messages.market.symbol}</Th>
                  <Th>{locale === "es" ? "Nota" : "Note"}</Th>
                  <Th numeric>{messages.market.add}</Th>
                </tr>
              </THead>
              <tbody />
            </Table>
            <EmptyState compact title={locale === "es" ? "Sin empresas" : "No companies"} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
