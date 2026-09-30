# Arquitectura de MarketRadar

> Estado: Fase 2B.3 (coste 0 €: fundamentales SEC y precios Alpaca SIP del S&P 500; EODHD opcional). Documento vivo. Detalle del pipeline de datos: [market-data.md](market-data.md).

## Principios

1. **Mostrar qué pasa y cómo se conecta**, no solo qué sube o baja.
2. **Ningún dato financiero inventado.** Los datos proceden de fuentes estructuradas; la IA (Fase 5) solo interpreta datos verificados.
3. **Procedencia como principio de arquitectura.** Todo dataset que llega a la UI viaja con `{ source, sourceLabel, asOf, isDelayed, isDemo }` (`src/domain/provenance.ts`). Los componentes muestran la procedencia; nunca la deducen.
4. **Global por diseño.** Nada del dominio asume USD, EE. UU., NYSE/Nasdaq, S&P 500 ni GICS. Esas elecciones viven en datos (`countries`, `exchanges`, `indices`, `taxonomies`) o en configuración (`src/config/*`).
5. **Oficial ≠ sintético.** Un índice o agregado calculado por MarketRadar se etiqueta siempre como `Synthetic` con su metodología.

## Capas

```
src/app/            Rutas (Server Components). Componen servicios + componentes. Sin lógica financiera.
src/components/     UI: ui/ (primitivas) · layout/ · market/ (dominio) · entity/ (EntityPage) · states/
src/services/       Casos de uso: dashboard, markets, classification, companies, search.
                    Reciben `Repositories` por parámetro → testeables con implementaciones en memoria.
src/data/           Acceso a datos.
  repositories/     Interfaces: ReferenceRepository, MarketDataRepository, PriceHistoryRepository.
  supabase/         Implementación sobre PostgREST (server-only) + mappers fila → dominio + tipos generados.
  mock/             MarketDataRepository simulado (DEMO): solo si no hay ningún dato real, y benchmarks.
  memory/           ReferenceRepository en memoria (tests).
  registry.ts       Composition root: único punto que elige implementaciones (una instancia por petición).
src/providers/      Puertos por capacidad (ports.ts), errores tipados, selección por capacidad+bolsa y adaptadores:
                    sec/ (motor XBRL: parse, concepts, normalize), alpaca/ (precios EE. UU.), eodhd/ (opcional).
                    Solo los usa src/sync.
src/sync/           Jobs idempotentes (identificadores, fundamentales, precios, acciones, factores), SyncStore
                    (Supabase service_role / memoria), informe de cobertura. Solo el CLI scripts/sync los ejecuta.
src/domain/         Tipos puros del dominio (sin React, sin Supabase).
src/lib/            Funciones puras: calculations/ (treemap, breadth, aggregation, ranking, returns,
                    group-performance), format/, color-scale, ticker, slug, routes.
src/config/         Navegación, universo principal, activos de contexto, registro de rankings, env.
scripts/seed/       Pipeline reproducible del seed (descarga fijada → validación → seed.sql).
scripts/sync/       CLI de sincronización (npm run sync -- pilot|validate|idempotency|usage).
supabase/           config.toml, migraciones SQL y seed.sql generado.
```

### Providers frente a repositories

- **Provider** (`src/providers`): habla con una fuente externa (hoy EODHD). Solo lo usan los **jobs de sincronización** (`src/sync`, CLI), que escriben en la base de datos con service_role.
- **Repository** (`src/data/repositories`): lee de **nuestra** base de datos. La UI y los servicios solo conocen repositorios.

Cambiar o añadir proveedor implica escribir un nuevo `ProviderAdapter` (ADR-0007), sin tocar la UI. Desde 2B.3 las fichas leen la serie completa de `PriceHistoryRepository` y las listas, heatmaps, rankings y agregados leen las instantáneas materializadas (`security_market_snapshots`) vía `RealFirstMarketDataRepository` (ADR-0009). Cada panel declara su estado REAL / PARTIAL (cobertura n/N) / DEMO; nunca se rellenan securities sin datos con valores simulados.

### Flujo de una petición

```
page.tsx ──► service(getRepositories(), params) ──► ReferenceRepository (Supabase, RLS)
                                               └──► MarketDataRepository (mock → Fase 2: tablas sincronizadas)
         ◄── view model (+ Provenance) ◄── funciones puras de lib/calculations
```

- Las páginas son Server Components; el navegador nunca habla con Supabase ni con proveedores.
- No hay peticiones por empresa desde el cliente: los agregados (500 valores) se calculan en servidor.
- `SupabaseReferenceRepository` memoiza lecturas dentro de la misma petición.

## Seguridad

- Variables de entorno **solo de servidor** (sin `NEXT_PUBLIC_`), validadas con zod de forma perezosa (`src/config/env.ts`). `server-only` impide importar el cliente de datos desde componentes cliente.
- Secretos de sincronización (`EODHD_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) solo en `src/config/sync-env.ts`, que únicamente importa el CLI. Nunca se registran en logs (`redact`), ni en Supabase, ni llegan al bundle (verificado en `.next/static`).
- Lecturas con la clave `anon` a través de **RLS**: política de solo lectura en todas las tablas de referencia; sin políticas de escritura.
- `auto_expose_new_tables = false`: cada tabla nueva necesita `GRANT` explícito.
- `.env.local` está en `.gitignore`; `.env.example` documenta las variables.

## Renderizado y caché (Fase 1)

- `export const dynamic = "force-dynamic"` en el layout raíz: todas las rutas se renderizan por petición y `next build` no necesita la base de datos.
- `loading.tsx` global: la respuesta hace streaming. Consecuencia conocida: `notFound()`/`redirect()` dentro de la página devuelven HTTP 200 con la UI de 404 (`noindex`) o una redirección en cliente. Ver deuda técnica.
- La estrategia de caché (Cache Components / `use cache`, revalidación por job) se definirá en Fase 2 con datos reales.

## Rutas canónicas

| Ruta | Contenido |
|---|---|
| `/` | Dashboard |
| `/markets` | Índices oficiales y sintéticos |
| `/index/[slug]` | Ficha de índice |
| `/sectors` · `/sector/[slug]` | Sectores |
| `/industry/[slug]` · `/industry/[slug]/[subSlug]` | Industria GICS · sub-industria |
| `/companies` · `/company/[ticker]` (+ `/financials`, `/valuation`, `/technical`, `/news`, `/earnings`, `/peers`, `/ai`) | Empresas |
| `/watchlist` | Esqueleto (Fase 6) |
| `/dev/ui` | Galería del design system (404 en producción) |

Todas las URLs se construyen en `src/lib/routes.ts`. El periodo global se pasa como `?range=` (1D, 1W, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y).

## EntityPage

Índice, sector, industria, sub-industria y empresa comparten un lenguaje visual mediante **composición** (`src/components/entity`):

```tsx
<EntityPage>
  <EntityHeader … />
  <EntityGrid main={<><PerformanceSection/><ChartSection/></>} aside={<BreadthSection/>} />
  <ComponentsSection>…</ComponentsSection>
  <EntityGrid main={<WorldContextSection/>} aside={<NewsSection/>} />
</EntityPage>
```

`EntityPage` no conoce el tipo de entidad ni contiene condicionales; cada página elige sus secciones. `WorldContextSection` y `NewsSection` reservan el espacio de la capa de contexto (Fases 4/5).

## Decisiones

Ver `docs/decisions/`.
