-- Cached titles contain public news metadata. Hosted readers need no service key.
create policy news_headline_translations_read
on public.news_headline_translations for select to anon, authenticated using (true);
grant select on public.news_headline_translations to anon, authenticated;

-- RLS does not protect TRUNCATE; public readers must have no write or maintenance privileges.
revoke insert, update, delete, truncate, references, trigger, maintain
on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
revoke insert, update, delete, truncate, references, trigger, maintain on tables from anon, authenticated;
