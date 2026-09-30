-- MarketRadar · Fase 2B.1 · 0008 — origen de los valores fundamentales (proveedor vs calculado)
-- y EPS de earnings identificado como dato del proveedor.
--
--   * financial_statement_values.value_origin: 'provider' (tal como lo publica el proveedor) o
--     'calculated' (MarketRadar, con la fórmula en source_field). Ambos conviven: nunca se
--     sobrescriben (p. ej. free_cash_flow del proveedor y free_cash_flow calculado).
--   * Un valor calculado que no se puede calcular se guarda como NULL con missing_reason
--     (p. ej. provider_missing_weighted_average_shares). Nunca se usa un sustituto silencioso.
--   * earnings_events: el EPS es el "provider earnings EPS" (base contable no documentada por el
--     proveedor ⇒ eps_basis = 'unspecified'); no es GAAP EPS.

-- --- Partidas nuevas del catálogo -----------------------------------------------------------------

insert into public.canonical_line_items (code, statement, label, unit, nature, description, sort_order) values
  ('net_income_to_common', 'income', 'Net income to common', 'currency', 'duration', 'Net income attributable to common shareholders.', 45),
  ('weighted_average_shares_basic', 'income', 'Weighted avg. shares (basic)', 'shares', 'duration', 'Weighted-average basic shares outstanding during the period.', 46),
  ('weighted_average_shares_diluted', 'income', 'Weighted avg. shares (diluted)', 'shares', 'duration', 'Weighted-average diluted shares outstanding during the period.', 47);

update public.canonical_line_items set description = 'Basic EPS calculated by MarketRadar: net income to common / weighted-average basic shares. Never derived from period-end shares.' where code = 'eps_basic';
update public.canonical_line_items set description = 'Diluted EPS calculated by MarketRadar: net income to common / weighted-average diluted shares. Never derived from period-end shares.' where code = 'eps_diluted';
update public.canonical_line_items set description = 'Free cash flow. Provider value and MarketRadar calculation (operating cash flow − capex) are stored separately (value_origin).' where code = 'free_cash_flow';

-- --- Origen de los valores ---------------------------------------------------------------------------

alter table public.financial_statement_values
  add column value_origin text not null default 'provider' check (value_origin in ('provider', 'calculated')),
  add column missing_reason text check (missing_reason ~ '^[a-z_]+$'),
  alter column value drop not null;

alter table public.financial_statement_values drop constraint financial_statement_values_pkey;
alter table public.financial_statement_values
  add primary key (company_id, source, line_item_code, period_type, fiscal_period_end, value_origin);

alter table public.financial_statement_values
  -- Un NULL solo existe como cálculo imposible con motivo explícito.
  add constraint financial_statement_values_null_needs_reason
    check ((value is not null and missing_reason is null) or (value is null and value_origin = 'calculated' and missing_reason is not null));

comment on column public.financial_statement_values.value_origin is 'provider = as published by the provider; calculated = MarketRadar formula (see source_field).';
comment on column public.financial_statement_values.source_field is 'Provider field (provider values) or MarketRadar formula (calculated values).';
comment on column public.financial_statement_values.missing_reason is 'Why a calculated value could not be computed (e.g. provider_missing_weighted_average_shares).';

-- --- EPS de earnings = dato del proveedor ------------------------------------------------------------

alter table public.earnings_events rename column eps_actual to provider_eps_actual;
alter table public.earnings_events rename column eps_estimate to provider_eps_estimate;
alter table public.earnings_events rename column eps_surprise to provider_eps_surprise;
alter table public.earnings_events rename column eps_surprise_percent to provider_eps_surprise_percent;
alter table public.earnings_events
  add column eps_basis text not null default 'unspecified' check (eps_basis in ('unspecified', 'gaap', 'non_gaap'));

comment on column public.earnings_events.provider_eps_actual is 'Provider earnings EPS. NOT GAAP EPS unless eps_basis says so.';
comment on column public.earnings_events.eps_basis is 'Accounting basis of the provider EPS. EODHD does not document it ⇒ unspecified.';
