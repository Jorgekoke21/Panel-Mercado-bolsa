import Link from "next/link";
import { EventList } from "@/components/news/event-card";
import { ClaimLegend } from "@/components/news/primitives";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { getCompanyNews } from "@/services/news";
import { loadCompanyHeader } from "../load";
import { getServerMessages } from "@/i18n/server";
import { localizeEventCards } from "@/translation/server";

/**
 * Noticias de la empresa en capas: la propia empresa → su industria → competidores → cadena de suministro
 * → macro. Cada evento aparece una sola vez, en la capa más cercana a la empresa.
 */
export default async function CompanyNewsPage({ params }: PageProps<"/company/[ticker]/news">) {
  const { locale, messages } = await getServerMessages();
  const { ticker } = await params;
  const header = await loadCompanyHeader(ticker);
  const now = new Date();
  const news = await getCompanyNews(getRepositories(), header.security.companyId, { now, days: 14 });
  const localized = await localizeEventCards(news.sections.flatMap((section) => section.events), locale);
  const localizedById = new Map(localized.map((event) => [event.id, event]));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-2xs text-fg-muted">
          {news.total} {messages.common.events} · {locale === "es" ? "últimos 14 días · deduplicados y agrupados desde fuentes oficiales y medios globales." : "last 14 days · deduplicated and clustered from official sources and global media."}{" "}
          <Link href={`/news?node=${encodeURIComponent(`company:${header.security.companyId}`)}`} className="text-link hover:underline">
            {locale === "es" ? "Abrir en Pulso global" : "Open in World Pulse"}
          </Link>
        </p>
        <ClaimLegend />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        {news.sections.map((s) => (
          <Panel key={s.id} title={locale === "es" ? ({ company: "Empresa", industry: "Industria", sector: "Sector", supply_chain: "Cadena de suministro", macro: "Macro" } as Record<string, string>)[s.id] ?? s.title : s.title} subtitle={`${s.events.length}`} actions={s.id === "company" ? <Badge variant="neutral">{messages.common.direct}</Badge> : <Badge variant="inferred">{messages.common.related}</Badge>} className={s.id === "company" ? "lg:col-span-2" : undefined}>
            <p className="border-b border-border px-2.5 py-1 text-[10px] text-fg-muted">{s.description}</p>
            <EventList events={s.events.map((event) => localizedById.get(event.id) ?? event)} now={now} empty={s.id === "company" ? (locale === "es" ? "No hay eventos que mencionen esta empresa en los últimos 14 días." : "No events naming this company in the last 14 days.") : (locale === "es" ? "No hay eventos relacionados." : "No related events.")} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
