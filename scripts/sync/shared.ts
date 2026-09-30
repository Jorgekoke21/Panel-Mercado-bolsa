import type { SyncEnv } from "@/config/sync-env";
import { PILOT_TICKERS } from "@/config/pilot";
import type { SupabaseSyncStore, createServiceSupabase } from "@/sync/supabase-store";

export interface CommandDeps {
  env: SyncEnv;
  db: ReturnType<typeof createServiceSupabase>;
  store: SupabaseSyncStore;
  log: (line: string) => void;
}

export function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parseTickers(args: readonly string[], fallback: readonly string[] = PILOT_TICKERS): string[] {
  const value = argValue(args, "--tickers");
  return value ? value.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : [...fallback];
}
