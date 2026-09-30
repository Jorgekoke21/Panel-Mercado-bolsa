-- MarketRadar · Fase 2B.1 · 0007 — datos de mercado sincronizados (piloto EOD).
--
-- Principios:
--   * Fuente de verdad de precios: OHLC SIN ajustar + acciones corporativas. El cierre ajustado
--     del proveedor se guarda solo para validación (provider_adjusted_close).
--   * Toda fila externa lleva procedencia: source (proveedor), dataset_id (datasets.key),
--     fecha del dato (trade_date / as_of_date / fiscal_period_end) e ingested_at (descarga).
--   * Tablas de hechos: sin created_at/updated_at; `ingested_at` es el momento de la última
--     escritura (los jobs hacen upsert idempotente sobre la clave natural).
--   * Precios, acciones corporativas, acciones en circulación y valoración → security_id.
--     Estados financieros y earnings → company_id (son del emisor), con source_security_id
--     para saber con qué símbolo se descargaron.
--   * NO se crea `quotes_latest`: Fase 2B es solo EOD (el último cierre sale de daily_prices).

-- Datasets de procedencia EODHD (licencia personal; revisar antes de publicar el producto).
insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('eodhd-eod-prices', 'EODHD end-of-day prices', 'EODHD — End-of-Day Historical Data API', 'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes',
   'EODHD personal-use subscription. Not licensed for redistribution or public display.', false,
   'Raw (unadjusted) OHLC; volume is split-adjusted by the provider; adjusted_close kept for validation only.'),
  ('eodhd-corporate-actions', 'EODHD splits and dividends', 'EODHD — Splits and Dividends API', 'https://eodhd.com/financial-apis/api-splits-dividends',
   'EODHD personal-use subscription. Not licensed for redistribution or public display.', false,
   'Dividend amounts stored unadjusted (unadjustedValue); provider split-adjusted value kept for validation.'),
  ('eodhd-fundamentals', 'EODHD fundamentals', 'EODHD — Fundamental Data API', 'https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds',
   'EODHD personal-use subscription. Not licensed for redistribution or public display.', false,
   'Financial statements, shares outstanding, earnings history/trend and provider valuation ratios.');

-- --- Identificadores por proveedor --------------------------------------------------------------

create table public.security_identifiers (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  symbol text not null check (length(symbol) between 1 and 64),
  provider_exchange_code text,
  valid_from date,
  valid_to date,
  -- rule = propuesto por la regla de simbología; manual = corregido a mano; provider = búsqueda en el proveedor.
  source text not null check (source in ('rule', 'manual', 'provider')),
  -- Verificado contra el perfil del proveedor (p. ej. CIK coincidente).
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
comment on table public.security_identifiers is 'MarketRadar security ↔ provider symbol (e.g. BRK.B ↔ EODHD BRK-B.US). Single source of symbol resolution.';
create unique index security_identifiers_active_per_provider on public.security_identifiers (security_id, provider) where valid_to is null;
create unique index security_identifiers_active_symbol on public.security_identifiers (provider, symbol) where valid_to is null;
create trigger security_identifiers_set_updated_at before update on public.security_identifiers
  for each row execute function public.set_updated_at();

-- --- Precios diarios ------------------------------------------------------------------------------

create table public.daily_prices (
  security_id uuid not null references public.securities (id) on delete cascade,
  -- Fecha de sesión local de la bolsa.
  trade_date date not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  volume bigint check (volume >= 0),
  volume_basis text not null check (volume_basis in ('raw', 'split_adjusted')),
  -- SOLO validación: cierre ajustado según el proveedor.
  provider_adjusted_close numeric check (provider_adjusted_close > 0),
  source text not null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (security_id, trade_date),
  check (low <= high)
);
comment on table public.daily_prices is 'Unadjusted daily OHLCV (source of truth). Adjusted series are computed by MarketRadar from corporate_actions.';

-- --- Acciones corporativas ---------------------------------------------------------------------------

create table public.corporate_actions (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities (id) on delete cascade,
  action_type text not null
    check (action_type in ('split', 'cash_dividend', 'special_dividend', 'stock_dividend', 'spinoff', 'other')),
  -- Solo split y cash_dividend se aplican en los ajustes; el resto se conserva como unsupported.
  support_status text not null check (support_status in ('supported', 'unsupported')),
  ex_date date not null,
  split_to numeric check (split_to > 0),
  split_from numeric check (split_from > 0),
  -- Importe por acción tal como se pagó (sin ajustar por splits posteriores).
  cash_amount numeric,
  -- Importe ajustado por el proveedor (solo validación).
  provider_adjusted_amount numeric,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  declaration_date date,
  record_date date,
  payment_date date,
  frequency text,
  provider_label text,
  unsupported_reason text,
  source text not null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  unique (security_id, source, action_type, ex_date),
  check (action_type <> 'split' or (split_to is not null and split_from is not null)),
  check (action_type <> 'cash_dividend' or (cash_amount > 0 and currency is not null)),
  check ((support_status = 'supported') = (action_type in ('split', 'cash_dividend'))),
  check (support_status = 'supported' or unsupported_reason is not null)
);
comment on table public.corporate_actions is 'Splits and dividends. Unsupported events (special dividends, spin-offs…) are stored, never dropped.';
create index corporate_actions_security_ex_date_idx on public.corporate_actions (security_id, ex_date);

-- Factores por evento calculados por MarketRadar (auditables y reproducibles).
create table public.adjustment_factors (
  security_id uuid not null references public.securities (id) on delete cascade,
  ex_date date not null,
  factor_kind text not null check (factor_kind in ('split', 'cash_dividend')),
  -- Multiplicadores aplicados a las sesiones ANTERIORES a ex_date.
  price_factor numeric not null check (price_factor > 0),
  volume_factor numeric not null check (volume_factor > 0),
  reference_close numeric,
  reference_date date,
  -- split_ratio | crsp_prev_close
  method text not null,
  -- Proveedor de los datos de entrada (precios + acciones corporativas).
  input_source text not null,
  computed_at timestamptz not null default now(),
  primary key (security_id, ex_date, factor_kind),
  check (factor_kind <> 'cash_dividend' or (reference_close > 0 and reference_date < ex_date))
);
comment on table public.adjustment_factors is 'Per-event adjustment factors computed by MarketRadar from unadjusted prices + corporate actions.';

-- --- Acciones en circulación ----------------------------------------------------------------------

create table public.shares_outstanding (
  security_id uuid not null references public.securities (id) on delete cascade,
  as_of_date date not null,
  -- period_end = cifra a cierre de periodo fiscal; current = foto actual del proveedor.
  basis text not null check (basis in ('period_end', 'current')),
  shares bigint not null check (shares > 0),
  source_field text not null,
  source text not null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (security_id, source, basis, as_of_date)
);

-- --- Fundamentales canónicos ---------------------------------------------------------------------------

create table public.canonical_line_items (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  statement text not null check (statement in ('income', 'balance', 'cash_flow')),
  label text not null,
  unit text not null check (unit in ('currency', 'per_share', 'shares')),
  -- duration = flujo del periodo (TTM = suma de 4 trimestres); instant = foto a cierre (TTM = último).
  nature text not null check (nature in ('duration', 'instant')),
  description text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.canonical_line_items is 'MarketRadar canonical financial-statement taxonomy (mirrors src/domain/fundamentals.ts).';
create trigger canonical_line_items_set_updated_at before update on public.canonical_line_items
  for each row execute function public.set_updated_at();

insert into public.canonical_line_items (code, statement, label, unit, nature, description, sort_order) values
  ('revenue', 'income', 'Revenue', 'currency', 'duration', 'Total revenue (net sales).', 10),
  ('gross_profit', 'income', 'Gross profit', 'currency', 'duration', 'Revenue minus cost of revenue.', 20),
  ('operating_income', 'income', 'Operating income', 'currency', 'duration', 'Income from operations (EBIT as reported by the provider when equal).', 30),
  ('net_income', 'income', 'Net income', 'currency', 'duration', 'Net income attributable to the company.', 40),
  ('eps_basic', 'income', 'EPS (basic)', 'per_share', 'duration', 'Basic earnings per share as reported in the income statement.', 50),
  ('eps_diluted', 'income', 'EPS (diluted)', 'per_share', 'duration', 'Diluted earnings per share as reported in the income statement.', 60),
  ('operating_cash_flow', 'cash_flow', 'Operating cash flow', 'currency', 'duration', 'Net cash from operating activities.', 70),
  ('capital_expenditure', 'cash_flow', 'Capital expenditure', 'currency', 'duration', 'Capital expenditure as a POSITIVE amount spent (sign normalised by the adapter).', 80),
  ('free_cash_flow', 'cash_flow', 'Free cash flow', 'currency', 'duration', 'Free cash flow as reported by the provider (operating cash flow − capex).', 90),
  ('cash_and_equivalents', 'balance', 'Cash & equivalents', 'currency', 'instant', 'Cash and cash equivalents at period end.', 100),
  ('total_assets', 'balance', 'Total assets', 'currency', 'instant', 'Total assets at period end.', 110),
  ('total_debt', 'balance', 'Total debt', 'currency', 'instant', 'Short-term plus long-term debt at period end, as reported by the provider.', 120),
  ('total_equity', 'balance', 'Total equity', 'currency', 'instant', 'Total stockholders'' equity at period end.', 130),
  ('shares_outstanding', 'balance', 'Shares outstanding', 'shares', 'instant', 'Common shares outstanding at period end as reported in the balance sheet.', 140);

create table public.financial_statement_values (
  company_id uuid not null references public.companies (id) on delete cascade,
  line_item_code text not null references public.canonical_line_items (code),
  -- TTM NO se almacena: se deriva de los trimestres.
  period_type text not null check (period_type in ('annual', 'quarterly')),
  fiscal_period_end date not null,
  filing_date date,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  value numeric not null,
  -- Campo del proveedor del que salió el valor (auditoría del mapeo).
  source_field text not null,
  source text not null,
  source_security_id uuid references public.securities (id) on delete set null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (company_id, source, line_item_code, period_type, fiscal_period_end)
);
comment on table public.financial_statement_values is 'Long-format financial statements mapped to canonical line items. Missing items are absent (never zero-filled).';
create index financial_statement_values_line_item_idx on public.financial_statement_values (line_item_code);

-- --- Earnings --------------------------------------------------------------------------------------------

create table public.earnings_events (
  company_id uuid not null references public.companies (id) on delete cascade,
  fiscal_period_end date not null,
  report_date date,
  report_timing text check (report_timing in ('before_market', 'after_market', 'during_market')),
  eps_actual numeric,
  eps_estimate numeric,
  eps_surprise numeric,
  eps_surprise_percent numeric,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  source text not null,
  source_security_id uuid references public.securities (id) on delete set null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (company_id, source, fiscal_period_end),
  -- Una sorpresa solo existe si existen el dato real y la estimación.
  check (eps_surprise is null or (eps_actual is not null and eps_estimate is not null)),
  check (eps_surprise_percent is null or (eps_actual is not null and eps_estimate is not null))
);
create index earnings_events_report_date_idx on public.earnings_events (report_date);

create table public.earnings_estimates (
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Código del proveedor: 0q, +1q, 0y, +1y… (los periodos pasados conservan su última estimación).
  period_code text not null check (period_code ~ '^[+-]?[0-9]+[qy]$'),
  period_end date not null,
  -- Fecha de la foto según el proveedor (se sobrescribe en cada sync; sin histórico de revisiones).
  as_of_date date,
  eps_avg numeric,
  eps_low numeric,
  eps_high numeric,
  eps_year_ago numeric,
  eps_analysts integer check (eps_analysts >= 0),
  revenue_avg numeric,
  revenue_low numeric,
  revenue_high numeric,
  revenue_analysts integer check (revenue_analysts >= 0),
  source text not null,
  source_security_id uuid references public.securities (id) on delete set null,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (company_id, source, period_end, period_code)
);

-- --- Valoración -------------------------------------------------------------------------------------------

create table public.valuation_snapshots (
  security_id uuid not null references public.securities (id) on delete cascade,
  as_of_date date not null,
  metric text not null check (metric in (
    'market_cap', 'enterprise_value', 'pe_ttm', 'pe_forward', 'peg', 'ps_ttm', 'pb_mrq', 'ev_revenue', 'ev_ebitda', 'dividend_yield'
  )),
  -- provider = ratio publicado por el proveedor; calculated = calculado por MarketRadar.
  value_origin text not null check (value_origin in ('provider', 'calculated')),
  value numeric not null,
  -- Campo del proveedor o método de cálculo.
  method text not null,
  source text not null,
  dataset_id uuid references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (security_id, as_of_date, metric, value_origin, source),
  check (value_origin = 'calculated' or dataset_id is not null)
);

-- --- Observabilidad de sincronización ------------------------------------------------------------------

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  job_type text not null check (job_type ~ '^[a-z_]+$'),
  scope text not null,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  -- Peticiones HTTP enviadas (incluye reintentos).
  requests_made integer check (requests_made >= 0),
  -- Créditos medidos con la API de uso del proveedor (null si no se pudo medir).
  credits_used integer,
  -- Créditos esperados según el modelo de coste del adaptador.
  credits_estimated integer check (credits_estimated >= 0),
  -- [{ security, kind, message }] — metadatos flexibles de diagnóstico.
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at),
  check (status = 'running' or finished_at is not null)
);
create index sync_runs_provider_job_started_idx on public.sync_runs (provider, job_type, started_at desc);

create table public.sync_cursors (
  provider text not null,
  job_type text not null,
  security_id uuid not null references public.securities (id) on delete cascade,
  -- Último dato sincronizado (p. ej. última trade_date).
  last_value date,
  -- Forzar recarga completa (p. ej. split nuevo: el volumen ajustado del proveedor cambia).
  full_refresh_required boolean not null default false,
  last_success_at timestamptz,
  last_run_id uuid references public.sync_runs (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (provider, job_type, security_id)
);
create trigger sync_cursors_set_updated_at before update on public.sync_cursors
  for each row execute function public.set_updated_at();

-- --- RLS y GRANTs ---------------------------------------------------------------------------------------
-- Datos de mercado: lectura (anon/authenticated) igual que los de referencia.
-- security_identifiers, sync_runs y sync_cursors son internos: sin acceso anon.
-- Los jobs escriben con service_role (bypass RLS), que necesita GRANT explícito.

do $$
declare
  t text;
begin
  foreach t in array array[
    'daily_prices', 'corporate_actions', 'adjustment_factors', 'shares_outstanding', 'canonical_line_items',
    'financial_statement_values', 'earnings_events', 'earnings_estimates', 'valuation_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;

  foreach t in array array['security_identifiers', 'sync_runs', 'sync_cursors']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on
  public.security_identifiers, public.daily_prices, public.corporate_actions, public.adjustment_factors,
  public.shares_outstanding, public.canonical_line_items, public.financial_statement_values,
  public.earnings_events, public.earnings_estimates, public.valuation_snapshots,
  public.sync_runs, public.sync_cursors
  to service_role;

grant select on
  public.datasets, public.countries, public.exchanges, public.taxonomies, public.sectors, public.industry_groups,
  public.industries, public.sub_industries, public.companies, public.securities, public.indices,
  public.index_constituents, public.themes, public.company_themes, public.v_securities
  to service_role;
