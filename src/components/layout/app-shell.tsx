import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { MarketDataStatusSummary } from "@/data/repositories/market-data-repository";
import type { SearchEntry } from "@/services/search";
import { CompanySearch } from "./company-search";
import { Sidebar } from "./sidebar";
import { LanguageSwitcher } from "./language-switcher";
import { getMessages, type Locale, interpolate } from "@/i18n/messages";
import { formatDate } from "@/lib/format";

/** Marco de la terminal: barra lateral + barra superior + contenido. */
export function AppShell({
  children,
  searchEntries,
  marketStatus,
  universeSize,
  locale,
}: {
  children: ReactNode;
  searchEntries: SearchEntry[];
  marketStatus: MarketDataStatusSummary | null;
  universeSize: number;
  locale: Locale;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-10 items-center gap-3 border-b border-border bg-bg/95 pr-2 pl-20 backdrop-blur-sm md:pl-2">
          <CompanySearch entries={searchEntries} />
          <div className="ml-auto flex items-center gap-2">
            <MarketStatusBadge status={marketStatus} universeSize={universeSize} locale={locale} />
            <LanguageSwitcher />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Estado global de los datos de mercado: REAL (todas las securities con la última sesión), PARTIAL o
 * DEMO. Los benchmarks de la cinta superior (índices, VIX, DXY, materias primas, tipos) siguen DEMO.
 */
function MarketStatusBadge({ status, universeSize, locale }: { status: MarketDataStatusSummary | null; universeSize: number; locale: Locale }) {
  const messages = getMessages(locale);
  if (!status || status.realSecurities === 0) {
    return (
      <Badge variant="demo" title={messages.market.marketStatusDemo}>
        {messages.market.marketData}: {locale === "es" ? "demo" : "demo"}
      </Badge>
    );
  }
  const partial = universeSize > 0 && status.realSecurities < universeSize;
  const title = `${interpolate(messages.market.endOfDayPrices, { provider: status.sourceLabel ?? (locale === "es" ? "el proveedor" : "the provider"), date: formatDate(status.asOf, locale) })} ${status.realSecurities}/${universeSize} ${locale === "es" ? "valores tienen datos reales" : "securities have real data"}${partial ? messages.market.missingRemainder : ""}. ${messages.market.benchmarkDemo}`;
  const state = partial ? (locale === "es" ? "parcial" : "partial") : (locale === "es" ? "real" : "real");
  return (
    <Badge variant={partial ? "warning" : "neutral"} title={title}>
      {messages.market.marketData}: {partial ? `${state} ${status.realSecurities}/${universeSize}` : state} · EOD {formatDate(status.asOf, locale)}
    </Badge>
  );
}
