import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/config/env";
import type { Database } from "./database.types";

export type MarketRadarSupabase = SupabaseClient<Database>;

/**
 * Cliente Supabase de servidor. Usa la clave anon: toda lectura pasa por RLS.
 * Sin sesión persistente (Fase 1 no tiene autenticación).
 */
export function createServerSupabase(): MarketRadarSupabase {
  const env = getServerEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
