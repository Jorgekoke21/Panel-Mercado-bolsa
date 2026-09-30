-- MarketRadar · Fase 1 · 0004 — índices (oficiales y sintéticos) y su composición.
--
-- Un índice OFICIAL lo publica un tercero (S&P DJI, Nasdaq, FTSE Russell…).
-- Un índice SINTÉTICO lo calcula MarketRadar (p. ej. "MarketRadar Semiconductors Index",
-- equal/cap weighted) y nunca debe presentarse como oficial. Las definiciones sintéticas
-- se crearán en Fase 2, cuando existan precios.

create table public.indices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_.-]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_name text,
  kind text not null check (kind in ('official', 'synthetic')),
  methodology text not null check (methodology in ('provider', 'equal_weight', 'cap_weight')),
  provider text not null,
  country_code char(2) references public.countries (code),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  description text,
  base_date date,
  base_value numeric(18, 6),
  -- Ámbito de un índice sintético: como mucho un nivel de clasificación (arco exclusivo).
  scope_sector_id uuid references public.sectors (id),
  scope_industry_group_id uuid references public.industry_groups (id),
  scope_industry_id uuid references public.industries (id),
  scope_sub_industry_id uuid references public.sub_industries (id),
  -- true cuando MarketRadar mantiene su lista de componentes.
  constituents_tracked boolean not null default false,
  is_active boolean not null default true,
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint indices_scope_single check (
    num_nonnulls(scope_sector_id, scope_industry_group_id, scope_industry_id, scope_sub_industry_id) <= 1
  ),
  constraint indices_official_methodology check (
    (kind = 'official' and methodology = 'provider'
      and num_nonnulls(scope_sector_id, scope_industry_group_id, scope_industry_id, scope_sub_industry_id) = 0)
    or (kind = 'synthetic' and methodology in ('equal_weight', 'cap_weight'))
  )
);

-- Pertenencia fechada (point-in-time) para evitar sesgo de supervivencia.
create table public.index_constituents (
  id uuid primary key default gen_random_uuid(),
  index_id uuid not null references public.indices (id),
  security_id uuid not null references public.securities (id),
  added_on date,
  removed_on date,
  weight numeric(12, 9) check (weight >= 0 and weight <= 1),
  dataset_id uuid not null references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint index_constituents_dates check (removed_on is null or added_on is null or removed_on >= added_on)
);
create unique index index_constituents_one_active
  on public.index_constituents (index_id, security_id) where removed_on is null;
create index index_constituents_security_id_idx on public.index_constituents (security_id);

create trigger indices_set_updated_at before update on public.indices
  for each row execute function public.set_updated_at();
create trigger index_constituents_set_updated_at before update on public.index_constituents
  for each row execute function public.set_updated_at();
