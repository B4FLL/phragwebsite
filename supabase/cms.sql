-- Member-editable website content. Run AFTER schema.sql. Safe to run more than once.
--
-- Supabase > SQL Editor > New query > paste > Run.

-- People allowed to edit the website text and photos.
create table if not exists public.editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.editors enable row level security;
drop policy if exists "editors see own row" on public.editors;
create policy "editors see own row" on public.editors
  for select to authenticated using (user_id = auth.uid());

-- One row per editable piece of text or photo (key matches data-edit in the HTML).
create table if not exists public.site_content (
  key         text primary key check (key ~ '^[a-z0-9-]{1,64}$'),
  value       text not null check (char_length(value) <= 20000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
alter table public.site_content enable row level security;

drop policy if exists "anyone reads content" on public.site_content;
create policy "anyone reads content" on public.site_content
  for select to anon, authenticated using (true);
drop policy if exists "editors add content" on public.site_content;
create policy "editors add content" on public.site_content
  for insert to authenticated
  with check (exists (select 1 from public.editors e where e.user_id = auth.uid()));
drop policy if exists "editors change content" on public.site_content;
create policy "editors change content" on public.site_content
  for update to authenticated
  using (exists (select 1 from public.editors e where e.user_id = auth.uid()))
  with check (exists (select 1 from public.editors e where e.user_id = auth.uid()));

grant select on public.site_content to anon, authenticated;
grant insert, update on public.site_content to authenticated;

-- Every save is also kept in a history table, so a bad edit can be undone.
create table if not exists public.site_content_history (
  id          bigint generated always as identity primary key,
  key         text not null,
  value       text not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
alter table public.site_content_history enable row level security;
drop policy if exists "editors read history" on public.site_content_history;
create policy "editors read history" on public.site_content_history
  for select to authenticated
  using (exists (select 1 from public.editors e where e.user_id = auth.uid()));
grant select on public.site_content_history to authenticated;

create or replace function public.log_site_content() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.site_content_history (key, value, changed_by)
    values (new.key, new.value, auth.uid());
  return new;
end $$;

drop trigger if exists site_content_log on public.site_content;
create trigger site_content_log
  before insert or update on public.site_content
  for each row execute function public.log_site_content();

-- Photo storage: public to read, only editors can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "editors upload photos" on storage.objects;
create policy "editors upload photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images'
              and exists (select 1 from public.editors e where e.user_id = auth.uid()));
