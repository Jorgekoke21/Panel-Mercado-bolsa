-- MarketRadar · Fase 2B.2 · 0009 — fundamentales oficiales SEC EDGAR / XBRL.
--
--   * sec_entities: perfil SEC del emisor (CIK, SIC ⇒ plantilla sectorial, cierre fiscal).
--   * sec_filings: 10-K / 10-Q (y enmiendas) + 8-K item 2.02 (publicación de resultados). Es la
--     base de la trazabilidad: cada valor reportado apunta a su accession number.
--   * financial_statement_values: nuevos orígenes 'reported' (tal cual en el filing) y 'derived'
--     (Q4 = FY − 9M, trimestre = YTD − YTD previo…), con periodo fiscal, concept, accession, formulario,
--     reexpresión y fórmula de derivación.
--   * fundamental_coverage: por emisor y partida, si está disponible, no aplica (bancos/aseguradoras),
--     falta o dejó de reportarse con concepts estándar. La UI lo usa para explicar cada "—".

insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('sec-companyfacts', 'SEC XBRL company facts', 'U.S. Securities and Exchange Commission — EDGAR XBRL APIs',
   'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
   'U.S. government public data (EDGAR). Free; subject to the SEC fair-access policy (≤ 10 requests/second, declared User-Agent).', false,
   'Standard taxonomies only (us-gaap, dei…); company-specific extensions and dimensional facts are not included.'),
  ('sec-submissions', 'SEC EDGAR filing index', 'U.S. Securities and Exchange Commission — EDGAR submissions API',
   'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
   'U.S. government public data (EDGAR).', false,
   'Entity profile (SIC, fiscal year end) and filing history; earnings releases = 8-K item 2.02.');

-- --- Perfil SEC ---------------------------------------------------------------------------------------------

create table public.sec_entities (
  company_id uuid primary key references public.companies (id) on delete cascade,
  cik text not null unique check (cik ~ '^[0-9]{10}$'),
  name text not null,
  sic text,
  sic_description text,
  industry_template text not null check (industry_template in ('general', 'financial', 'reit')),
  fiscal_year_end text check (fiscal_year_end ~ '^[0-9]{4}$'),
  tickers text[] not null default '{}',
  exchanges text[] not null default '{}',
  filer_category text,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now()
);
comment on table public.sec_entities is 'SEC EDGAR entity profile per issuer (CIK, SIC → industry template, fiscal year end).';

create table public.sec_filings (
  accession_number text primary key check (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  company_id uuid not null references public.companies (id) on delete cascade,
  form text not null,
  filing_date date not null,
  report_date date,
  accepted_at timestamptz,
  items text[] not null default '{}',
  primary_document text,
  -- Solo 8-K 2.02: derivado de la hora de aceptación en EDGAR (el comunicado puede ser anterior).
  release_timing text check (release_timing in ('before_market', 'during_market', 'after_market')),
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now()
);
comment on table public.sec_filings is 'Periodic reports (10-K/10-Q) and earnings releases (8-K item 2.02) — provenance anchor for SEC values.';
create index sec_filings_company_date_idx on public.sec_filings (company_id, filing_date desc);

-- --- Trazabilidad de valores fundamentales -----------------------------------------------------------------

alter table public.financial_statement_values drop constraint financial_statement_values_value_origin_check;
alter table public.financial_statement_values
  add constraint financial_statement_values_value_origin_check check (value_origin in ('reported', 'derived', 'calculated', 'provider')),
  add column period_start date,
  add column fiscal_year smallint,
  add column fiscal_quarter smallint check (fiscal_quarter between 1 and 4),
  add column accession_number text,
  add column form text,
  add column restated boolean not null default false,
  add column derivation text,
  add constraint financial_statement_values_quarter_consistency check ((period_type = 'quarterly') or fiscal_quarter is null);

comment on column public.financial_statement_values.value_origin is
  'reported = as filed (SEC XBRL) · derived = arithmetic on reported values (e.g. Q4 = FY − 9M) · calculated = MarketRadar formula · provider = commercial vendor value.';
comment on column public.financial_statement_values.accession_number is 'SEC accession number of the filing the value (or its latest component) comes from.';
comment on column public.financial_statement_values.derivation is 'Formula and component filings when value_origin = derived.';

create index financial_statement_values_company_period_idx
  on public.financial_statement_values (company_id, source, period_type, fiscal_period_end desc);

-- --- Cobertura por partida -----------------------------------------------------------------------------------

create table public.fundamental_coverage (
  company_id uuid not null references public.companies (id) on delete cascade,
  source text not null,
  line_item_code text not null references public.canonical_line_items (code),
  status text not null check (status in ('available', 'missing', 'not_applicable', 'discontinued')),
  reason text,
  concepts text[] not null default '{}',
  annual_periods integer not null default 0,
  quarterly_periods integer not null default 0,
  latest_period_end date,
  dataset_id uuid not null references public.datasets (id),
  ingested_at timestamptz not null default now(),
  primary key (company_id, source, line_item_code),
  check (status = 'available' or reason is not null)
);
comment on table public.fundamental_coverage is 'Per issuer and line item: available / missing / not applicable / discontinued, with the reason shown in the UI.';

-- --- Catálogo -----------------------------------------------------------------------------------------------

insert into public.canonical_line_items (code, statement, label, unit, nature, description, sort_order) values
  ('pretax_income', 'income', 'Pre-tax income', 'currency', 'duration', 'Income from continuing operations before income taxes.', 62),
  ('income_tax_expense', 'income', 'Income tax expense', 'currency', 'duration', 'Income tax expense (benefit).', 64),
  ('depreciation_amortization', 'cash_flow', 'Depreciation & amortization', 'currency', 'duration', 'Depreciation, depletion and amortization (cash-flow statement add-back).', 75),
  ('dividends_per_share', 'income', 'Dividends declared per share', 'per_share', 'duration', 'Common stock dividends declared per share in the period.', 66),
  ('total_liabilities', 'balance', 'Total liabilities', 'currency', 'instant', 'Total liabilities at period end (reported, or derived as liabilities-and-equity minus total equity including non-controlling interests).', 115);

update public.canonical_line_items set description = 'Basic EPS as reported in filings (SEC), or calculated by MarketRadar as net income to common / weighted-average basic shares. Never derived from period-end shares.' where code = 'eps_basic';
update public.canonical_line_items set description = 'Diluted EPS as reported in filings (SEC), or calculated by MarketRadar as net income to common / weighted-average diluted shares. Never derived from period-end shares.' where code = 'eps_diluted';
update public.canonical_line_items set description = 'Short-term borrowings plus long-term debt (including current portion) at period end; excludes operating lease liabilities. Components are recorded when derived.' where code = 'total_debt';

-- --- Acciones de portada ------------------------------------------------------------------------------------

alter table public.shares_outstanding drop constraint shares_outstanding_basis_check;
alter table public.shares_outstanding
  add constraint shares_outstanding_basis_check check (basis in ('period_end', 'current', 'cover_page'));

-- --- RLS / GRANTs --------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['sec_entities', 'sec_filings', 'fundamental_coverage']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end;
$$;

-- Los jobs leen el universo desde las vistas de índices.
grant select on public.v_index_memberships, public.v_index_constituent_securities to service_role;
