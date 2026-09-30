-- MarketRadar · Fases 4/5 · 0016 — News Engine + AI Intelligence (ADR-0011).
--
-- ARTÍCULO ≠ EVENTO:
--   news_articles       metadatos de publicaciones de terceros (URL, titular, fecha, editor). NUNCA el cuerpo.
--   news_events         objeto propio de MarketRadar: agrupa artículos que cuentan lo mismo.
--   news_event_entities relación evento ↔ nodo (empresa, país, industria, materia prima…), DIRECT o INFERRED,
--                       con método, confianza y evidencia.
--   news_event_impacts  hipótesis de impacto potencial (canal, dirección, fuerza, horizonte, confianza, camino).
--   news_source_state   estado y observabilidad de cada fuente.
--   ai_outputs          caché de resultados de IA validados (clave = hash de entrada + contexto + prompt + modelo).
--
-- Nodos del grafo como texto "kind:key" (company:<uuid>, industry:453010, country:CN, commodity:crude_oil…):
-- materias primas y factores viven en la ontología versionada en código (src/knowledge), no en tablas.
-- Retención: `npm run sync -- news-prune` (artículos 21 días salvo representativos; eventos 120 días).

create table public.news_events (
  id uuid primary key,
  fingerprint text not null,
  event_type text not null check (event_type ~ '^[A-Z_]+$'),
  secondary_types text[] not null default '{}',
  title text not null,
  summary text not null,
  summary_origin text not null default 'deterministic' check (summary_origin in ('deterministic', 'ai')),
  status_hint text not null default 'active' check (status_hint in ('developing', 'active', 'stale')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  article_count integer not null check (article_count >= 1),
  independent_sources integer not null check (independent_sources >= 0),
  has_official_source boolean not null default false,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  confidence_breakdown jsonb not null,
  importance numeric(4, 3) not null check (importance between 0 and 1),
  contradictory boolean not null default false,
  unconfirmed boolean not null default false,
  polarity smallint not null default 0 check (polarity between -1 and 1),
  languages text[] not null default '{}',
  moves jsonb not null default '[]'::jsonb,
  representative_article_id bigint,
  -- Firma para el clustering incremental (tokens frecuentes + entidades), acotada a ~2 KB.
  seed jsonb not null,
  rule_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_seen_at >= first_seen_at)
);
comment on table public.news_events is 'MarketRadar events: clusters of articles about the same fact, with entities, impacts and explainable confidence.';
create index news_events_last_seen_idx on public.news_events (last_seen_at desc);
create index news_events_type_last_seen_idx on public.news_events (event_type, last_seen_at desc);
create index news_events_importance_idx on public.news_events (importance desc, last_seen_at desc);

create trigger news_events_set_updated_at before update on public.news_events
  for each row execute function public.set_updated_at();

create table public.news_articles (
  id bigint generated always as identity primary key,
  url_hash text not null unique check (url_hash ~ '^[0-9a-f]{40}$'),
  url text not null,
  title text not null check (char_length(title) <= 500),
  title_hash text not null,
  source_id text not null,
  publisher text not null,
  publisher_key text not null,
  tier smallint not null check (tier between 1 and 4),
  language text,
  published_at timestamptz not null,
  time_basis text not null check (time_basis in ('published', 'seen')),
  author text,
  -- Solo fuentes cuya licencia lo permite (dominio público / reutilización con atribución).
  snippet text check (snippet is null or char_length(snippet) <= 400),
  publisher_country text,
  event_id uuid references public.news_events (id) on delete set null,
  event_type text not null,
  -- Señales deterministas: {secondaryTypes, typeCertainty, links[], polarity, moves[], flags}.
  signals jsonb not null,
  hints jsonb,
  -- Republicaciones del mismo titular en otros editores (sindicación): no se guardan como filas.
  syndication_count integer not null default 1 check (syndication_count >= 1),
  also_seen_on text[] not null default '{}',
  ingested_at timestamptz not null default now()
);
comment on table public.news_articles is 'Third-party article METADATA only (headline, URL, time, publisher). Never the article body.';
create index news_articles_title_hash_idx on public.news_articles (title_hash, published_at desc);
create index news_articles_event_idx on public.news_articles (event_id);
create index news_articles_published_idx on public.news_articles (published_at desc);

alter table public.news_events
  add constraint news_events_representative_fk foreign key (representative_article_id) references public.news_articles (id) on delete set null;

create table public.news_event_entities (
  event_id uuid not null references public.news_events (id) on delete cascade,
  node text not null check (node ~ '^[a-zA-Z]+:.+$'),
  node_kind text not null,
  relation text not null check (relation in ('DIRECT', 'INFERRED')),
  method text not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  evidence text not null,
  via text,
  primary key (event_id, node)
);
comment on table public.news_event_entities is 'Event ↔ graph node links. DIRECT = named in the text/source metadata; INFERRED = derived (GICS classification, graph, event scope).';
create index news_event_entities_node_idx on public.news_event_entities (node, event_id);

create table public.news_event_impacts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.news_events (id) on delete cascade,
  target text not null,
  target_kind text not null,
  channel text not null check (channel in ('DIRECT', 'SECOND_ORDER', 'MACRO', 'SUPPLY_CHAIN')),
  direction text not null check (direction in ('potential_positive', 'potential_negative', 'mixed_uncertain')),
  strength smallint not null check (strength between 1 and 3),
  horizon text not null check (horizon in ('days', 'weeks', 'months', 'quarters')),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  mechanism text not null,
  rationale text not null,
  path text[] not null default '{}',
  relation_ids text[] not null default '{}',
  origin text not null default 'rule' check (origin in ('rule', 'ai')),
  unique (event_id, target, origin)
);
comment on table public.news_event_impacts is 'Potential (never causal) impact hypotheses: mechanism + direction + strength + horizon + confidence + graph path.';
create index news_event_impacts_target_idx on public.news_event_impacts (target, event_id);

create table public.news_source_state (
  source_id text primary key,
  label text not null,
  kind text not null,
  tier smallint check (tier between 1 and 4),
  license_terms text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_fetched integer not null default 0,
  last_inserted integer not null default 0,
  last_requests integer not null default 0,
  cursor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.news_source_state is 'Per-source status for observability and incremental fetching.';

create table public.ai_outputs (
  id bigint generated always as identity primary key,
  cache_key text not null unique,
  task text not null,
  subject text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  status text not null check (status in ('valid', 'rejected', 'error')),
  output jsonb,
  validation jsonb not null default '{}'::jsonb,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
comment on table public.ai_outputs is 'Cache + audit of AI outputs (validated structured JSON). A task is never re-run while input hash + context + prompt version + model are unchanged.';
create index ai_outputs_subject_idx on public.ai_outputs (subject, task, created_at desc);
create index ai_outputs_created_idx on public.ai_outputs (created_at desc);

-- Métricas estructuradas de cada ejecución (artículos, deduplicados, eventos, llamadas de IA, coste…).
alter table public.sync_runs add column metrics jsonb not null default '{}'::jsonb;

insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('gdelt-doc', 'GDELT DOC 2.0 article list', 'The GDELT Project', 'https://api.gdeltproject.org/api/v2/doc/doc',
   'GDELT: free and unrestricted use with citation. Headlines/URLs belong to each publisher (metadata + link only).', true,
   'Global news discovery. seendate = time GDELT first saw the article (not the publication time).'),
  ('sec-edgar-current', 'SEC EDGAR current Form 8-K filings', 'U.S. Securities and Exchange Commission', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent',
   'Public records; SEC fair-access policy.', false, 'Primary source for corporate events of universe issuers (filtered by CIK).'),
  ('official-news-feeds', 'Official RSS/Atom feeds', 'Federal Reserve, ECB, Bank of England, BLS, BEA, EIA, FDA, FTC, SEC, DOJ, CFTC', null,
   'US federal works are public domain; ECB reproduction permitted with attribution; BoE headline + link only.', false, 'Primary sources (tier 1).')
on conflict (key) do nothing;

-- --- Seguridad: lectura pública (anon) de datos de noticias; escritura solo service_role. ---------------------

alter table public.news_events enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_event_entities enable row level security;
alter table public.news_event_impacts enable row level security;
alter table public.news_source_state enable row level security;
alter table public.ai_outputs enable row level security;

create policy news_events_read on public.news_events for select to anon, authenticated using (true);
create policy news_articles_read on public.news_articles for select to anon, authenticated using (true);
create policy news_event_entities_read on public.news_event_entities for select to anon, authenticated using (true);
create policy news_event_impacts_read on public.news_event_impacts for select to anon, authenticated using (true);
create policy news_source_state_read on public.news_source_state for select to anon, authenticated using (true);
-- Solo salidas validadas; nunca las rechazadas (pueden contener texto no verificado).
create policy ai_outputs_read on public.ai_outputs for select to anon, authenticated using (status = 'valid');
-- Observabilidad del pipeline de noticias/IA en la UI (recuentos; sin secretos).
create policy sync_runs_news_read on public.sync_runs for select to anon, authenticated using (job_type in ('news_ingest', 'news_prune', 'ai_enrichment'));

grant select on public.news_events, public.news_articles, public.news_event_entities, public.news_event_impacts, public.news_source_state, public.ai_outputs to anon, authenticated;
grant select (id, provider, job_type, scope, status, started_at, finished_at, records_read, records_written, requests_made, metrics) on public.sync_runs to anon, authenticated;
grant select, insert, update, delete on public.news_events, public.news_articles, public.news_event_entities, public.news_event_impacts, public.news_source_state, public.ai_outputs to service_role;
grant usage, select on all sequences in schema public to service_role;
