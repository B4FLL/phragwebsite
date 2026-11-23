-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to run more than once: it skips anything that already exists.

create table if not exists public.reports (
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
create table if not exists public.experts (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.reports enable row level security;
alter table public.experts enable row level security;

-- Anyone may submit, but only as "unverified".
drop policy if exists "anyone can submit" on public.reports;
create policy "anyone can submit" on public.reports
  for insert to anon, authenticated
  with check (status = 'unverified' and verified_by is null and expert_note is null);

-- Experts can read exact data and change status.
drop policy if exists "experts read" on public.reports;
create policy "experts read" on public.reports
  for select to authenticated
  using (exists (select 1 from public.experts e where e.user_id = auth.uid()));

drop policy if exists "experts update" on public.reports;
create policy "experts update" on public.reports
  for update to authenticated
  using (exists (select 1 from public.experts e where e.user_id = auth.uid()))
  with check (exists (select 1 from public.experts e where e.user_id = auth.uid()));

drop policy if exists "experts see own row" on public.experts;
create policy "experts see own row" on public.experts
  for select to authenticated using (user_id = auth.uid());

-- Public map reads this view: coordinates rounded to 2 decimals (~1 km) to
-- protect private land, and rejected reports are hidden.
create or replace view public.public_reports as
  select id, round(lat::numeric, 2)::float8 as lat, round(lng::numeric, 2)::float8 as lng,
         observed_on, id_guess, patch_size, notes, status, expert_note, created_at
  from public.reports
  where status <> 'rejected';

grant select on public.public_reports to anon, authenticated;
grant insert on public.reports to anon, authenticated;


-- ---------- Spam limit on public reports ----------
-- Anyone can file a report without signing in, so the database itself caps how many one connection
-- can send per hour (the form's own checks can be skipped by a script). Each report remembers a
-- one-way hash of where it came from, never the address itself. A second, overall cap stops a flood
-- from many addresses.
alter table public.reports add column if not exists submitter_hash text;

create or replace function public.limit_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  headers json;
  ip text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then headers := null;
  end;
  ip := coalesce(headers ->> 'cf-connecting-ip',
                 trim(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  new.submitter_hash := case when ip = '' then null else md5('phrag-reports:' || ip) end;  -- never trust a value sent by the client

  if new.submitter_hash is not null and
     (select count(*) from public.reports
      where submitter_hash = new.submitter_hash and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many reports from this connection. Please try again in an hour.';
  end if;
  if (select count(*) from public.reports where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many reports right now. Please try again in an hour.';
  end if;
  return new;
end $$;

drop trigger if exists reports_limit on public.reports;
create trigger reports_limit before insert on public.reports
  for each row execute function public.limit_reports();
