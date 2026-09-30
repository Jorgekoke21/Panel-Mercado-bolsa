-- MarketRadar · Fase 2B.4 · 0015 — acciones por clase leídas de la portada XBRL del último 10-Q/10-K.
--
-- companyfacts (SEC) no publica hechos dimensionales: en los emisores con varias clases la cifra de
-- acciones de portada solo existe por clase. Esta tabla guarda, por security, la clase que le asigna
-- el propio filing (dei:TradingSymbol por clase o dei:Security12bTitle), sus acciones y la comprobación
-- independiente con las acciones medias ponderadas del BPA del MISMO filing. La cifra también se
-- escribe en shares_outstanding (basis cover_page) para el histórico.

create table public.security_share_classes (
  security_id uuid primary key references public.securities (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  accession_number text not null,
  form text,
  period_end date,
  -- Miembro del eje StatementClassOfStockAxis; NULL = emisor de clase única (cifra sin dimensión).
  class_member text,
  resolved_via text check (resolved_via in ('symbol_dimension', 'security_title', 'single_class')),
  shares bigint check (shares >= 0),
  shares_as_of date,
  check_status text not null check (check_status in ('consistent', 'inconsistent', 'no_reference', 'unresolved')),
  check_rule text check (check_rule in ('class_weighted_average', 'all_classes_total', 'listed_class_total')),
  reference_shares numeric,
  reference_kind text check (reference_kind in ('basic', 'diluted')),
  reference_period_end date,
  deviation numeric,
  note text,
  source text not null,
  dataset_id uuid not null references public.datasets (id),
  computed_at timestamptz not null default now()
);
comment on table public.security_share_classes is 'Per-security share class and cover-page shares from the latest 10-Q/10-K XBRL instance, cross-checked against same-filing EPS weighted-average shares.';

insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('sec-filing-cover', 'SEC filing cover pages (XBRL instance)', 'SEC EDGAR — filing archives', 'https://www.sec.gov/Archives/edgar/data/',
   'U.S. government public data.', false, 'dei:EntityCommonStockSharesOutstanding by share class, dei:TradingSymbol / Security12bTitle and EPS weighted-average shares from the latest 10-Q/10-K instance.')
on conflict (key) do nothing;

alter table public.security_share_classes enable row level security;
create policy security_share_classes_read on public.security_share_classes for select to anon, authenticated using (true);
grant select on public.security_share_classes to anon, authenticated;
grant select, insert, update, delete on public.security_share_classes to service_role;
