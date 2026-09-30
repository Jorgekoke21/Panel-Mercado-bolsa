-- MarketRadar · Fase 1 · 0003 — emisores (companies) y valores cotizados (securities).
--
-- El ticker pertenece al valor cotizado, no a la empresa: Alphabet tiene GOOGL y GOOG; en
-- Fase 7 una empresa podrá cotizar en varias bolsas o tener ADR. Precios e índices se
-- relacionan siempre con `securities`.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Identificadores de emisor (opcionales: dependen del país).
  cik text unique check (cik ~ '^[0-9]{10}$'),
  lei text unique check (lei ~ '^[A-Z0-9]{20}$'),
  -- Clasificación actual (sector/industria se derivan de la sub-industria).
  sub_industry_id uuid references public.sub_industries (id),
  -- Sede (headquarters) y domicilio legal pueden diferir (p. ej. sede en EE. UU., domicilio en Irlanda).
  hq_city text,
  hq_region text,
  hq_country_code char(2) references public.countries (code),
  domicile_country_code char(2) references public.countries (code),
  website text,
  description text,
  logo_url text,
  employees integer check (employees >= 0),
  founded_year smallint check (founded_year between 1500 and 2100),
  is_active boolean not null default true,
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_sub_industry_id_idx on public.companies (sub_industry_id);
create index companies_hq_country_code_idx on public.companies (hq_country_code);

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  exchange_id uuid not null references public.exchanges (id),
  -- Ticker canónico de MarketRadar (p. ej. BRK.B). Los símbolos por proveedor irán en
  -- security_identifiers (Fase 2).
  ticker text not null check (ticker ~ '^[A-Z0-9]+([.-][A-Z0-9]+)*$'),
  name text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  share_class text,
  security_type text not null default 'common_stock'
    check (security_type in ('common_stock', 'preferred_stock', 'adr', 'etf', 'reit_unit', 'other')),
  isin text unique check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  figi text unique check (figi ~ '^[A-Z0-9]{12}$'),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exchange_id, ticker)
);
create index securities_company_id_idx on public.securities (company_id);
create index securities_ticker_idx on public.securities (ticker);
-- Como máximo un valor principal por empresa.
create unique index securities_one_primary_per_company on public.securities (company_id) where is_primary;

create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger securities_set_updated_at before update on public.securities
  for each row execute function public.set_updated_at();
