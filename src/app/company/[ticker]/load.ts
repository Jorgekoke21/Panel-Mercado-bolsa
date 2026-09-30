import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getRepositories } from "@/data/registry";
import { companyPath } from "@/lib/routes";
import { type CompanyHeaderData, getCompanyHeader } from "@/services/companies";

/**
 * Carga la cabecera de la ficha una sola vez por petición (layout + pestaña comparten resultado).
 * Normaliza la URL: /company/nvda → /company/NVDA.
 */
export const loadCompanyHeader = cache(async (tickerParam: string): Promise<CompanyHeaderData> => {
  const lookup = await getCompanyHeader(getRepositories(), tickerParam);
  if (lookup.kind === "redirect") redirect(companyPath(lookup.ticker));
  if (lookup.kind === "not_found") notFound();
  return lookup.data;
});
