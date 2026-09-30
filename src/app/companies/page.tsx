import type { Metadata } from "next";
import Link from "next/link";
import { CompanyTable, type CompanyColumn } from "@/components/market/company-table";
import { TimeRangeSelector } from "@/components/market/time-range-selector";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import type { SecuritySortField } from "@/data/repositories/reference-repository";
import { parseTimeRange } from "@/domain/time-range";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";
import { companiesPath, type CompaniesQuery } from "@/lib/routes";
import { getCompaniesList, parseCompaniesParams } from "@/services/companies";
import { classificationLabel } from "@/i18n/classification";
import { getServerMessages } from "@/i18n/server";
import { buttonClass, inputClass } from "@/components/ui/styles";

export const metadata: Metadata = { title: "Companies" };


export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const { locale, messages } = await getServerMessages();
  const raw = await searchParams;
  const range = parseTimeRange(raw.range);
  const query = parseCompaniesParams(raw);
  const data = await getCompaniesList(getRepositories(), query);

  const baseQuery: CompaniesQuery = { q: query.q, sector: query.sector, index: query.index, sort: query.sort, dir: query.dir };
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const withRangeParam = (path: string) => `${path}${path.includes("?") ? "&" : "?"}range=${range}`;

  const sortLink = (field: SecuritySortField, label: string) => {
    const active = query.sort === field;
    const dir = active && query.dir === "asc" ? "desc" : "asc";
    return (
      <Link href={withRangeParam(companiesPath({ ...baseQuery, sort: field, dir }))} className={cn("hover:text-fg", active && "text-fg")}>
        {label}
        {active && <span aria-hidden>{query.dir === "asc" ? " ↑" : " ↓"}</span>}
      </Link>
    );
  };

  const columns: CompanyColumn[] = ["company", "sector", "subIndustry", "exchange", "country", "price", "change", "marketCap"];

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <Panel
        title={messages.navigation.companies}
        subtitle={`${formatInteger(data.total, locale)} ${locale === "es" ? "valores" : "securities"}`}
        actions={
          <>
            <TimeRangeSelector current={range} basePath={companiesPath({ ...baseQuery, page: query.page })} ranges={["1D", "1W", "1M", "YTD", "1Y"]} />
            <DataProvenanceBadge provenance={data.provenance} />
          </>
        }
      >
        <form method="get" action="/companies" className="flex flex-wrap items-end gap-2 border-b border-border px-2.5 py-2">
          <label className="flex flex-col gap-0.5 text-[10px] font-semibold text-fg-muted uppercase">
            {locale === "es" ? "Buscar" : "Search"}
            <input name="q" defaultValue={query.q} placeholder={messages.states.tickerOrName} className={cn(inputClass, "w-48")} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-semibold text-fg-muted uppercase">
            {messages.common.sector}
            <select name="sector" defaultValue={query.sector} className={inputClass}>
              <option value="">{messages.states.allSectors}</option>
              {data.sectors.map((s) => (
                <option key={s.id} value={s.slug}>
                  {classificationLabel(locale, s.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-semibold text-fg-muted uppercase">
            {messages.common.index}
            <select name="index" defaultValue={query.index} className={inputClass}>
              <option value="">{messages.states.allTracked}</option>
              {data.indices
                .filter((i) => i.constituentsTracked)
                .map((i) => (
                  <option key={i.id} value={i.slug}>
                    {i.name}
                  </option>
                ))}
            </select>
          </label>
          <input type="hidden" name="range" value={range} />
          <button type="submit" className={buttonClass("primary", "sm", "h-8")}>
            {locale === "es" ? "Aplicar" : "Apply"}
          </button>
          {(query.q || query.sector || query.index) && (
            <Link href={withRangeParam("/companies")} className="h-7 px-1 text-2xs leading-7 text-fg-muted uppercase hover:text-fg">
              {locale === "es" ? "Borrar" : "Clear"}
            </Link>
          )}
        </form>

        {data.rows.length === 0 ? (
          <EmptyState title={messages.states.noCompaniesMatch} description={messages.states.differentSearch} />
        ) : (
          <CompanyTable
            rows={data.rows}
            columns={columns}
            locale={locale}
            range={range}
            caption={messages.navigation.companies}
            marketDataIsDemo={data.provenance.isDemo}
            startIndex={(query.page - 1) * data.pageSize}
            sortHeader={{ company: sortLink("company", messages.common.company), sector: sortLink("sector", messages.common.sector) }}
          />
        )}

        <nav aria-label={messages.states.pagination} className="flex items-center justify-between border-t border-border px-2.5 py-1.5 text-2xs text-fg-muted">
          <span className="flex items-center gap-2">
            {sortLink("ticker", locale === "es" ? "Ordenar por ticker" : "Sort by ticker")}
            <span>
              {locale === "es" ? `Página ${query.page} de ${totalPages}` : `Page ${query.page} of ${totalPages}`}
            </span>
          </span>
          <span className="flex gap-2">
            {query.page > 1 && (
              <Link href={withRangeParam(companiesPath({ ...baseQuery, page: query.page - 1 }))} className="hover:text-fg">
                {locale === "es" ? "← Anterior" : "← Previous"}
              </Link>
            )}
            {query.page < totalPages && (
              <Link href={withRangeParam(companiesPath({ ...baseQuery, page: query.page + 1 }))} className="hover:text-fg">
                {locale === "es" ? "Siguiente →" : "Next →"}
              </Link>
            )}
          </span>
        </nav>
      </Panel>
    </div>
  );
}
