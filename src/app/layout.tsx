import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Luckiest_Guy } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getRepositories } from "@/data/registry";
import type { MarketDataStatusSummary } from "@/data/repositories/market-data-repository";
import { getSearchIndex, type SearchEntry } from "@/services/search";
import { getServerLocale } from "@/i18n/server";
import { LocaleProvider } from "@/i18n/provider";
import "./globals.css";

// Tipografía (Financial Brutalism, ver docs/design/MARKETRADAR_VISUAL_SYSTEM.md):
//  · Inter → interfaz y cifras (tabular-nums).
//  · Bricolage Grotesque → títulos de página y titulares (contundencia de Academia/Bots sin tono cartoon).
//  · Luckiest Guy → SOLO el wordmark; es el hilo directo con Academia Trading y Bots Trading.
const uiFont = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"], display: "swap" });
const brandFont = Luckiest_Guy({ subsets: ["latin"], variable: "--font-brand", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MarketRadar", template: "%s · MarketRadar" },
  description: "Personal market intelligence terminal.",
};

// Fase 1: todas las páginas leen de la base de datos local en cada petición y `next build`
// no necesita la base levantada. La estrategia de caché se definirá con los datos reales (Fase 2).
export const dynamic = "force-dynamic";

async function loadSearchIndex(): Promise<SearchEntry[]> {
  try {
    return await getSearchIndex(getRepositories());
  } catch (error) {
    // El layout no debe caer si la base no responde: la página mostrará su propio ErrorState.
    console.error("[layout] search index unavailable", error);
    return [];
  }
}

async function loadMarketStatus(): Promise<MarketDataStatusSummary | null> {
  try {
    return (await getRepositories().marketData.getStatus?.()) ?? null;
  } catch (error) {
    console.error("[layout] market data status unavailable", error);
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [searchEntries, marketStatus, locale] = await Promise.all([loadSearchIndex(), loadMarketStatus(), getServerLocale()]);
  const universe = searchEntries.length;
  return (
    <html lang={locale} className={`${uiFont.variable} ${displayFont.variable} ${brandFont.variable}`}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <AppShell searchEntries={searchEntries} marketStatus={marketStatus} universeSize={universe} locale={locale}>
            {children}
          </AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
