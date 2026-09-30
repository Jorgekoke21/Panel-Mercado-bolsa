-- MarketRadar · Fase 1 · 0002 — taxonomías de clasificación sectorial.
--
-- Jerarquía de 4 niveles (sector → industry group → industry → sub-industry) parametrizada
-- por taxonomía: hoy GICS; en Fase 7 podrá convivir ICB u otra sin cambiar el modelo.
-- Las FK compuestas (parent_id, taxonomy_code) garantizan que un hijo pertenece a la misma
-- taxonomía que su padre.

create table public.taxonomies (
  code text primary key check (code ~ '^[A-Z0-9_]+$'),
  name text not null,
  publisher text,
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  taxonomy_code text not null references public.taxonomies (code),
  code text not null,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxonomy_code, code),
  unique (taxonomy_code, slug),
  unique (id, taxonomy_code)
);

create table public.industry_groups (
  id uuid primary key default gen_random_uuid(),
  taxonomy_code text not null references public.taxonomies (code),
  sector_id uuid not null,
  code text not null,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxonomy_code, code),
  unique (taxonomy_code, slug),
  unique (id, taxonomy_code),
  foreign key (sector_id, taxonomy_code) references public.sectors (id, taxonomy_code)
);
create index industry_groups_sector_id_idx on public.industry_groups (sector_id);

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  taxonomy_code text not null references public.taxonomies (code),
  industry_group_id uuid not null,
  code text not null,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxonomy_code, code),
  unique (taxonomy_code, slug),
  unique (id, taxonomy_code),
  foreign key (industry_group_id, taxonomy_code) references public.industry_groups (id, taxonomy_code)
);
create index industries_industry_group_id_idx on public.industries (industry_group_id);

create table public.sub_industries (
  id uuid primary key default gen_random_uuid(),
  taxonomy_code text not null references public.taxonomies (code),
  industry_id uuid not null,
  code text not null,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxonomy_code, code),
  unique (taxonomy_code, slug),
  foreign key (industry_id, taxonomy_code) references public.industries (id, taxonomy_code)
);
create index sub_industries_industry_id_idx on public.sub_industries (industry_id);

create trigger taxonomies_set_updated_at before update on public.taxonomies
  for each row execute function public.set_updated_at();
create trigger sectors_set_updated_at before update on public.sectors
  for each row execute function public.set_updated_at();
create trigger industry_groups_set_updated_at before update on public.industry_groups
  for each row execute function public.set_updated_at();
create trigger industries_set_updated_at before update on public.industries
  for each row execute function public.set_updated_at();
create trigger sub_industries_set_updated_at before update on public.sub_industries
  for each row execute function public.set_updated_at();
