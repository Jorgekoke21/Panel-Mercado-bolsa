import { createHash } from "node:crypto";

/** Namespace fijo de MarketRadar para UUID v5 (no cambiar: rompería la estabilidad de los ids). */
const MARKETRADAR_NAMESPACE = "5f0c7a52-9d1e-4b8e-a3c2-6d7f1e2b9a40";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/**
 * UUID v5 (RFC 9562) determinista a partir de una clave natural, p. ej. `security:XNAS:NVDA`.
 * Permite que `supabase/seed.sql` sea estable entre ejecuciones y que los ids no cambien
 * al reconstruir la base de datos.
 */
export function deterministicUuid(naturalKey: string): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(MARKETRADAR_NAMESPACE), Buffer.from(naturalKey, "utf8")]))
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
