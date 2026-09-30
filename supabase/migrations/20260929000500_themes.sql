-- MarketRadar · Fase 1 · 0005 — temas propios (AI, Data Centers, Defense Technology…).
--
-- Independientes de GICS. Cada asignación registra su origen (manual / provider / ai) y,
-- cuando no es manual, un nivel de confianza.

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  parent_id uuid references public.themes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_themes (
  company_id uuid not null references public.companies (id) on delete cascade,
  theme_id uuid not null references public.themes (id) on delete cascade,
  source text not null check (source in ('manual', 'provider', 'ai')),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  note text,
  dataset_id uuid references public.datasets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, theme_id),
  constraint company_themes_confidence_required check (source = 'manual' or confidence is not null)
);
create index company_themes_theme_id_idx on public.company_themes (theme_id);

create trigger themes_set_updated_at before update on public.themes
  for each row execute function public.set_updated_at();
create trigger company_themes_set_updated_at before update on public.company_themes
  for each row execute function public.set_updated_at();
