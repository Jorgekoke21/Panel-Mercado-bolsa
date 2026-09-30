-- MarketRadar · Fase 2B.2 · 0011 — snapshot de fundamentales por emisor (materialización).
--
-- Métricas SIN precio (TTM, márgenes, rentabilidad, crecimiento) calculadas por MarketRadar a partir
-- de los valores reportados/derivados (SEC). Las recalcula el job SEC. Sirve para agregados de
-- sector / industria / índice y futuros rankings sin leer ~500k filas por petición.
-- NULL = no calculable (falta un dato, no aplica o no es significativo); el motivo por empresa se ve
-- en la pestaña Valuation, que recalcula con el detalle completo.

create table public.company_fundamental_snapshots (
  company_id uuid primary key references public.companies (id) on delete cascade,
  source text not null,
  industry_template text not null check (industry_template in ('general', 'financial', 'reit')),
  -- Último trimestre incluido en el TTM.
  as_of_period_end date,
  revenue_ttm numeric,
  net_income_ttm numeric,
  gross_margin numeric,
  operating_margin numeric,
  net_margin numeric,
  fcf_margin numeric,
  roe numeric,
  roic numeric,
  revenue_growth numeric,
  net_income_growth numeric,
  eps_growth numeric,
  dataset_id uuid not null references public.datasets (id),
  computed_at timestamptz not null default now()
);
comment on table public.company_fundamental_snapshots is 'Per-issuer price-independent fundamentals (TTM, margins, returns, growth) calculated by MarketRadar from SEC filings.';

alter table public.company_fundamental_snapshots enable row level security;
create policy company_fundamental_snapshots_read on public.company_fundamental_snapshots for select to anon, authenticated using (true);
grant select on public.company_fundamental_snapshots to anon, authenticated;
grant select, insert, update, delete on public.company_fundamental_snapshots to service_role;
