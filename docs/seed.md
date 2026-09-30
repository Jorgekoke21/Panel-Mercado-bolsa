# Seed del universo S&P 500

El seed es **reproducible, fechado, validado y documentado**. No contiene listas escritas a mano ni datos financieros.

## Fuentes

| Dataset (`datasets.key`) | Fuente | Fijado por | Uso |
|---|---|---|---|
| `wikipedia-sp500-constituents` | Wikipedia — *List of S&P 500 companies* (CC BY-SA 4.0) | `revid` en `data/seed/manifest.json` | Componentes: ticker, bolsa (plantilla del símbolo), nombre, sector y sub-industria GICS, sede, fecha de alta, CIK, año de fundación |
| `wikipedia-gics-structure` | Wikipedia — *Global Industry Classification Standard* (CC BY-SA 4.0) | `revid` | Jerarquía GICS de 4 niveles con códigos |
| `marketradar-reference` | CSV mantenidos a mano en `data/seed/reference/` | Git | Países (ISO), bolsas (MIC), catálogo de índices, temas de ejemplo definidos explícitamente |

Ambas fuentes de Wikipedia son **secundarias** (`is_secondary_source = true`):

- No son ficheros oficiales de S&P Dow Jones Indices ni de MSCI. MSCI bloquea la descarga automática de su fichero oficial, así que se usa Wikipedia con validación cruzada (decisión aprobada). Cuando esté disponible, el fichero oficial se puede incorporar con el mismo pipeline.
- `effective_date` es `null`: la fuente no publica una fecha efectiva oficial. La fecha de referencia es la de la revisión (`source_revision_at`).
- La composición **no es válida históricamente**: solo refleja los componentes vigentes en esa revisión. `added_on` es la fecha de alta que documenta la fuente.

## Pipeline

```
npm run seed:fetch                → descarga la última revisión y reescribe manifest.json (nueva instantánea)
npm run seed:fetch -- --pinned    → vuelve a descargar EXACTAMENTE las revisiones del manifiesto
npm run seed:build                → valida y genera supabase/seed.sql (determinista)
npm run db:reset                  → recrea la base local: migraciones + seed
```

1. `fetch-sources.ts`: la API de MediaWiki devuelve el wikitext y el `revid`; se guardan en `data/seed/raw/*.wikitext` junto con su sha256.
2. `build-seed.ts` comprueba el sha256, parsea (`lib/parse-sp500.ts`, `lib/parse-gics.ts`), normaliza (`lib/normalize.ts`) y valida (`lib/validate.ts`). Si falla cualquier comprobación, aborta sin escribir.
3. Los ids son UUID v5 derivados de claves naturales (`company:cik:…`, `security:MIC:TICKER`…), así que el SQL generado es estable entre ejecuciones.

## Validaciones (el build falla si alguna no se cumple)

- 495–510 componentes (cordura del dataset actual) y 11 sectores GICS.
- Cada fila cumple el esquema zod (fecha ISO, CIK de 10 dígitos…).
- Cada sub-industria y sector de la lista existe en la estructura GICS y la sub-industria pertenece a ese sector.
- Cada plantilla de símbolo se traduce a una bolsa conocida (NYSE → XNYS, Nasdaq → XNAS, Cboe BZX → BATS).
- Cada sede se resuelve a un país del catálogo (o está explícitamente vacía).
- No hay tickers, CIK, slugs, códigos ni ids duplicados.
- Cada empresa tiene al menos un valor y exactamente uno principal (clase A cuando hay varias).
- Los temas solo se asignan a tickers del universo y a temas definidos.

## Resultado actual

Revisiones: constituents `1376729338` (2026-09-25T22:49:33Z) · GICS `1373583957` (2026-09-06T19:31:56Z).

| Entidad | Filas |
|---|---|
| Sectores / grupos / industrias / sub-industrias | 11 / 25 / 74 / 163 |
| Empresas | 500 |
| Valores (securities) | 503 (XNYS 344 · XNAS 158 · BATS 1) |
| Componentes del S&P 500 | 503 |
| Países de sede | US 475 · IE 11 · GB 5 · CH 3 · NL 2 · BM 2 · CA 1 · sin dato 1 |
| Temas / asignaciones | 6 / 7 (solo los ejemplos NVDA y PLTR del brief) |

## Actualizar la composición

1. `npm run seed:fetch` (nueva revisión).
2. `npm run seed:build` y revisar el diff de `supabase/seed.sql`.
3. `npm run db:reset`.

En Fase 2 las altas y bajas se registrarán como cambios fechados (`removed_on`) en lugar de reemplazar la instantánea.
