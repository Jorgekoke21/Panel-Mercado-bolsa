# Modelo de datos

Convenciones:

- PK `uuid` (`gen_random_uuid()` o UUID v5 determinista en el seed). Catálogos con código natural estable usan ese código como PK (`countries.code`, `taxonomies.code`).
- `created_at` / `updated_at` en todas las tablas; `updated_at` lo mantiene el trigger `set_updated_at`.
- Restricciones `check` para formatos (ISO, MIC, slugs, tickers), `unique` para claves naturales, FK en todas las relaciones e índices en todas las FK de consulta.
- JSONB solo para metadatos flexibles, nunca en sustitución de relaciones (ninguna tabla de Fase 1 lo usa).
- RLS activado en todas las tablas. Los `GRANT` son explícitos (`auto_expose_new_tables = false`).

## Fase 1 (implementado)

Migraciones en `supabase/migrations/`.

```
datasets ◄──────────────────────────────── (dataset_id en casi todas las tablas: procedencia)
countries ◄── exchanges ◄── securities ──► companies ──► sub_industries ──► industries ──► industry_groups ──► sectors ──► taxonomies
                               ▲                ▲
         indices ◄── index_constituents        company_themes ──► themes
```

| Tabla | Propósito | Claves / restricciones relevantes |
|---|---|---|
| `datasets` | Procedencia: fuente, URL, licencia, revisión fijada, sha256, `retrieved_at`, `effective_date` | `key` único |
| `countries` | ISO 3166-1 (`code`, `iso3`, `iso_numeric`) | `iso_numeric` preparado para topologías del World Map |
| `exchanges` | Bolsas por MIC (ISO 10383), zona horaria y divisa | `mic` único |
| `taxonomies` | Taxonomía de clasificación (hoy `GICS`) | PK `code` |
| `sectors` · `industry_groups` · `industries` · `sub_industries` | Jerarquía de 4 niveles | `unique(taxonomy_code, code)`, `unique(taxonomy_code, slug)`, FK compuesta `(parent_id, taxonomy_code)` ⇒ un hijo pertenece a la misma taxonomía que su padre |
| `companies` | Emisor | `cik` único; `sub_industry_id` (sector/industria se derivan); sede ≠ domicilio |
| `securities` | Valor cotizado (ticker) | `unique(exchange_id, ticker)`; índice único parcial ⇒ como máximo un `is_primary` por empresa |
| `indices` | Índices oficiales y sintéticos | `kind` ∈ official/synthetic; oficial ⇒ `methodology = provider` sin ámbito; sintético ⇒ equal/cap weight; ámbito como arco exclusivo (máx. 1 nivel de clasificación) |
| `index_constituents` | Pertenencia fechada | `added_on`/`removed_on`; índice único parcial de pertenencia activa; `dataset_id` obligatorio |
| `themes` · `company_themes` | Temas propios (AI, Data Centers…) | `source` ∈ manual/provider/ai; si no es manual, `confidence` obligatoria |

Vistas (`security_invoker = true`, respetan RLS):

- `v_securities`: valor + emisor + bolsa + país + ruta de clasificación completa.
- `v_index_memberships`: pertenencias actuales con datos del índice.
- `v_index_constituent_securities`: componentes actuales de cada índice con el read model completo.

### Por qué `companies` + `securities` (ADR-0001)

El ticker pertenece al valor cotizado. Alphabet (GOOGL/GOOG), Fox (FOXA/FOX) y News Corp (NWSA/NWS) tienen dos clases en el S&P 500 ⇒ 503 valores, 500 empresas. En Fase 7 una empresa podrá cotizar en varias bolsas o tener ADR. **Precios, índices y datos de mercado se relacionan con `security_id`.**

## Fase 2B.1 (implementado) — migración `20260929000700_market_data.sql`

Ver [market-data.md](market-data.md) y ADR-0007. Toda fila externa lleva `source`, `dataset_id` y `ingested_at`, además de su fecha de dato (`trade_date` / `as_of_date` / `fiscal_period_end`).

| Tabla | Clave | Notas |
|---|---|---|
| `security_identifiers` | `id`; único activo por (valor, proveedor) y (proveedor, símbolo) | `source` rule/manual/provider · `verified_at` (CIK del perfil) · **sin acceso anon** |
| ~~`daily_prices`~~ | — | Sustituida en 0012 por `price_series` + `daily_bars` (ver abajo) |
| `corporate_actions` | único (`security_id`, `source`, `action_type`, `ex_date`) | split / cash_dividend soportados; special_dividend, stock_dividend, spinoff, other → `unsupported` con motivo |
| `adjustment_factors` | (`security_id`, `ex_date`, `factor_kind`) | Calculados por MarketRadar (`split_ratio`, `crsp_prev_close`) |
| `shares_outstanding` | (`security_id`, `source`, `basis`, `as_of_date`) | `period_end` / `current` |
| `canonical_line_items` | `code` | Catálogo propio (14 partidas), espejo de `src/domain/fundamentals.ts` (test de coherencia) |
| `financial_statement_values` | (`company_id`, `source`, `line_item_code`, `period_type`, `fiscal_period_end`) | Formato largo; annual/quarterly; TTM derivado; `source_field` = campo del proveedor |
| `earnings_events` | (`company_id`, `source`, `fiscal_period_end`) | Sorpresa solo si existen actual y estimate (check) |
| `earnings_estimates` | (`company_id`, `source`, `period_end`, `period_code`) | Consenso; se sobrescribe en cada sync (sin histórico de revisiones) |
| `valuation_snapshots` | (`security_id`, `as_of_date`, `metric`, `value_origin`, `source`) | `value_origin` provider / calculated |
| `sync_runs` | `id` | Observabilidad: estado, leídos/escritos, peticiones, créditos medidos/estimados, errores y avisos (JSONB) · sin acceso anon |
| `sync_cursors` | (`provider`, `job_type`, `security_id`) | Incremental + `full_refresh_required` · sin acceso anon |

Migración `20260929000800_derived_fundamentals.sql`: `financial_statement_values.value_origin` (provider / calculated, forma parte de la PK), `missing_reason` (valor calculado NULL con motivo) y 3 partidas nuevas (`net_income_to_common`, `weighted_average_shares_basic`, `weighted_average_shares_diluted`). En `earnings_events` las columnas de EPS pasan a `provider_eps_*` + `eps_basis` (`unspecified` para EODHD).

Migraciones 0009–0011 (Fase 2B.2, coste 0 €):

| Tabla | Clave | Notas |
|---|---|---|
| `sec_entities` | `company_id` | CIK, SIC ⇒ `industry_template` (general / financial / reit), cierre fiscal |
| `sec_filings` | `accession_number` | 10-K/10-Q (y enmiendas) + 8-K item 2.02 con `release_timing` derivado de la aceptación en EDGAR |
| `financial_statement_values` | + `value_origin` reported / derived / calculated / provider | + `period_start`, `fiscal_year`, `fiscal_quarter`, `accession_number`, `form`, `restated`, `derivation` |
| `fundamental_coverage` | (`company_id`, `source`, `line_item_code`) | available / missing / not_applicable / discontinued + motivo |
| `company_fundamental_snapshots` | `company_id` | Materialización por emisor de TTM, márgenes, ROE, ROIC y crecimiento (sin precio) para agregados |
| `shares_outstanding` | + `basis` = cover_page | Acciones de portada SEC (solo emisores de clase única) |
| datasets `sec-companyfacts`, `sec-submissions`, `alpaca-eod-prices`, `alpaca-corporate-actions` | | Procedencia |

Migración 0012 (Fase 2B.3, precios Alpaca, ADR-0009):

| Tabla | Clave | Notas |
|---|---|---|
| `price_series` | `id` (int); único `security_id` | UNA serie por security y UNA fuente: `source`, `dataset_id`, `volume_basis`, `feed` (sip), primera/última sesión, nº de barras, cargas, `quality_status` PASS/WARNING/MISSING/FAIL + `quality_notes` |
| `daily_bars` | (`series_id`, `trade_date`) | OHLCV sin ajustar, compacto (~99 B/barra con índice); la procedencia vive en la serie. Vista `v_daily_prices` por `security_id` |
| `market_sessions` | (`exchange_mic`, `session_date`) | Calendario oficial (festivos, medias sesiones) en UTC |
| `security_market_snapshots` | `security_id` | Última sesión: rendimientos 1D…5Y, SMA/EMA 20·50·200, RSI 14, MACD, ATR 14, volumen relativo, 52W, market cap (solo VERIFIED) + estado y motivo |
| dataset `alpaca-calendar` | | Procedencia del calendario |

Migraciones 0013–0015 (Fase 2B.4, ADR-0010):

| Tabla | Clave | Notas |
|---|---|---|
| `group_index_series` | (`group_kind`, `group_key`, `method`) | Índices SINTÉTICOS equal / cap weight; niveles `real[]` alineados con `market_sessions` desde `start_date` (~4 MB en total) |
| `sync_leases` | `name` | Bloqueo con caducidad del sync automático |
| `security_share_classes` | `security_id` | Clase, acciones de portada y comprobación con el BPA del último 10-Q/10-K (XBRL) |
| 0014 | — | `source_field` sin la fórmula duplicada de los derivados; índice sin uso eliminado |

**No creada: `quotes_latest`.** Fase 2B es solo EOD: el último dato es la última barra de `daily_bars`. Crearla ahora sería una tabla vacía sin productor; llegará con cotizaciones retrasadas.

Las tablas de hechos no tienen `created_at`/`updated_at`: `ingested_at` registra la última escritura (upsert idempotente). Los jobs escriben con `service_role` (GRANT explícito); la app lee con `anon` + RLS de solo lectura.

## Diseño previsto (NO creado todavía)

Se documenta para que Fase 1 no bloquee World Pulse, Impact Map, Global Intelligence ni Ask MarketRadar. No se crean tablas vacías antes de su fase.

### Fase 2 — Market data (pendiente tras 2B.1)

| Tabla | Columnas principales | Notas |
|---|---|---|
| `quotes_latest` | `security_id`, `price`, `as_of`, `is_delayed` | Cuando haya cotizaciones retrasadas |
| `intraday_prices` | `security_id`, `ts`, OHLCV, `interval` | Opcional, más adelante |
| `technical_metrics` | `security_id`, `as_of_date`, SMA/EMA 20/50/200, RSI 14, MACD, ATR, volatilidad, rel. volume, 52W high/low, flags | Calculados internamente desde OHLCV con funciones puras |
| `security_returns` | `security_id`, `as_of_date`, `r_1d … r_5y` | Materialización para rankings/heatmaps |
| `index_levels` | `index_id`, `trade_date`, `level`, `return_1d` | Oficiales (proveedor) y sintéticos (MarketRadar) |
| `group_metrics_daily` | `scope` (índice/sector/industria/sub-industria), `scope_id`, `as_of_date`, breadth + agregados | Breadth histórico |
| `market_instruments` | `id`, `kind` (volatility/fx/commodity/rate/index_level), `symbol`, `currency`, `unit` | Activos de contexto (VIX, DXY, oro, WTI, US10Y); decidir si unificar con `securities` |

### Fase 4 — News engine

| Tabla | Columnas principales |
|---|---|
| `news` | `id`, `title`, `summary`, `source`, `url` (único), `published_at`, `language`, `content_hash` (dedupe), `dataset_id` |
| `news_entities` | `news_id`, `entity_type`, FK tipada al destino (`company_id`/`sector_id`/`industry_id`/`country_code`/`commodity_id`), `match_method` (known_entity/ai), `confidence` |
| `commodities` · `commodity_prices` | `id`, `code`, `name`, `unit`, `currency` · `commodity_id`, `trade_date`, `price` |
| `macro_events` · `economic_indicators` | Calendario macro (CPI, NFP, decisiones de bancos centrales) · series (`indicator_id`, `country_code`, `period`, `value`, `unit`, `source`) |

### Fase 5 — Global intelligence

| Tabla | Columnas principales |
|---|---|
| `geo_regions` · `geo_region_countries` | Regiones geopolíticas/económicas (Oriente Medio, UE, Estrecho de Taiwán…) ↔ países (N:M) |
| `geopolitical_events` | `id`, `title`, `summary`, `event_type` (GEOPOLITICS, CENTRAL_BANK, TRADE, TARIFFS, SANCTIONS, WAR_CONFLICT, ENERGY, COMMODITIES, SUPPLY_CHAIN, TECHNOLOGY, SEMICONDUCTORS, REGULATION, ELECTION_POLICY, CLIMATE_DISASTER, MACRO), `importance`, `status`, `started_at`, `updated_at`, `source_count`, `confidence` |
| `event_countries` · `event_regions` · `event_sectors` · `event_industries` · `event_companies` · `event_commodities` · `event_assets` | Tablas de relación **tipadas** (FK reales, no JSONB) |
| `event_sources` | `event_id`, `news_id` / `url` — fuentes obligatorias |
| `market_factors` | Nodos macro: petróleo, expectativas de inflación, tipos, USD, bonos, oro, electricidad… |
| `event_impacts` | `event_id`, `order` (direct/first/second), `direction` (`potential_positive`/`potential_negative`/`mixed_uncertain`), `time_horizon`, `confidence`, `rationale`, y **un solo destino** (arco exclusivo: sector/industria/empresa/materia prima/factor) |
| `factor_links` | Aristas factor → factor/sector para el Impact Map (dirección potencial + confianza + explicación) |
| `company_exposures` | `company_id`, `exposure_type` (supply_chain/demand/regulation/input_cost…), destino (país/región/tema/materia prima), `source`, `confidence`, `evidence_url` — **siempre con fuente verificable** (p. ej. segmentos geográficos del 10-K) |
| `ai_analyses` | `entity_type`, `entity_id`, `kind`, `model`, `prompt_version`, `input_snapshot_hash`, `output` (JSONB estructurado validado), `sources`, `created_at` |

Nunca se afirma causalidad: las relaciones son potenciales, con dirección, confianza y explicación.

### Fase 6 — Personal intelligence

| Tabla | Columnas principales |
|---|---|
| `watchlists` | `id`, `user_id` (auth.users), `name` |
| `watchlist_items` | `watchlist_id`, `security_id`, `status` (watching/studying/interested/portfolio), `note`, `added_at` |
| `user_notes` | `user_id`, `entity_type`, `entity_id`, `body`, timestamps |
| `alerts` | `user_id`, regla, estado |

RLS por `user_id = auth.uid()`.

## Consultas útiles

```sql
-- ¿De qué fecha es nuestra composición del S&P 500?
select d.name, d.source, d.source_revision, d.source_revision_at, d.retrieved_at, d.effective_date
from index_constituents ic
join indices i on i.id = ic.index_id and i.code = 'SPX'
join datasets d on d.id = ic.dataset_id
group by d.id;
```
