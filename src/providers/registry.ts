import type { ProviderAdapter, ProviderCapability } from "./ports";

/**
 * Selección de proveedor por CAPACIDAD y BOLSA. Permite combinar proveedores (p. ej. EODHD para
 * EE. UU./Europa y otro para Japón, o uno distinto para noticias) sin tocar los jobs.
 * El orden de `adapters` expresa la preferencia.
 */
export function selectAdapter(
  adapters: readonly ProviderAdapter[],
  capability: ProviderCapability,
  exchangeMic: string,
): ProviderAdapter | null {
  return adapters.find((a) => a.capabilities.includes(capability) && a.coverage.exchanges.includes(exchangeMic)) ?? null;
}
