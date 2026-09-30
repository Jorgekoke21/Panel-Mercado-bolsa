import "server-only";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProviderError } from "@/providers/errors";
import { z } from "zod";
import { SEC_PROVIDER_ID, type SecClient } from "@/providers/sec/client";
import { type CoverData, parseCoverInstance } from "@/providers/sec/cover";
import type { SecSource } from "./sec-job";

/**
 * Caché en disco de respuestas SEC (data/cache/sec, fuera de git).
 *
 *   * Evita repetir descargas al re-normalizar (desarrollo, cambios del mapa de concepts).
 *   * `offline`: solo caché; si falta un fichero, error `not_found` (nunca se inventa nada).
 *   * `maxAgeHours`: pasado ese tiempo se vuelve a descargar (los filings nuevos llegan a diario).
 */
export class CachedSecSource implements SecSource {
  constructor(
    private readonly client: SecClient,
    private readonly dir: string,
    private readonly options: { offline: boolean; maxAgeHours: number },
  ) {
    mkdirSync(dir, { recursive: true });
  }

  get requestCount(): number {
    return this.client.requestCount;
  }

  companyFacts(cik: string): Promise<unknown> {
    return this.load(`companyfacts-${cik.padStart(10, "0")}.json`, () => this.client.companyFacts(cik));
  }

  submissions(cik: string): Promise<unknown> {
    return this.load(`submissions-${cik.padStart(10, "0")}.json`, () => this.client.submissions(cik));
  }

  submissionsPage(name: string): Promise<unknown> {
    return this.load(name, () => this.client.submissionsPage(name));
  }

  private async load(file: string, fetcher: () => Promise<unknown>): Promise<unknown> {
    const path = join(this.dir, file);
    const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < this.options.maxAgeHours * 3_600_000;
    if (existsSync(path) && (this.options.offline || fresh)) return JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (this.options.offline) throw new ProviderError("not_found", SEC_PROVIDER_ID, file, "Not in the offline cache");
    const json = await fetcher();
    writeFileSync(path, JSON.stringify(json), "utf8");
    return json;
  }
}

/**
 * Portadas XBRL de filings (acciones por clase). Se cachea el RESULTADO analizado por accession
 * (data/cache/sec/covers/<accession>.json, unos KB): un filing presentado no cambia, así que cada
 * instancia (~1–3 MB) se descarga una sola vez.
 */
export class CachedCoverSource {
  constructor(
    private readonly client: SecClient,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  get requestCount(): number {
    return this.client.requestCount;
  }

  async cover(cik: string, accession: string): Promise<CoverData> {
    const path = join(this.dir, `${accession}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as CoverData;
    const index = filingIndexSchema.safeParse(await this.client.filingIndex(cik, accession));
    if (!index.success) throw new ProviderError("invalid_response", SEC_PROVIDER_ID, "filing index", "Unexpected filing index shape");
    const names = index.data.directory.item.map((i) => i.name);
    // Filings inline XBRL: instancia extraída `*_htm.xml`; filings antiguos: la instancia .xml del paquete.
    const instance = names.find((n) => n.endsWith("_htm.xml")) ?? names.find((n) => /\.xml$/i.test(n) && !/_(cal|def|lab|pre)\.xml$|FilingSummary|MetaLinks/i.test(n));
    if (!instance) throw new ProviderError("not_found", SEC_PROVIDER_ID, "filing index", `No XBRL instance in filing ${accession}`);
    const cover = parseCoverInstance(await this.client.filingFile(cik, accession, instance));
    writeFileSync(path, JSON.stringify(cover), "utf8");
    return cover;
  }
}

const filingIndexSchema = z.object({ directory: z.object({ item: z.array(z.object({ name: z.string() })) }) });
