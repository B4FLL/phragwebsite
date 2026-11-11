-- Approved-email list: run AFTER schema.sql and cms.sql. Safe to run more than once.
-- Supabase > SQL Editor > New query > paste > Run.
--
-- To add a member: Table Editor > member_emails > Insert row > type their email,
-- pick a role (editor or expert), Save. When they sign in with that email they get the role.
-- (The old `editors` and `experts` tables still work too.)

do $$ begin
  create type public.member_role as enum ('editor', 'expert');
exception when duplicate_object then null;
end $$;

create table if not exists public.member_emails (
  email    text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  role     public.member_role not null,
  note     text,
  added_at timestamptz not null default now(),
  primary key (email, role)
);

-- Emails are matched in lowercase, so store them that way however they were typed.
create or replace function public.normalize_member_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end $$;

drop trigger if exists member_emails_normalize on public.member_emails;
create trigger member_emails_normalize
  before insert or update on public.member_emails
  for each row execute function public.normalize_member_email();

-- No policies on purpose: nobody can read or change this list through the website.
-- You manage it from the Supabase dashboard, which isn't blocked by these rules.
alter table public.member_emails enable row level security;

-- Who is the signed-in person? The email comes from their verified sign-in link.
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where user_id = auth.uid())
      or exists (select 1 from public.member_emails
                 where role = 'editor' and email = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.is_expert() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.experts where user_id = auth.uid())
      or exists (select 1 from public.member_emails
                 where role = 'expert' and email = lower(auth.jwt() ->> 'email'));
$$;

revoke execute on function public.is_editor(), public.is_expert() from public, anon;
grant execute on function public.is_editor(), public.is_expert() to authenticated;

-- Point every permission rule at those two checks.
drop policy if exists "experts read" on public.reports;
create policy "experts read" on public.reports
  for select to authenticated using (public.is_expert());

drop policy if exists "experts update" on public.reports;
create policy "experts update" on public.reports
  for update to authenticated
  using (public.is_expert()) with check (public.is_expert());

drop policy if exists "editors add content" on public.site_content;
create policy "editors add content" on public.site_content
  for insert to authenticated with check (public.is_editor());

drop policy if exists "editors change content" on public.site_content;
create policy "editors change content" on public.site_content
  for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "editors read history" on public.site_content_history;
create policy "editors read history" on public.site_content_history
  for select to authenticated using (public.is_editor());

drop policy if exists "editors upload photos" on storage.objects;
create policy "editors upload photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_editor());
