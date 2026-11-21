-- Cow herds shown on the map. Run AFTER schema.sql and members.sql. Safe to run more than once.
--
-- Supabase > SQL Editor > New query > paste > Run.
--
-- Everyone can see herds. Only editors and experts (from member_emails) can add or remove them.

create table if not exists public.cow_herds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  lat         double precision not null check (lat between 36.9 and 42.1),
  lng         double precision not null check (lng between -114.1 and -108.9),
  head_count  integer check (head_count between 1 and 10000),
  activity    text not null default 'grazing' check (activity in ('grazing', 'moving', 'resting')),
  note        text check (char_length(note) <= 500),
  seen_on     date not null default current_date,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.cow_herds enable row level security;

drop policy if exists "anyone sees herds" on public.cow_herds;
create policy "anyone sees herds" on public.cow_herds
  for select to anon, authenticated using (true);

drop policy if exists "team adds herds" on public.cow_herds;
create policy "team adds herds" on public.cow_herds
  for insert to authenticated
  with check (public.is_editor() or public.is_expert());

drop policy if exists "team removes herds" on public.cow_herds;
create policy "team removes herds" on public.cow_herds
  for delete to authenticated
  using (public.is_editor() or public.is_expert());

grant select on public.cow_herds to anon, authenticated;
grant insert, delete on public.cow_herds to authenticated;
