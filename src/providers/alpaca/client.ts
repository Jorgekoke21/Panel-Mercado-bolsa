import { ProviderError, redact } from "../errors";

/**
 * Cliente de Alpaca (plan Basic gratuito). SOLO servidor / CLI.
 *
 *   * Credenciales en cabeceras (APCA-API-KEY-ID / APCA-API-SECRET-KEY); nunca en URL ni en logs.
 *   * Plan Basic: 200 peticiones/min ⇒ intervalo mínimo de 350 ms entre peticiones.
 *   * Plan Basic verificado: SIP solo con más de 15 min de antigüedad (lo reciente ⇒ 403); el
 *     adaptador nunca pide datos más recientes.
 *   * Los errores se redactan: las claves nunca aparecen en mensajes.
 */
export const ALPACA_PROVIDER_ID = "alpaca";
const DATA_URL = "https://data.alpaca.markets";
const TRADING_URL = "https://paper-api.alpaca.markets";

export interface AlpacaClientOptions {
  keyId: string;
  secretKey: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AlpacaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private nextSlot = 0;
  requestCount = 0;

  constructor(private readonly options: AlpacaClientOptions) {
    if (!options.keyId || !options.secretKey) throw new ProviderError("auth", ALPACA_PROVIDER_ID, "client", "Alpaca API key / secret are not configured");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 350;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  data(path: string, params: Record<string, string>): Promise<unknown> {
    return this.get(DATA_URL, path, params);
  }

  trading(path: string, params: Record<string, string> = {}): Promise<unknown> {
    return this.get(TRADING_URL, path, params);
  }

  private async get(base: string, path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    for (let attempt = 0; ; attempt++) {
      const wait = this.nextSlot - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextSlot = this.now() + this.minIntervalMs;
      this.requestCount++;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { "APCA-API-KEY-ID": this.options.keyId, "APCA-API-SECRET-KEY": this.options.secretKey, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
          cache: "no-store",
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new ProviderError("transient", ALPACA_PROVIDER_ID, path, this.safe(error instanceof Error ? error.message : String(error)));
      }
      const body = await response.text();
      if (response.ok) {
        try {
          return JSON.parse(body) as unknown;
        } catch {
          throw new ProviderError("invalid_response", ALPACA_PROVIDER_ID, path, "Non-JSON body", { status: response.status });
        }
      }
      const status = response.status;
      const detail = this.safe(body.slice(0, 200)) || `HTTP ${status}`;
      if ((status === 429 || status >= 500) && attempt < this.maxRetries) {
        await this.sleep(Number(response.headers.get("retry-after") ?? 0) * 1000 || 2000 * 2 ** attempt);
        continue;
      }
      if (status === 401 || status === 403) throw new ProviderError("auth", ALPACA_PROVIDER_ID, path, detail, { status });
      if (status === 404) throw new ProviderError("not_found", ALPACA_PROVIDER_ID, path, detail, { status });
      if (status === 429) throw new ProviderError("rate_limited", ALPACA_PROVIDER_ID, path, detail, { status });
      if (status >= 500) throw new ProviderError("transient", ALPACA_PROVIDER_ID, path, detail, { status });
      throw new ProviderError("invalid_response", ALPACA_PROVIDER_ID, path, detail, { status });
    }
  }

  private safe(text: string): string {
    return redact(text, [this.options.keyId, this.options.secretKey]);
  }
}
