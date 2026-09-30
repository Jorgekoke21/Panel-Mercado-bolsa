import { ProviderError } from "../errors";

/**
 * Cliente de data.sec.gov (gratuito, sin API key).
 *
 * Política de acceso justo de la SEC: máximo 10 peticiones/segundo y User-Agent declarado
 * ("Nombre contacto@dominio"). Este cliente se limita a 5 peticiones/segundo, serializadas.
 * https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
 */
export const SEC_PROVIDER_ID = "sec";
const BASE_URL = "https://data.sec.gov";
/** Archivos de los filings (índices e instancias XBRL). Exige un User-Agent con contacto. */
const ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";
export const DEFAULT_SEC_USER_AGENT = "MarketRadar personal research (non-commercial)";

export interface SecClientOptions {
  userAgent?: string;
  fetchImpl?: typeof fetch;
  /** Intervalo mínimo entre peticiones (ms). 200 ms = 5 req/s. */
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SecClient {
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private nextSlot = 0;
  private queue: Promise<void> = Promise.resolve();
  requestCount = 0;

  constructor(options: SecClientOptions = {}) {
    this.userAgent = options.userAgent?.trim() || DEFAULT_SEC_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = Math.max(options.minIntervalMs ?? 200, 100);
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  companyFacts(cik: string): Promise<unknown> {
    return this.getJson(`/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`);
  }

  submissions(cik: string): Promise<unknown> {
    return this.getJson(`/submissions/CIK${cik.padStart(10, "0")}.json`);
  }

  /** Página histórica del índice de filings (nombre dado por `filings.files[].name`). */
  submissionsPage(name: string): Promise<unknown> {
    if (!/^CIK\d{10}-submissions-\d{3}\.json$/.test(name)) throw new ProviderError("invalid_response", SEC_PROVIDER_ID, "submissions page", `Unexpected page name ${name}`);
    return this.getJson(`/submissions/${name}`);
  }

  /** Espera su turno respetando el intervalo mínimo (serializa todas las peticiones). */
  private async throttle(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.nextSlot - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextSlot = this.now() + this.minIntervalMs;
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  async getJson(path: string): Promise<unknown> {
    const text = await this.request(`${BASE_URL}${path}`, path, "application/json");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError("invalid_response", SEC_PROVIDER_ID, path, "Non-JSON body");
    }
  }

  /** Índice de un filing (lista de ficheros). */
  async filingIndex(cik: string, accession: string): Promise<unknown> {
    const path = `/${Number(cik)}/${this.accessionPath(accession)}/index.json`;
    const text = await this.request(`${ARCHIVES_URL}${path}`, path, "application/json");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError("invalid_response", SEC_PROVIDER_ID, path, "Non-JSON filing index");
    }
  }

  /** Un fichero de un filing (p. ej. la instancia XBRL `*_htm.xml`). */
  filingFile(cik: string, accession: string, file: string): Promise<string> {
    if (!/^[\w.-]+$/.test(file)) throw new ProviderError("invalid_response", SEC_PROVIDER_ID, "filing file", `Unexpected file name ${file}`);
    const path = `/${Number(cik)}/${this.accessionPath(accession)}/${file}`;
    return this.request(`${ARCHIVES_URL}${path}`, path, "application/xml,text/xml,*/*");
  }

  private accessionPath(accession: string): string {
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) throw new ProviderError("invalid_response", SEC_PROVIDER_ID, "accession", `Unexpected accession ${accession}`);
    return accession.replace(/-/g, "");
  }

  private async request(url: string, path: string, accept: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      this.requestCount++;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { "User-Agent": this.userAgent, Accept: accept, "Accept-Encoding": "gzip, deflate" },
          signal: AbortSignal.timeout(60_000),
          cache: "no-store",
        });
      } catch (error) {
        const e = new ProviderError("transient", SEC_PROVIDER_ID, path, error instanceof Error ? error.message : String(error));
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw e;
      }
      if (response.ok) return response.text();
      const status = response.status;
      if (status === 404) throw new ProviderError("not_found", SEC_PROVIDER_ID, path, "No data for this CIK", { status });
      if (status === 403) throw new ProviderError("auth", SEC_PROVIDER_ID, path, "Blocked by SEC fair-access policy (set SEC_USER_AGENT with a contact email)", { status });
      const retryable = status === 429 || status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new ProviderError(status === 429 ? "rate_limited" : retryable ? "transient" : "invalid_response", SEC_PROVIDER_ID, path, `HTTP ${status}`, { status });
    }
  }
}
