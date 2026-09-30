import type { Metadata } from "next";
import { SyntheticBadge } from "@/components/market/index-badge";
import { SectorCard } from "@/components/market/sector-card";
import { SectorRotationMatrix } from "@/components/market/sector-rotation-matrix";
import { TimeRangeSelector } from "@/components/market/time-range-selector";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getRepositories } from "@/data/registry";
import { parseTimeRange, TIME_RANGES } from "@/domain/time-range";
import { sectorPath } from "@/lib/routes";
import { getSectorsOverview } from "@/services/classification";
import { getServerMessages } from "@/i18n/server";

export const metadata: Metadata = { title: "Sectors" };

export default async function SectorsPage({ searchParams }: PageProps<"/sectors">) {
  const { locale, messages } = await getServerMessages();
  const range = parseTimeRange((await searchParams).range);
  const data = await getSectorsOverview(getRepositories(), range);
  const taxonomy = data.sectors[0]?.sector.taxonomyCode;

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <Panel
        title={locale === "es" ? "Rotación sectorial" : "Sector rotation"}
        subtitle={`${data.sectors.length} ${messages.common.sectors.toLowerCase()} · ${data.universeSecurities} ${locale === "es" ? "valores en el universo de MarketRadar" : "securities in the MarketRadar universe"}`}
        actions={
          <>
            {taxonomy && <Badge variant="outline">{taxonomy}</Badge>}
            <SyntheticBadge methodology="cap_weight" />
            <DataProvenanceBadge provenance={data.provenance} />
          </>
        }
      >
        <SectorRotationMatrix groups={data.sectors} ranges={TIME_RANGES} href={sectorPath} label={locale === "es" ? "Rendimiento sectorial por periodo" : "Sector returns by period"} locale={locale} />
      </Panel>

      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-2xs font-semibold tracking-wide text-fg-muted uppercase">{messages.navigation.sectors} · {range}</h2>
        <TimeRangeSelector current={range} basePath="/sectors" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {data.sectors.map((s) => (
          <SectorCard key={s.id} group={s} range={range} industries={s.industries} locale={locale} />
        ))}
      </div>
    </div>
  );
}
