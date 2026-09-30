import { ProviderError, redact } from "../errors";

/**
 * Cliente HTTP mínimo de EODHD. SOLO servidor (jobs de sincronización).
 *
 *   * El token viaja únicamente en la query de la petición; nunca en mensajes de error ni logs
 *     (todo texto que sale del cliente pasa por `redact`).
 *   * Traduce códigos HTTP a errores tipados. Reintenta 429 / 5xx / red con espera exponencial.
 *   * Cuenta las peticiones realizadas (para estimar créditos consumidos).
 */
export const EODHD_PROVIDER_ID = "eodhd";
const DEFAULT_BASE_URL = "https://eodhd.com/api";

export interface EodhdClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class EodhdClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Peticiones HTTP enviadas (incluye reintentos). */
  requestCount = 0;

  constructor(options: EodhdClientOptions) {
    if (!options.token) throw new ProviderError("auth", EODHD_PROVIDER_ID, "client", "EODHD_API_TOKEN is not configured");
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** `path` sin credenciales, p. ej. "/eod/AAPL.US". Es también la etiqueta de operación en errores. */
  async getJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("api_token", this.token);

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(url, path);
      } catch (error) {
        const typed = this.toProviderError(error, path);
        const canRetry = typed.retryable && typed.details.status !== 402 && attempt < this.maxRetries;
        if (!canRetry) throw typed;
        await this.sleep(typed.details.retryAfterMs ?? 500 * 2 ** attempt);
      }
    }
  }

  private async once(url: URL, operation: string): Promise<unknown> {
    this.requestCount++;
    const response = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) throw this.httpError(response.status, response.headers.get("retry-after"), body, operation);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ProviderError("invalid_response", EODHD_PROVIDER_ID, operation, `Non-JSON body: ${this.snippet(body)}`, {
        status: response.status,
      });
    }
  }

  private httpError(status: number, retryAfter: string | null, body: string, operation: string): ProviderError {
    const detail = this.snippet(body) || `HTTP ${status}`;
    const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined;
    if (status === 401) return new ProviderError("auth", EODHD_PROVIDER_ID, operation, `Invalid API token (${detail})`, { status });
    if (status === 403)
      return new ProviderError("auth", EODHD_PROVIDER_ID, operation, `Not included in the subscription plan (${detail})`, { status });
    // 402: cuota diaria agotada. Es rate limit, pero reintentar hoy no sirve.
    if (status === 402) return new ProviderError("rate_limited", EODHD_PROVIDER_ID, operation, `Daily API limit reached (${detail})`, { status });
    if (status === 429) return new ProviderError("rate_limited", EODHD_PROVIDER_ID, operation, detail, { status, retryAfterMs });
    if (status === 404) return new ProviderError("not_found", EODHD_PROVIDER_ID, operation, detail, { status });
    if (status >= 500) return new ProviderError("transient", EODHD_PROVIDER_ID, operation, detail, { status });
    return new ProviderError("invalid_response", EODHD_PROVIDER_ID, operation, detail, { status });
  }

  private toProviderError(error: unknown, operation: string): ProviderError {
    if (error instanceof ProviderError) return error;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return new ProviderError("transient", EODHD_PROVIDER_ID, operation, this.redact(message));
  }

  private snippet(body: string): string {
    return this.redact(body.replace(/\s+/g, " ").trim().slice(0, 200));
  }

  private redact(text: string): string {
    return redact(text, [this.token]);
  }
}
