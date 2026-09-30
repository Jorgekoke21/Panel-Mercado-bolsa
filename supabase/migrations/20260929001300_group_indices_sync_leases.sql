-- MarketRadar · Fase 2B.4 · 0013 — índices sintéticos por grupo y bloqueo de sincronización.
--
-- group_index_series: índices SINTÉTICOS de MarketRadar (no oficiales) por sector, grupo de industria,
-- industria, sub-industria y constituyentes del índice. Una fila por (grupo, método) con los niveles
-- diarios en un array compacto `real[]` alineado con market_sessions desde start_date (~3–4 MB para
-- 233 grupos × 2 métodos × 7 años, frente a ~30 MB con una fila por día). Se recalculan en cada sync
-- a partir de daily_bars (fuente de verdad): son derivados reconstruibles.
--
-- sync_leases: bloqueo con caducidad para que dos ejecuciones automáticas no se solapen.

create table public.group_index_series (
  group_kind text not null check (group_kind in ('index', 'sector', 'industry_group', 'industry', 'sub_industry')),
  -- uuid del nodo de clasificación, o slug del índice (p. ej. 'sp500').
  group_key text not null,
  method text not null check (method in ('equal_weight', 'cap_weight')),
  exchange_mic text not null,
  start_date date not null,
  end_date date not null,
  -- Niveles (base 100 en start_date), uno por sesión de market_sessions en [start_date, end_date].
  levels real[] not null,
  members_total integer not null,
  members_last integer not null,
  source text not null,
  computed_at timestamptz not null default now(),
  primary key (group_kind, group_key, method),
  check (start_date <= end_date),
  check (cardinality(levels) > 0)
);
comment on table public.group_index_series is 'MarketRadar synthetic group indices (equal / cap weight, price return, current constituents). Not official index data.';

create table public.sync_leases (
  name text primary key,
  holder text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
comment on table public.sync_leases is 'Mutual exclusion for scheduled sync runs (lease with expiry).';

alter table public.group_index_series enable row level security;
alter table public.sync_leases enable row level security;
create policy group_index_series_read on public.group_index_series for select to anon, authenticated using (true);
grant select on public.group_index_series to anon, authenticated;
grant select, insert, update, delete on public.group_index_series, public.sync_leases to service_role;
