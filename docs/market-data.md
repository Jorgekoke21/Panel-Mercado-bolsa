# Market data (Fase 2B)

> Estado: **2B.4 — coste 0 €/mes** (ADR-0008, ADR-0009, ADR-0010). Sync automático por calendario, acciones por clase desde las portadas XBRL e índices sintéticos de sector/industria. Fundamentales oficiales de la SEC para los 500 emisores del S&P 500 ([sec-fundamentals.md](sec-fundamentals.md)) y **precios diarios reales de Alpaca Basic (SIP) para las 503 securities**. EODHD se conserva como adaptador opcional.

| Capacidad | Proveedor | Coste | Estado |
|---|---|---|---|
| Fundamentales EE. UU. (estados, EPS, acciones medias, filings, fechas de publicación) | SEC EDGAR XBRL | 0 € | S&P 500 completo |
| Precios diarios EE. UU. + splits + dividendos + calendario | Alpaca Basic (SIP, 15 min de retraso) | 0 € (cuenta gratuita) | S&P 500 completo: 503/503 securities, ~955k barras desde 2019 |
| Precios globales / fundamentales internacionales | EODHD (opcional) | de pago | Adaptador conservado, preflight bloquea planes insuficientes |
| Indicadores, ratios, market cap, TTM, márgenes, crecimiento | MarketRadar | 0 € | Funciones puras con tests |

Una serie de precios tiene **una sola fuente**: al cambiar de proveedor se recarga entera y se registra (`price_source_switched`); los factores y el dividend yield usan solo las acciones corporativas de esa misma fuente.

```bash
npm run sync -- alpaca [--tickers AAPL,JPM | --index sp500]   # calendario → identidades → precios → acciones → análisis
npm run sync -- alpaca-report                                 # calidad por serie → docs/data/price-coverage.md
npm run sync -- alpaca-validate [--tickers …]                 # ajustes MarketRadar vs Alpaca → docs/data/alpaca-validation.md
```

## Alpaca Basic (verificado con la cuenta real, 2026-09-29)

Detalle y decisiones: [ADR-0009](decisions/ADR-0009-real-prices-free-tier.md). Resumen:

| Aspecto | Comportamiento |
|---|---|
| Feed | `sip` (consolidado). SIP de los últimos 15 min ⇒ 403; el adaptador nunca pide `end` posterior a ahora − 16 min |
| Sesiones | Solo barras **definitivas**: 4 h 20 min después del cierre oficial según `market_sessions` (medias sesiones incluidas). La sesión en curso nunca se guarda |
| Barras | `adjustment=raw`: OHLC y volumen sin ajustar; volumen consolidado con sesión extendida (~5 % sobre el oficial) |
| Lotes | 40 símbolos por petición en cargas completas y 200 en incrementales; si un lote falla se reintenta símbolo a símbolo |
| Acciones corporativas | Lotes de 200 símbolos. Dividendos del mismo día: duplicados exactos ⇒ uno; importes distintos ⇒ se suman (`combined 0.58 + 0.2`). Dividendos de emisor extranjero ⇒ `unsupported` (importe posiblemente neto de retención) |
| Splits contradichos | Un split que los precios sin ajustar no reflejan (HON 2026-06-29) no se aplica y se informa |
| Relleno | Barras iniciales de volumen 0 antes de la primera negociación (DOW antes del 2-abr-2019, SMCI en OTC) se descartan en cargas completas |
| Identidad | Catálogo de activos (1 petición): activo, bolsa de EE. UU. (cambio de bolsa ⇒ aviso) y nombre compatible con el seed o el nombre SEC |
| Rendimiento | Carga inicial 503 securities: ~280 s, 119 peticiones. Incremental: ~145 s, 21 peticiones, 0 escrituras si no hay datos nuevos |

## Sync automático (ADR-0010)

```bash
npm run sync -- auto [--force] [--dry-run]   # decide por calendario; lo lanza el Programador de tareas cada hora
npm run sync -- status                       # frescura: última sesión definitiva, instantáneas, índices, SEC
powershell -ExecutionPolicy Bypass -File scripts/scheduler/register-windows-task.ps1     # instalar
powershell -ExecutionPolicy Bypass -File scripts/scheduler/unregister-windows-task.ps1   # quitar
```

| Situación | Qué hace `auto` |
|---|---|
| Sesión normal | La barra del día es definitiva a las 20:20 ET (cierre 16:00 + sesión extendida + retraso SIP). La primera ejecución posterior descarga, analiza y reconstruye índices (~2,5 min, ~21 peticiones) |
| Media sesión (cierre 13:00) | Definitiva a las 17:20 ET |
| Fin de semana / festivo | No hay sesión nueva: termina en segundos, sin llamadas a proveedores |
| SEC con más de 7 días | Fundamentales + acciones por clase (solo filings nuevos) y después precios |
| Series rezagadas | Reintento como mucho cada 6 h |
| Otra ejecución en curso | Bloqueo `sync_leases`: sale sin hacer nada |

Cada ejecución deja una línea en `data/logs/sync-auto.log`; los jobs, en `sync_runs` (180 días).

## Acciones por clase (portadas XBRL)

`npm run sync -- sec-classes` lee la instancia XBRL del último 10-Q/10-K de las securities cuya capitalización no se verifica con companyfacts (multiclase, portada ausente o desfasada) y asigna a cada ticker su clase (`dei:TradingSymbol` / `dei:Security12bTitle`), con comprobación frente a las medias del BPA del mismo filing. Resultado en `security_share_classes`; detalle en ADR-0010.

## Índices sintéticos de grupo

`group_index_series`: equal weight y cap weight (capitalización del cierre anterior) por sector, grupo de industria, industria, sub-industria y constituyentes del índice. Constituyentes actuales (sesgo de supervivencia). Los rendimientos de grupo de todos los periodos (dashboard, sectores, industrias, fichas) salen de estos índices. Gráficos rebased: compañía vs industria vs sector vs S&P 500 (sintético).

## Calidad por serie

`price_series.quality_status` + `quality_notes` (severidad info / warning / fail):

| Estado | Cuándo |
|---|---|
| PASS | Al día, sin huecos frente al calendario, sin saltos con forma de split sin explicar |
| WARNING | Huecos, barras rechazadas, split posible no registrado, split no reflejado (no aplicado), cotización suspendida, spin-off o dividendo en acciones no aplicado a los ajustes |
| MISSING | Sin barras del proveedor |
| FAIL | Más de 3 sesiones de retraso (serie no actual) o identidad no verificada |

Informativos (no cambian el estado): histórico más corto que el pedido (salida a bolsa), movimientos > 40 % que no parecen splits (resultados, crisis), dividendos extraordinarios.

## Instantáneas de mercado y agregados

- `security_market_snapshots` (503 filas) se recalcula en cada sync con el mismo motor que la ficha (`computeIndicators`): rendimientos 1D…5Y (price return), SMA/EMA 20·50·200, RSI 14, MACD 12·26·9, ATR 14, volumen medio y relativo (sobre las 20 sesiones anteriores), volumen en dólares, máximos/mínimos de 52 semanas y market cap.
- Listas, heatmaps, rankings, breadth y agregados de sector/industria/índice leen esas 503 filas en una consulta (`RealFirstMarketDataRepository`). Solo entran instantáneas de la última sesión común; una serie desfasada queda sin dato y el panel pasa a PARTIAL.
- Breadth y medias equiponderadas cuentan **compañías** (cotización principal); la media ponderada usa la capitalización verificada de cada security (sin duplicar Alphabet, Fox o News Corp).
- Heatmap: tamaño = capitalización **verificada** de la security; las no verificables se listan debajo con su motivo.

## Pipeline

```
EODHD API ──► EodhdClient (HTTP, errores tipados, token redactado)
          ──► EodhdAdapter (puertos por capacidad; JSON → dominio canónico)
          ──► jobs de sync (src/sync/jobs.ts; upsert idempotente + sync_runs)
          ──► Supabase (service_role, solo CLI)
          ──► repositorios de lectura (clave anon + RLS)
          ──► servicios (ajustes, indicadores, snapshot) ──► UI
```

La UI **nunca** llama a EODHD. El token solo lo lee el CLI de sincronización (`src/config/sync-env.ts`).

## Puertos (src/providers/ports.ts)

| Puerto | Qué devuelve | EODHD |
|---|---|---|
| `ProfileSource` | Perfil (CIK, ISIN, nombre…) — se usa para **verificar** el identificador | `/fundamentals` |
| `PriceHistorySource` | Barras diarias SIN ajustar + base del volumen | `/eod` |
| `CorporateActionSource` | Splits y dividendos (los no soportados se devuelven como `unsupported`) | `/splits`, `/div` |
| `FundamentalsSource` | Partidas canónicas (anual/trimestral) + acciones en circulación | `/fundamentals` |
| `EarningsSource` | Eventos (actual/estimate/sorpresa/hora) + consenso | `/fundamentals` |
| `ValuationSource` | Ratios del proveedor (`origin = provider`) | `/fundamentals` |
| `QuoteSource` | Cotizaciones retrasadas | **no implementado** (2B es solo EOD) |

`ProviderAdapter` declara `capabilities`, `coverage.exchanges` (MIC), `costModel` y `datasets`. `selectAdapter()` elige proveedor por capacidad y bolsa: un segundo proveedor (p. ej. Japón) se añade como otro adaptador sin tocar jobs ni UI.

## Simbología

- Ticker canónico de MarketRadar (`BRK.B`) ≠ símbolo del proveedor (`BRK-B.US`).
- La traducción vive en **`security_identifiers`**. La regla de EODHD (`src/providers/eodhd/symbology.ts`) solo **propone** el símbolo la primera vez (`source = 'rule'`).
- El job de fundamentales **verifica** el identificador comparando el CIK del perfil del proveedor con el CIK del seed. Sin verificación no se escribe ningún dato de ese valor.
- Si EODHD usa un símbolo distinto, se corrige en la tabla (`source = 'manual'`) sin tocar código.

## Precios y ajustes

- Fuente de verdad: OHLC **sin ajustar** (`daily_prices`) + `corporate_actions`.
- `adjustment_factors`: factores por evento calculados por MarketRadar:
  - split N:M → precios anteriores × M/N; volumen × N/M (solo si el volumen es `raw`).
  - dividendo D → precios anteriores × (1 − D / cierre sin ajustar de la sesión previa) (método CRSP).
  - eventos con fecha ex futura, sin sesión previa o no soportados → se omiten **y se informan**.
- Series: `split` (price return, **por defecto**) y `total_return` (split + dividendos). Selector en UI: pendiente.
- `provider_adjusted_close` solo para conciliación (`npm run sync -- validate`).

### Particularidades verificadas de EODHD (2026-09-29)

| Campo | Comportamiento |
|---|---|
| `/eod` `open/high/low/close` | Sin ajustar (AAPL 2020-08-28 close 499.23) |
| `/eod` `adjusted_close` | Ajustado por splits **y dividendos** |
| `/eod` `volume` | **Ajustado por splits** (AAPL 2014-06-06: 349.9 M = 12.5 M × 28) → `volume_basis = split_adjusted`; si llega un split nuevo el job programa una recarga completa |
| `/div` | `unadjustedValue` = importe pagado; `value` = ajustado por splits. `period` es `null` en dividendos antiguos |
| `/fundamentals` estados | Importes como string; `capitalExpenditures` en positivo; **sin EPS por periodo** |
| `/fundamentals` Earnings.History | `epsDifference = 0` cuando falta actual o estimate → se guarda NULL |
| `/fundamentals` outstandingShares.annual | Fecha el año en curso a 31-dic (fecha futura) → se ignora; se usa el trimestral |
| Ratios de valoración | 0 = sin dato (se descarta), salvo `DividendYield` (0 es real) |
| Errores HTTP | 401 token inválido · 403 fuera del plan · 402 cuota diaria · 429 por minuto · 404 símbolo |

## Planes de EODHD y capacidades que necesita MarketRadar

**FREE ≠ EOD All World + Fundamentals.** Una cuenta gratuita autentica bien pero no sirve para el piloto. Los precios de los planes no se codifican (cambian): se consultan en la web de EODHD.

| Capacidad | Para qué la usa MarketRadar | FREE | EOD All World | Fundamentals |
|---|---|---|---|---|
| `/user` (cuenta) | Preflight, medición de créditos | ✓ (sin coste) | ✓ | ✓ |
| EOD histórico completo | Velas, rendimientos 3Y/5Y, EMA/SMA 200, 52W, RSI, volumen relativo, series ajustadas | ✗ (~1 año, límite diario pequeño) | ✓ | — |
| Splits y dividendos | Ajustes split / total return | limitado por cuota | ✓ | — |
| Fundamentales | Estados financieros, acciones en circulación, earnings, consenso, ratios del proveedor, verificación de identidad (CIK) | ✗ | — | ✓ |

El piloto 5/5 necesita **EOD completo + Fundamentals** (≈ 65 créditos: 5 × (10 + 1 + 2)).

### Preflight

```bash
npm run sync -- preflight           # solo /user: plan, límites, uso, capacidades → PILOT STATUS
npm run sync -- preflight --probe   # además, sonda mínima (1 barra antigua + 1 perfil) si el plan no se conoce
```

- `free`, `demo`, `test` ⇒ `BLOCKED_BY_PROVIDER_PLAN` sin gastar llamadas.
- Otro plan ⇒ sonda de ~11 créditos (EOD de hace 6 años + perfil de AAPL); `READY` si ambas responden y la cuota restante cubre el piloto (si no, `BLOCKED_BY_QUOTA`).
- `pilot` e `idempotency` ejecutan el preflight con sonda y **no sincronizan** si no es `READY`. `validate` no llama al proveedor.

## Fundamentales derivados (value_origin = calculated)

| Dato | Cómo se obtiene | Si falta un componente |
|---|---|---|
| `eps_basic` / `eps_diluted` calculado ("GAAP EPS calculated") | `net_income_to_common / weighted_average_shares_{basic,diluted}` | NULL con `missing_reason` (`provider_missing_weighted_average_shares`, `provider_missing_net_income_to_common`, `incompatible_components`). Nunca se usan acciones a cierre de periodo |
| Provider earnings EPS | `earnings_events.provider_eps_actual` (EODHD, `eps_basis = unspecified`) | NULL. **No es GAAP EPS** |
| `free_cash_flow` del proveedor | Campo `freeCashFlow` de EODHD (`value_origin = provider`) | Ausente |
| `free_cash_flow` calculado | `operating_cash_flow − capital_expenditure` (capex positivo) | No se calcula |

EODHD no publica acciones medias ponderadas: con los datos verificados hasta ahora el EPS calculado será NULL en todos los periodos. Divergencias FCF proveedor/calculado > 1 % ⇒ aviso `fcf_divergence` en `sync_runs` y en el informe; ninguno se sobrescribe. Cuál usa MarketRadar por defecto está pendiente de decidir.

## Market cap

`precio de la security × acciones en circulación` solo se publica como **VERIFIED**:

| Estado | Cuándo |
|---|---|
| VERIFIED | Clase única, acciones de portada SEC recientes (≤ 190 días), re-expresadas por los splits posteriores, y coherentes con una referencia independiente: capitalización del proveedor (±5 %) o acciones medias ponderadas diluidas / básicas del último trimestre SEC (±15 %: recompras, emisiones y dilución mueven la media) |
| UNVERIFIED | Emisor multiclase (clase explícita, varias cotizaciones o sufijo de clase como BRK.B / BF.B), acciones desfasadas, sin referencia o discrepancia. El cálculo se guarda como información pero la UI no lo muestra |
| MISSING | Sin precio o sin acciones (emisores con varias clases: la SEC publica sus acciones por clase solo como dato dimensional) |

Los emisores multiclase se verifican por clase con la portada XBRL del filing (ver arriba). Estado actual (S&P 500): **495 VERIFIED** (443 con companyfacts + 52 por clase) · 8 UNVERIFIED (BRK.B, ARES, HONA, DVN, PCG, MCD, WAT, IBKR) · 98,4 % de la capitalización estimada. Detalle en `docs/data/price-coverage.md`.

## Fixtures offline

Los tests no usan red ni créditos: `src/providers/eodhd/__fixtures__/aapl.ts` (respuestas reales reducidas de AAPL obtenidas con el token público `demo`) y `user.ts` (`/user` anonimizado: FREE real y un plan de pago sintético).

## Sincronización

```bash
npm run sync -- pilot [--tickers AAPL,NVDA]   # identificadores → fundamentales (verifica) → precios → acciones → factores
npm run sync -- validate                      # informe de cobertura → docs/pilot/2b1-coverage.md
npm run sync -- idempotency                   # cuenta filas, repite el piloto y compara
npm run sync -- usage                         # consumo de la API según EODHD
```

- Idempotente: upsert por clave natural; las acciones corporativas se sustituyen por conjunto (las que el proveedor deja de publicar se borran y se avisa).
- Incremental: `sync_cursors` guarda la última sesión; la siguiente descarga empieza 10 días antes (recoge correcciones).
- Histórico inicial: desde el 1 de enero de (año − 7): 5Y + calentamiento de EMA/SMA 200.
- Cada job deja una fila en `sync_runs` (inicio/fin, estado, leídos/escritos, peticiones, créditos medidos con `/user` y estimados, errores y avisos).
- Un fallo de un valor no aborta el resto: queda como error y el job termina `partial`.
- `npm run db:reset` borra los datos sincronizados: después hay que repetir `npm run sync -- pilot`.

## Datasets y licencia

| `datasets.key` | Contenido |
|---|---|
| `eodhd-eod-prices` | `daily_prices` |
| `eodhd-corporate-actions` | `corporate_actions` (y, derivados, `adjustment_factors`) |
| `eodhd-fundamentals` | `financial_statement_values`, `shares_outstanding`, `earnings_events`, `earnings_estimates`, `valuation_snapshots` (origin = provider) |

Suscripción **de uso personal**: permite almacenar pero no redistribuir ni mostrar públicamente. Antes de publicar MarketRadar hay que revisar la licencia comercial de EODHD. La procedencia está en cada fila (`source`, `dataset_id`, `ingested_at`) para poder filtrar o sustituir estos datos.
