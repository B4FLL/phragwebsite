-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  lat          double precision not null check (lat between 36.9 and 42.1),
  lng          double precision not null check (lng between -114.1 and -108.9),
  observed_on  date not null check (observed_on <= current_date),
  id_guess     text not null check (id_guess in ('invasive','native','unsure')),
  patch_size   text not null check (patch_size in ('single','small','medium','large')),
  notes        text check (char_length(notes) <= 1000),
  reporter     text check (char_length(reporter) <= 80),
  status       text not null default 'unverified' check (status in ('unverified','verified','rejected')),
  expert_note  text check (char_length(expert_note) <= 1000),
  verified_by  uuid references auth.users(id)
);

-- People allowed to verify reports. Add a row per expert (their auth.users id).
create table public.experts (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.reports enable row level security;
alter table public.experts enable row level security;

-- Anyone may submit, but only as "unverified".
create policy "anyone can submit" on public.reports
  for insert to anon, authenticated
  with check (status = 'unverified' and verified_by is null and expert_note is null);

-- Experts can read exact data and change status.
create policy "experts read" on public.reports
  for select to authenticated
  using (exists (select 1 from public.experts e where e.user_id = auth.uid()));

create policy "experts update" on public.reports
  for update to authenticated
  using (exists (select 1 from public.experts e where e.user_id = auth.uid()))
  with check (exists (select 1 from public.experts e where e.user_id = auth.uid()));

create policy "experts see own row" on public.experts
  for select to authenticated using (user_id = auth.uid());

-- Public map reads this view: coordinates rounded to 2 decimals (~1 km) to
-- protect private land, and rejected reports are hidden.
create view public.public_reports as
  select id, round(lat::numeric, 2)::float8 as lat, round(lng::numeric, 2)::float8 as lng,
         observed_on, id_guess, patch_size, notes, status, expert_note, created_at
  from public.reports
  where status <> 'rejected';

grant select on public.public_reports to anon, authenticated;
grant insert on public.reports to anon, authenticated;
