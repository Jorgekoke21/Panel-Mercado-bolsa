-- MarketRadar · Fase 1 · 0006 — vistas de lectura, GRANTs explícitos y RLS.
--
-- Modelo de acceso de Fase 1 (sin autenticación):
--   * Todas las tablas tienen RLS activado.
--   * anon/authenticated solo pueden LEER datos de referencia (política select using true).
--   * No existen políticas de escritura: solo el seed (rol postgres) y futuros jobs con
--     service_role escriben. `auto_expose_new_tables = false`, así que cada tabla nueva
--     necesita su propio GRANT.

create view public.v_securities
with (security_invoker = true) as
select
  s.id as security_id,
  s.ticker,
  s.name as security_name,
  s.currency,
  s.share_class,
  s.security_type,
  s.is_primary,
  s.is_active,
  c.id as company_id,
  c.name as company_name,
  c.slug as company_slug,
  c.legal_name,
  c.cik,
  c.hq_city,
  c.hq_region,
  c.hq_country_code,
  hq.name as hq_country_name,
  c.domicile_country_code,
  c.website,
  c.description,
  c.logo_url,
  c.employees,
  c.founded_year,
  e.id as exchange_id,
  e.mic as exchange_mic,
  e.name as exchange_name,
  e.acronym as exchange_acronym,
  e.country_code as exchange_country_code,
  sec.taxonomy_code,
  sec.id as sector_id,
  sec.code as sector_code,
  sec.name as sector_name,
  sec.slug as sector_slug,
  ig.id as industry_group_id,
  ig.code as industry_group_code,
  ig.name as industry_group_name,
  ig.slug as industry_group_slug,
  ind.id as industry_id,
  ind.code as industry_code,
  ind.name as industry_name,
  ind.slug as industry_slug,
  sub.id as sub_industry_id,
  sub.code as sub_industry_code,
  sub.name as sub_industry_name,
  sub.slug as sub_industry_slug
from public.securities s
join public.companies c on c.id = s.company_id
join public.exchanges e on e.id = s.exchange_id
left join public.countries hq on hq.code = c.hq_country_code
left join public.sub_industries sub on sub.id = c.sub_industry_id
left join public.industries ind on ind.id = sub.industry_id
left join public.industry_groups ig on ig.id = ind.industry_group_id
left join public.sectors sec on sec.id = ig.sector_id;

comment on view public.v_securities is 'Read model: listed security + issuer + exchange + full classification path.';

create view public.v_index_memberships
with (security_invoker = true) as
select
  ic.security_id,
  ic.index_id,
  i.code as index_code,
  i.slug as index_slug,
  i.name as index_name,
  i.short_name as index_short_name,
  i.kind as index_kind,
  ic.added_on,
  ic.dataset_id
from public.index_constituents ic
join public.indices i on i.id = ic.index_id
where ic.removed_on is null;

comment on view public.v_index_memberships is 'Current (not removed) index memberships.';

-- Componentes actuales de cada índice con todo el read model del valor (filtrable por index_slug).
create view public.v_index_constituent_securities
with (security_invoker = true) as
select
  m.index_id,
  m.index_slug,
  m.added_on,
  s.*
from public.v_index_memberships m
join public.v_securities s on s.security_id = m.security_id;

comment on view public.v_index_constituent_securities is 'Current constituents of each index joined with v_securities.';

-- RLS + lectura pública de datos de referencia.
do $$
declare
  t text;
begin
  foreach t in array array[
    'datasets', 'countries', 'exchanges', 'taxonomies', 'sectors', 'industry_groups',
    'industries', 'sub_industries', 'companies', 'securities', 'indices',
    'index_constituents', 'themes', 'company_themes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

grant select on public.v_securities, public.v_index_memberships, public.v_index_constituent_securities
  to anon, authenticated;
