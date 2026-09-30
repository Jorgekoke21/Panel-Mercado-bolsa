# ADR-0005 — Taxonomía parametrizada y fuente GICS

- Estado: aceptada (D3 + decisión de fuente del 2026-09-29)

## Contexto
MSCI bloquea la descarga automática del fichero oficial de estructura GICS.

## Decisión
- La jerarquía de 4 niveles (sector → grupo de industria → industria → sub-industria) se modela por `taxonomy_code`, así que en Europa podrá convivir ICB u otra taxonomía.
- Fuente actual: tabla GICS de Wikipedia fijada por revisión, marcada como secundaria y **validada cruzando** las 126 sub-industrias del S&P 500 (todas deben existir y pertenecer al sector declarado).
- `/industry/[slug]` corresponde a la industria GICS (74) y `/industry/[slug]/[subSlug]` a la sub-industria (D12), porque hay nombres repetidos entre niveles (p. ej. Airlines).

## Consecuencias
- Sustituir la fuente por el fichero oficial de MSCI solo requiere un parser nuevo en `scripts/seed`.
- Las clasificaciones cambian con el tiempo; el historial de clasificación por empresa queda pendiente.
