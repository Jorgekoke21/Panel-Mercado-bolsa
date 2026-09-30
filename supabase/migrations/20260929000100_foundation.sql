-- MarketRadar · Fase 1 · 0001 — fundamentos: procedencia de datasets, países y bolsas.
--
-- Convenciones del schema (ver docs/data-model.md):
--   * PK uuid (gen_random_uuid) salvo catálogos con código natural estable (países ISO, taxonomías).
--   * created_at / updated_at en todas las tablas; updated_at mantenido por trigger.
--   * Ninguna tabla se expone automáticamente: los GRANT y RLS se declaran en 0006.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Procedencia: cada fila de referencia apunta al dataset del que salió.
create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]+$'),
  name text not null,
  source text not null,
  source_url text,
  license text,
  is_secondary_source boolean not null default false,
  -- Revisión/versión exacta de la fuente (p. ej. revid de Wikipedia).
  source_revision text,
  source_revision_at timestamptz,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  retrieved_at timestamptz,
  -- Fecha efectiva según la fuente oficial, solo si existe.
  effective_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.datasets is 'Provenance of every seeded/synced dataset (source, pinned revision, retrieval time).';

create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  iso3 char(3) not null unique check (iso3 ~ '^[A-Z]{3}$'),
  iso_numeric char(3) not null unique check (iso_numeric ~ '^[0-9]{3}$'),
  name text not null,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.countries is 'ISO 3166-1 countries. iso_numeric is kept for future world-map topologies.';

create table public.exchanges (
  id uuid primary key default gen_random_uuid(),
  mic text not null unique check (mic ~ '^[A-Z0-9]{4}$'),
  name text not null,
  acronym text,
  country_code char(2) not null references public.countries (code),
  timezone text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.exchanges is 'Trading venues identified by ISO 10383 MIC.';
create index exchanges_country_code_idx on public.exchanges (country_code);

create trigger datasets_set_updated_at before update on public.datasets
  for each row execute function public.set_updated_at();
create trigger countries_set_updated_at before update on public.countries
  for each row execute function public.set_updated_at();
create trigger exchanges_set_updated_at before update on public.exchanges
  for each row execute function public.set_updated_at();
