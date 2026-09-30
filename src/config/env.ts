import "server-only";
import { z } from "zod";

/**
 * Variables de entorno SERVER-ONLY. Se validan de forma perezosa (al primer acceso a datos),
 * no al importar, para que `next build` no necesite credenciales.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20, "SUPABASE_ANON_KEY is missing"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class ConfigurationError extends Error {
  override name = "ConfigurationError";
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    throw new ConfigurationError(
      `Invalid server environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. ` +
        "Copy .env.example to .env.local and fill in the values printed by `npx supabase status`.",
    );
  }
  cached = result.data;
  return cached;
}
