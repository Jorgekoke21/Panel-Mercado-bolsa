import "server-only";
import { z } from "zod";
import { ConfigurationError } from "./env";

/**
 * Variables de entorno de los JOBS de sincronización (CLI `npm run sync`), nunca de la app web.
 *
 *   * Secretos (SUPABASE_SERVICE_ROLE_KEY, EODHD_API_TOKEN, ALPACA_API_SECRET…): sin prefijo
 *     NEXT_PUBLIC_, no se registran en logs, no se guardan en Supabase y solo se leen aquí.
 *   * Las credenciales de cada proveedor son OPCIONALES: cada comando exige solo las suyas
 *     (`requireSyncSecret`). SEC no necesita credenciales.
 *   * La app Next.js no importa este módulo (lee de la base de datos con la clave anon + RLS).
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const syncEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is missing"),
  EODHD_API_TOKEN: optional,
  ALPACA_API_KEY_ID: optional,
  ALPACA_API_SECRET_KEY: optional,
  /** "Nombre contacto@dominio" según la política de acceso de la SEC (recomendado). */
  SEC_USER_AGENT: optional,
});

export type SyncEnv = z.infer<typeof syncEnvSchema>;

export function getSyncEnv(source: Record<string, string | undefined> = process.env): SyncEnv {
  const result = syncEnvSchema.safeParse({
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    EODHD_API_TOKEN: source.EODHD_API_TOKEN,
    // Se aceptan también los nombres de la consola de Alpaca (ALPACA_API_KEY / ALPACA_SECRET_KEY).
    ALPACA_API_KEY_ID: source.ALPACA_API_KEY_ID || source.ALPACA_API_KEY,
    ALPACA_API_SECRET_KEY: source.ALPACA_API_SECRET_KEY || source.ALPACA_SECRET_KEY,
    SEC_USER_AGENT: source.SEC_USER_AGENT,
  });
  if (!result.success) {
    // Solo se nombran las variables, nunca sus valores.
    throw new ConfigurationError(
      `Invalid sync environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. ` +
        "Add the variables to .env.local (see .env.example).",
    );
  }
  return result.data;
}

/** Devuelve un secreto obligatorio para un comando concreto (sin revelar valores). */
export function requireSyncSecret<K extends "EODHD_API_TOKEN" | "ALPACA_API_KEY_ID" | "ALPACA_API_SECRET_KEY">(env: SyncEnv, key: K): string {
  const value = env[key];
  if (!value) throw new ConfigurationError(`${key} is not set in .env.local (required for this command).`);
  return value;
}

/** Valores que nunca deben aparecer en la salida. */
export function syncSecrets(env: SyncEnv): string[] {
  return [env.SUPABASE_SERVICE_ROLE_KEY, env.EODHD_API_TOKEN, env.ALPACA_API_KEY_ID, env.ALPACA_API_SECRET_KEY].filter((v): v is string => !!v);
}
