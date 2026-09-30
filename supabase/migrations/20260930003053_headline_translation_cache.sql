-- Machine translated display headlines. Source articles and event titles stay untouched.
create table public.news_headline_translations (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  event_id uuid not null references public.news_events (id) on delete cascade,
  original_title text not null,
  original_language text,
  original_url text,
  source text,
  target_locale text not null check (target_locale in ('es', 'en')),
  provider text not null,
  provider_version text not null,
  translated_title text not null check (length(trim(translated_title)) > 0),
  created_at timestamptz not null default now()
);

create index news_headline_translations_event_idx on public.news_headline_translations (event_id);
comment on table public.news_headline_translations is 'Cache of localized display headlines keyed by event, original title, source language, URL, publisher, target locale, provider and version. Original article metadata remains in news_articles.';

alter table public.news_headline_translations enable row level security;
revoke all on public.news_headline_translations from anon, authenticated;
grant select, insert, update, delete on public.news_headline_translations to service_role;
