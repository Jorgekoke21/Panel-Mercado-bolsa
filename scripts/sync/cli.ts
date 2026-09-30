/**
 * CLI de sincronización. Se ejecuta en servidor/local, nunca desde la app web.
 *
 *   SEC (gratuito):   sec · sec-report                                  → scripts/sync/sec-commands.ts
 *   Alpaca (gratuito, requiere cuenta Basic): alpaca                      → scripts/sync/alpaca-commands.ts
 *   EODHD (opcional): preflight · pilot · validate · idempotency · usage → scripts/sync/eodhd-commands.ts
 *   Noticias (gratuito): news · news-report · news-rebuild · news-prune     → scripts/sync/news-commands.ts
 *
 * Secretos desde .env.local; nunca se imprimen (toda la salida pasa por `redact`).
 */
import { getSyncEnv, syncSecrets } from "@/config/sync-env";
import { redact } from "@/providers/errors";
import { createServiceSupabase, SupabaseSyncStore } from "@/sync/supabase-store";
import { ALPACA_COMMANDS, runAlpacaCommand } from "./alpaca-commands";
import { AUTO_COMMANDS, runAutoCommand } from "./auto-commands";
import { EODHD_COMMANDS, runEodhdCommand } from "./eodhd-commands";
import { NEWS_COMMANDS, runNewsCommand } from "./news-commands";
import { AI_COMMANDS, runAiCommand } from "./ai-commands";
import { runSecCommand, SEC_COMMANDS } from "./sec-commands";
import type { CommandDeps } from "./shared";

const includes = (list: readonly string[], value: string) => list.includes(value);

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const env = getSyncEnv();
  const secrets = [...syncSecrets(env), process.env.OPENAI_API_KEY].filter((v): v is string => !!v);
  const log = (line: string) => console.log(redact(line, secrets));
  const db = createServiceSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const deps: CommandDeps = { env, db, store: new SupabaseSyncStore(db), log };

  if (includes(SEC_COMMANDS, command)) return runSecCommand(command, args, deps);
  if (includes(ALPACA_COMMANDS, command)) return runAlpacaCommand(command, args, deps);
  if (includes(AUTO_COMMANDS, command)) return runAutoCommand(command, args, deps);
  if (includes(EODHD_COMMANDS, command)) return runEodhdCommand(command, args, deps);
  if (includes(NEWS_COMMANDS, command)) return runNewsCommand(command, args, deps);
  if (includes(AI_COMMANDS, command)) return runAiCommand(command, args, deps);
  console.log(
    [
      "Usage: npm run sync -- <command> [options]",
      "  SEC (free):      sec [--tickers A,B | --index sp500] [--offline] [--since YYYY-MM-DD] · sec-classes · sec-report",
      "  Alpaca (free):   alpaca [--tickers A,B | --index sp500] · alpaca-report · alpaca-validate [--tickers A,B]",
      "  Automatic:       auto [--force] [--dry-run]   (calendar-aware; run it hourly from a scheduler) · status",
      "  EODHD (optional): preflight [--probe] · pilot · validate · idempotency · usage  [--tickers A,B]",
      "  News (free):     news [--sources gdelt,sec-8k,fed-monetary,…] [--force] [--dry-run] [--lookback H] · news-report · news-rebuild [--days N] · news-prune",
      "  AI (paid, off by default): ai-status · ai-enrich [--days 3] [--deep 5] [--fast 10] [--plan]",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const env = process.env;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(redact(message, [env.EODHD_API_TOKEN, env.SUPABASE_SERVICE_ROLE_KEY, env.ALPACA_API_KEY_ID, env.ALPACA_API_SECRET_KEY, env.ALPACA_API_KEY, env.ALPACA_SECRET_KEY, env.OPENAI_API_KEY]));
  process.exitCode = 1;
});
