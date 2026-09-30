# ADR-0003 — Procedencia obligatoria y datos DEMO

- Estado: aceptada (D5, CAMBIO 7) · 2026-09-29

## Decisión
- Todo dataset de mercado se devuelve como `WithProvenance<T>` con `{ source, sourceLabel, asOf, isDelayed, isDemo }`.
- Los datos de referencia persistidos llevan `dataset_id` → `datasets` (fuente, revisión, sha256, fecha de descarga, fecha efectiva).
- En Fase 1 los datos de mercado son simulados: generador determinista por ticker, nunca persistido, `isDemo: true`.
- `DataProvenanceBadge` muestra DEMO / Delayed / Stale a partir de la procedencia declarada; los componentes no la deducen.

## Consecuencias
- Cualquier panel con datos simulados se identifica visualmente; además hay un aviso global en la barra superior.
- El mismo mecanismo servirá para datos retrasados, desactualizados y fuentes como FMP, SEC, Fed o BCE.
