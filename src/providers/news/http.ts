import { ProviderError } from "../errors";

/**
 * Cliente HTTP de texto para fuentes de noticias: User-Agent declarado, intervalo mínimo entre
 * peticiones (GDELT exige ≥ 5 s), reintentos con espera y errores tipados.
 */
export interface NewsHttpOptions {
  provider: string;
  userAgent: string;
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class NewsHttpClient {
  requestCount = 0;
  private last = 0;
  private readonly o: Required<Omit<NewsHttpOptions, "fetchImpl" | "sleep">> & { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void> };

  constructor(options: NewsHttpOptions) {
    this.o = {
      minIntervalMs: 0,
      maxRetries: 2,
      timeoutMs: 30_000,
      ...options,
      fetchImpl: options.fetchImpl ?? fetch,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  async getText(url: string, operation: string): Promise<string> {
    let attempt = 0;
    for (;;) {
      const wait = this.last + this.o.minIntervalMs - Date.now();
      if (wait > 0) await this.o.sleep(wait);
      this.last = Date.now();
      this.requestCount++;
      let response: Response;
      try {
        response = await this.o.fetchImpl(url, {
          headers: { "User-Agent": this.o.userAgent, Accept: "application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
      } catch (error) {
        if (attempt++ < this.o.maxRetries) {
          await this.o.sleep(2_000 * attempt);
          continue;
        }
        throw new ProviderError("transient", this.o.provider, operation, error instanceof Error ? error.message : String(error));
      }
      const body = await response.text();
      if (response.ok) {
        // GDELT responde 200 con un texto de aviso cuando se supera el límite.
        if (/^Please limit requests/i.test(body.trim())) {
          if (attempt++ < this.o.maxRetries) {
            await this.o.sleep(6_000 * attempt);
            continue;
          }
          throw new ProviderError("rate_limited", this.o.provider, operation, "rate limit notice");
        }
        return body;
      }
      if ((response.status === 429 || response.status >= 500) && attempt++ < this.o.maxRetries) {
        await this.o.sleep(response.status === 429 ? 12_000 * attempt : 2_000 * attempt);
        continue;
      }
      const kind = response.status === 429 ? "rate_limited" : response.status === 404 ? "not_found" : response.status === 401 || response.status === 403 ? "auth" : response.status >= 500 ? "transient" : "invalid_response";
      throw new ProviderError(kind, this.o.provider, operation, `HTTP ${response.status}`, { status: response.status });
    }
  }
}
