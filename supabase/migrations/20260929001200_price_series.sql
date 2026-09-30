-- MarketRadar · Fase 2B.3 · 0012 — series de precios compactas, calendario de sesiones y snapshot
-- de mercado por security.
--
-- Motivo (medido): con la procedencia repetida en cada barra (source, dataset_id, ingested_at,
-- volume_basis) y la clave uuid, una barra ocupaba ~210 B con índice ⇒ ~186 MB para 503 valores × 7
-- años, demasiado para Supabase Free (500 MB) junto a los fundamentales SEC (~200 MB).
--
--   * price_series: UNA serie por security y UNA sola fuente. Guarda la procedencia (fuente, dataset,
--     base del volumen, feed, fechas de descarga) y el estado de calidad (PASS/WARNING/MISSING/FAIL).
--   * daily_prices: solo (series_id int, fecha, OHLCV sin ajustar). Cambiar de proveedor = vaciar la
--     serie y recargarla entera (nunca se mezclan fuentes dentro de una serie).
--   * market_sessions: calendario oficial de sesiones (detecta huecos, medias sesiones y cuándo una
--     barra diaria es definitiva).
--   * security_market_snapshots: indicadores y rendimientos CALCULADOS por MarketRadar para la última
--     sesión (503 filas). Evita leer ~900k barras en cada carga del dashboard; se recalcula en cada
--     sincronización. Los agregados de sector/industria NO se materializan (se calculan en memoria
--     sobre estas 503 filas).

-- --- Series ------------------------------------------------------------------------------------------

create table public.price_series (
  id integer generated always as identity primary key,
  security_id uuid not null unique references public.securities (id) on delete cascade,
  source text not null check (source ~ '^[a-z0-9_]+$'),
  dataset_id uuid not null references public.datasets (id),
  volume_basis text not null check (volume_basis in ('raw', 'split_adjusted')),
  -- Feed del proveedor (p. ej. 'sip' en Alpaca). NULL si el proveedor no lo declara.
  feed text,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  first_date date,
  last_date date,
  bar_count integer not null default 0 check (bar_count >= 0),
  -- Última recarga completa. Con volumen split_adjusted, un split posterior obliga a recargar.
  full_loaded_at timestamptz,
  last_ingested_at timestamptz,
  quality_status text check (quality_status in ('PASS', 'WARNING', 'MISSING', 'FAIL')),
  -- [{ "kind": "...", "message": "..." }]
  quality_notes jsonb not null default '[]'::jsonb,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_date is null or last_date is null or first_date <= last_date)
);
comment on table public.price_series is 'One daily price series per security, from exactly one source. Holds provenance and data-quality status.';
create trigger price_series_set_updated_at before update on public.price_series
  for each row execute function public.set_updated_at();

-- --- Barras compactas -------------------------------------------------------------------------------

create table public.daily_bars (
  series_id integer not null references public.price_series (id) on delete cascade,
  -- Fecha de sesión local de la bolsa.
  trade_date date not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  volume bigint check (volume >= 0),
  -- SOLO validación (EODHD): cierre ajustado según el proveedor. NULL en Alpaca (no ocupa espacio).
  provider_adjusted_close numeric check (provider_adjusted_close > 0),
  primary key (series_id, trade_date),
  check (low <= high)
);
comment on table public.daily_bars is 'Unadjusted daily OHLCV (source of truth). Provenance lives in price_series. Adjusted series are computed by MarketRadar.';

-- Migración de las barras existentes (piloto EODHD) a la nueva estructura.
insert into public.price_series (security_id, source, dataset_id, volume_basis, currency, first_date, last_date, bar_count, full_loaded_at, last_ingested_at)
select d.security_id,
       min(d.source),
       (array_agg(d.dataset_id order by d.trade_date desc))[1],
       min(d.volume_basis),
       s.currency,
       min(d.trade_date),
       max(d.trade_date),
       count(*),
       min(d.ingested_at),
       max(d.ingested_at)
from public.daily_prices d
join public.securities s on s.id = d.security_id
group by d.security_id, s.currency;

insert into public.daily_bars (series_id, trade_date, open, high, low, close, volume, provider_adjusted_close)
select p.id, d.trade_date, d.open, d.high, d.low, d.close, d.volume, d.provider_adjusted_close
from public.daily_prices d
join public.price_series p on p.security_id = d.security_id;

drop table public.daily_prices;

-- Vista de compatibilidad para lecturas por security (la app y los informes leen por security_id).
create view public.v_daily_prices with (security_invoker = true) as
select p.security_id, b.trade_date, b.open, b.high, b.low, b.close, b.volume, b.provider_adjusted_close, p.source
from public.daily_bars b
join public.price_series p on p.id = b.series_id;
comment on view public.v_daily_prices is 'Daily bars by security_id (joins price_series). Read-only convenience view.';

-- --- Calendario de sesiones --------------------------------------------------------------------------

create table public.market_sessions (
  exchange_mic text not null check (exchange_mic ~ '^[A-Z0-9]{4}$'),
  session_date date not null,
  -- Horas oficiales de la sesión regular (medias sesiones: cierre a las 13:00 ET).
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  source text not null,
  primary key (exchange_mic, session_date),
  check (opens_at < closes_at)
);
comment on table public.market_sessions is 'Official regular-session calendar (holidays excluded, early closes included).';

-- --- Snapshot de mercado por security -------------------------------------------------------------------

create table public.security_market_snapshots (
  security_id uuid primary key references public.securities (id) on delete cascade,
  series_id integer not null references public.price_series (id) on delete cascade,
  source text not null,
  as_of_date date not null,
  bar_count integer not null,
  first_date date not null,
  close numeric not null,
  previous_close numeric,
  volume bigint,
  -- Rendimientos price return (ajustados por splits), en fracción. NULL = histórico insuficiente.
  return_1d numeric, return_1w numeric, return_1m numeric, return_3m numeric, return_6m numeric,
  return_ytd numeric, return_1y numeric, return_3y numeric, return_5y numeric,
  sma20 numeric, sma50 numeric, sma200 numeric,
  ema20 numeric, ema50 numeric, ema200 numeric,
  rsi14 numeric,
  macd numeric, macd_signal numeric, macd_histogram numeric,
  atr14 numeric,
  average_volume20 numeric,
  relative_volume numeric,
  average_dollar_volume20 numeric,
  high_52w numeric,
  low_52w numeric,
  is_new_52w_high boolean not null default false,
  is_new_52w_low boolean not null default false,
  -- Capitalización: solo se rellena market_cap si el estado es VERIFIED.
  market_cap numeric,
  market_cap_status text not null check (market_cap_status in ('VERIFIED', 'UNVERIFIED', 'MISSING')),
  market_cap_reason text not null,
  market_cap_shares bigint,
  market_cap_shares_as_of date,
  computed_at timestamptz not null default now()
);
comment on table public.security_market_snapshots is 'Latest-session indicators and returns calculated by MarketRadar from daily_bars + adjustment_factors (one row per security).';

-- --- Datasets -------------------------------------------------------------------------------------------

insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('alpaca-calendar', 'Alpaca market calendar', 'Alpaca Markets — Trading API v2 /calendar', 'https://docs.alpaca.markets/reference/getcalendar-1',
   'Alpaca Basic (free) for personal use.', false, 'US regular-session calendar (holidays and early closes).')
on conflict (key) do nothing;

update public.datasets
set notes = 'Unadjusted OHLCV (adjustment=raw), SIP feed, history since 2016. Basic plan: SIP only older than 15 minutes; daily volume includes extended-hours trades.'
where key = 'alpaca-eod-prices';

-- --- Seguridad ------------------------------------------------------------------------------------------

alter table public.price_series enable row level security;
alter table public.daily_bars enable row level security;
alter table public.market_sessions enable row level security;
alter table public.security_market_snapshots enable row level security;
create policy price_series_read on public.price_series for select to anon, authenticated using (true);
create policy daily_bars_read on public.daily_bars for select to anon, authenticated using (true);
create policy market_sessions_read on public.market_sessions for select to anon, authenticated using (true);
create policy security_market_snapshots_read on public.security_market_snapshots for select to anon, authenticated using (true);
grant select on public.price_series, public.daily_bars, public.market_sessions, public.security_market_snapshots, public.v_daily_prices to anon, authenticated;
grant select, insert, update, delete on public.price_series, public.daily_bars, public.market_sessions, public.security_market_snapshots to service_role;
grant select on public.v_daily_prices to service_role;
