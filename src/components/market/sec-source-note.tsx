import { Badge } from "@/components/ui/badge";
import type { FilingRecord, IssuerFilingProfile } from "@/data/repositories/fundamentals-repository";
import { formatDate, formatDateTime } from "@/lib/format";
import { companyFilingsUrl, filingIndexUrl } from "@/lib/sec-links";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";

const TEMPLATE_LABEL = { general: "Industrial template", financial: "Financial template (bank / insurer / broker)", reit: "REIT template" } as const;

/** Insignia de procedencia de fundamentales oficiales (SEC EDGAR · XBRL). */
export function SecSourceBadge({ profile, locale = DEFAULT_LOCALE }: { profile: IssuerFilingProfile; locale?: Locale }) {
  return (
    <Badge
      variant="positive"
      title={`${locale === "es" ? "Informes oficiales" : "Official filings"} (SEC EDGAR XBRL) · CIK ${profile.cik} · SIC ${profile.sic ?? "?"} ${profile.sicDescription ?? ""} · ${locale === "es" ? "descargado" : "downloaded"} ${formatDateTime(profile.ingestedAt, locale)}`}
    >
      {locale === "es" ? "Informes SEC" : "SEC filings"}
    </Badge>
  );
}

/** Pie de procedencia: fuente, CIK, plantilla sectorial, último filing y leyenda de marcas. */
export function SecSourceNote({ profile, latestFiling, legend = true, locale = DEFAULT_LOCALE }: { profile: IssuerFilingProfile; latestFiling?: FilingRecord | null; legend?: boolean; locale?: Locale }) {
  const template = locale === "es" ? { general: "Plantilla industrial", financial: "Plantilla financiera (banco / aseguradora / bróker)", reit: "Plantilla REIT" } : TEMPLATE_LABEL;
  return (
    <div className="flex flex-col gap-1 border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">
      <p>
        {locale === "es" ? "Fuente:" : "Source:"}{" "}
        <a href={companyFilingsUrl(profile.cik)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          SEC EDGAR
        </a>{" "}
        XBRL (US GAAP) · CIK {profile.cik} · {template[profile.industryTemplate]}
        {profile.sicDescription && ` · SIC ${profile.sic} ${profile.sicDescription}`}
        {latestFiling && (
          <>
            {locale === "es" ? " · último informe " : " · latest "}
            <a href={filingIndexUrl(profile.cik, latestFiling.accessionNumber)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {latestFiling.form} {locale === "es" ? "presentado el" : "filed"} {formatDate(latestFiling.filingDate, locale)}
            </a>
          </>
        )}
        {` · ${locale === "es" ? "descargado" : "downloaded"} ${formatDateTime(profile.ingestedAt, locale)}`}
      </p>
      {legend && (
        <p>
          {locale === "es" ? "Sin marca = dato publicado en un informe · " : "No mark = reported in a filing · "}<sup className="font-semibold">d</sup> {locale === "es" ? "derivado por MarketRadar a partir de valores publicados (p. ej., T4 = ejercicio − 9 meses) · " : "derived by MarketRadar from reported values (e.g. Q4 = FY − 9 months) · "}<sup className="font-semibold">c</sup> {locale === "es" ? "calculado por MarketRadar · — no disponible (pasa el cursor para ver el motivo) · n/a no aplica. Pasa el cursor sobre una cifra para ver su concepto, informe y número de acceso." : "calculated by MarketRadar · — not available (hover for the reason) · n/a not applicable. Hover any figure for its concept, filing and accession number."}
        </p>
      )}
    </div>
  );
}
