import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Manifiesto de datasets del seed (`data/seed/manifest.json`).
 *
 * Cada dataset externo queda fijado por revisión para que la descarga sea reproducible
 * y para poder responder "¿de qué fecha es nuestra composición del S&P 500?".
 */
export const datasetManifestEntrySchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.url(),
  license: z.string().min(1),
  /** Fuente secundaria (p. ej. Wikipedia) frente a la fuente primaria/oficial. */
  isSecondarySource: z.boolean(),
  /** Fichero local, relativo a `data/seed/`. */
  file: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.iso.datetime(),
  /** Fecha efectiva del contenido según la fuente oficial, si existe. */
  effectiveDate: z.iso.date().nullable(),
  wikipedia: z
    .object({
      pageTitle: z.string(),
      revisionId: z.number().int().positive(),
      revisionTimestamp: z.iso.datetime(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  datasets: z.array(datasetManifestEntrySchema).min(1),
});

export type DatasetManifestEntry = z.infer<typeof datasetManifestEntrySchema>;
export type SeedManifest = z.infer<typeof manifestSchema>;

export function readManifest(path: string): SeedManifest {
  return manifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function findDataset(manifest: SeedManifest, key: string): DatasetManifestEntry {
  const entry = manifest.datasets.find((d) => d.key === key);
  if (!entry) throw new Error(`Dataset "${key}" missing from manifest`);
  return entry;
}
