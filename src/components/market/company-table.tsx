import Link from "next/link";
import type { ReactNode } from "react";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { type TimeRange } from "@/domain/time-range";
import { formatCompact, formatNumber, formatPrice } from "@/lib/format";
import { industryPath, sectorPath } from "@/lib/routes";
import type { MarketRow } from "@/services/market-rows";
import { Badge } from "@/components/ui/badge";
import { CountryBadge } from "./country-badge";
import { PerformanceBadge } from "./performance-badge";
import { TickerCell } from "./ticker-cell";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/i18n/messages";
import { timeRangeLabel } from "@/i18n/domain";
import { classificationLabel } from "@/i18n/classification";

export type CompanyColumn =
  | "company"
  | "sector"
  | "industry"
  | "subIndustry"
  | "exchange"
  | "country"
  | "price"
  | "change"
  | "marketCap"
  | "volume"
  | "rsi";

/** Columnas con datos de mercado (en Fase 1 son DEMO y se marcan en la cabecera). */
const MARKET_COLUMNS = new Set<CompanyColumn>(["price", "change", "marketCap", "volume", "rsi"]);

interface CompanyTableProps {
  rows: readonly MarketRow[];
  columns: CompanyColumn[];
  range: TimeRange;
  caption: string;
  /** Marca las columnas de mercado como simuladas. */
  marketDataIsDemo: boolean;
  /** Cabeceras ordenables (enlaces), por columna. */
  sortHeader?: Partial<Record<CompanyColumn, ReactNode>>;
  startIndex?: number;
  locale?: Locale;
}

/** Tabla de valores (DataTable) configurable por columnas. */
export function CompanyTable({ rows, columns, range, caption, marketDataIsDemo, sortHeader, startIndex = 0, locale = DEFAULT_LOCALE }: CompanyTableProps) {
  const messages = getMessages(locale);
  const labels: Record<CompanyColumn, string> = {
    company: messages.common.company, sector: messages.common.sector, industry: messages.common.industry, subIndustry: locale === "es" ? "Subindustria" : "Sub-industry",
    exchange: messages.market.exchange, country: locale === "es" ? "Sede" : "HQ", price: messages.market.price, change: locale === "es" ? "Variación" : "Change",
    marketCap: locale === "es" ? "Cap. bursátil" : "Mkt cap", volume: messages.market.volume, rsi: "RSI 14",
  };
  return (
    <Table caption={caption}>
      <THead>
        <tr>
          <Th className="w-8">#</Th>
          {columns.map((c) => (
            <Th key={c} numeric={MARKET_COLUMNS.has(c)}>
              <span className="inline-flex items-center gap-1">
                {sortHeader?.[c] ?? (c === "change" ? `${labels[c]} ${range}` : labels[c])}
                {marketDataIsDemo && MARKET_COLUMNS.has(c) && (
                  <abbr title={locale === "es" ? "Datos simulados de demostración" : "Simulated demo data"} className="text-[9px] text-demo no-underline">
                    demo
                  </abbr>
                )}
              </span>
            </Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {rows.map((row, i) => {
          const s = row.snapshot;
          const cls = row.summary.classification;
          return (
            <Tr key={row.summary.securityId}>
              <Td className="text-fg-muted">{startIndex + i + 1}</Td>
              {columns.map((c) => {
                switch (c) {
                  case "company":
                    return (
                      <Td key={c}>
                        <span className="flex items-center gap-1.5">
                          <TickerCell ticker={row.ticker} name={row.summary.companyName} />
                          {row.summary.shareClass && <Badge variant="outline">{locale === "es" ? "Clase" : "Class"} {row.summary.shareClass}</Badge>}
                        </span>
                      </Td>
                    );
                  case "sector":
                    return (
                      <Td key={c} className="max-w-48 truncate text-fg-secondary">
                        {cls ? <Link href={sectorPath(cls.sector.slug)} className="hover:text-accent">{classificationLabel(locale, cls.sector.name)}</Link> : "—"}
                      </Td>
                    );
                  case "industry":
                    return (
                      <Td key={c} className="max-w-56 truncate text-fg-secondary">
                        {cls ? <Link href={industryPath(cls.industry.slug)} className="hover:text-accent">{classificationLabel(locale, cls.industry.name)}</Link> : "—"}
                      </Td>
                    );
                  case "subIndustry":
                    return (
                      <Td key={c} className="max-w-56 truncate text-fg-muted" title={cls?.subIndustry.name}>
                        {cls ? classificationLabel(locale, cls.subIndustry.name) : "—"}
                      </Td>
                    );
                  case "exchange":
                    return (
                      <Td key={c} className="text-fg-muted" title={row.summary.exchange.name}>
                        {row.summary.exchange.acronym ?? row.summary.exchange.mic}
                      </Td>
                    );
                  case "country":
                    return (
                      <Td key={c}>
                        <CountryBadge code={row.summary.headquarters.countryCode} name={row.summary.headquarters.countryName} />
                      </Td>
                    );
                  case "price":
                    return <Td key={c} numeric>{formatPrice(s?.price, row.summary.currency, locale)}</Td>;
                  case "change":
                    return (
                      <Td key={c} numeric>
                        <PerformanceBadge value={s?.returns[range]} label={timeRangeLabel(locale, range)} />
                      </Td>
                    );
                  case "marketCap":
                    return <Td key={c} numeric>{formatCompact(s?.marketCap, row.summary.currency, locale)}</Td>;
                  case "volume":
                    return <Td key={c} numeric>{formatCompact(s?.volume, null, locale)}</Td>;
                  case "rsi":
                    return <Td key={c} numeric>{formatNumber(s?.rsi14, 1, locale)}</Td>;
                }
              })}
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
