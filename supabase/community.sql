-- Neighborhood photo feed + comments. Run AFTER schema.sql, cms.sql and members.sql.
-- Safe to run more than once.
-- Supabase > SQL Editor > New query > paste > Run.

-- ---------- Tables ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  lat         double precision not null check (lat between 36.9 and 42.1),
  lng         double precision not null check (lng between -114.1 and -108.9),
  precise     boolean not null default false,   -- poster chose to show the exact spot publicly
  taken_on    date not null check (taken_on <= current_date),
  id_guess    text not null default 'unsure' check (id_guess in ('invasive','native','unsure')),
  caption     text check (char_length(caption) <= 500),
  image_path  text not null check (image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  status      text not null default 'visible' check (status in ('visible','hidden')),
  hidden_by   uuid references auth.users(id),
  check (image_path like user_id::text || '/%')   -- photos live in the poster's own folder
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  status      text not null default 'visible' check (status in ('visible','hidden')),
  hidden_by   uuid references auth.users(id)
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists posts_created_idx on public.posts (created_at desc);

-- ---------- Helper checks ----------
-- Experts and editors can hide posts and comments.
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_expert() or public.is_editor();
$$;
revoke execute on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- (The expert tag is worked out directly inside the two public views below. A helper function
-- would be refused for website visitors, because Postgres checks permission to run functions
-- inside a view against the visitor, not the view's owner.)

-- ---------- Spam limits ----------
create or replace function public.limit_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.posts
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You''ve posted a lot in the last hour. Please wait a while before posting again.';
  end if;
  return new;
end $$;
drop trigger if exists posts_limit on public.posts;
create trigger posts_limit before insert on public.posts
  for each row execute function public.limit_posts();

create or replace function public.limit_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You''ve commented a lot in the last hour. Please wait a while before commenting again.';
  end if;
  return new;
end $$;
drop trigger if exists comments_limit on public.comments;
create trigger comments_limit before insert on public.comments
  for each row execute function public.limit_comments();

-- ---------- Permissions ----------
alter table public.posts enable row level security;
alter table public.comments enable row level security;

revoke all on public.posts, public.comments from anon;
revoke update on public.posts, public.comments from authenticated;
grant select, insert, delete on public.posts, public.comments to authenticated;
-- Moderators may change only the visibility columns, never someone's words.
grant update (status, hidden_by) on public.posts, public.comments to authenticated;

drop policy if exists "signed-in users post" on public.posts;
create policy "signed-in users post" on public.posts
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'visible' and hidden_by is null);

-- Exact locations are visible only to the poster and moderators; everyone else uses the view.
drop policy if exists "own or moderator read" on public.posts;
create policy "own or moderator read" on public.posts
  for select to authenticated using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "own or moderator delete" on public.posts;
create policy "own or moderator delete" on public.posts
  for delete to authenticated using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "moderators hide" on public.posts;
create policy "moderators hide" on public.posts
  for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "signed-in users comment" on public.comments;
create policy "signed-in users comment" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'visible' and hidden_by is null);

drop policy if exists "own or moderator read" on public.comments;
create policy "own or moderator read" on public.comments
  for select to authenticated using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "own or moderator delete" on public.comments;
create policy "own or moderator delete" on public.comments
  for delete to authenticated using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "moderators hide" on public.comments;
create policy "moderators hide" on public.comments
  for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- ---------- What the public sees ----------
-- Locations are rounded to ~1 km unless the poster chose to show the exact spot.
-- user ids are never exposed; "is_mine" tells the signed-in viewer which items are theirs.
create or replace view public.public_posts as
  select p.id, p.created_at, p.author_name,
         case when p.precise then p.lat else round(p.lat::numeric, 2)::float8 end as lat,
         case when p.precise then p.lng else round(p.lng::numeric, 2)::float8 end as lng,
         p.precise, p.taken_on, p.id_guess, p.caption, p.image_path,
         (exists (select 1 from public.experts x where x.user_id = p.user_id)
          or exists (select 1 from public.member_emails m
                     join auth.users u on lower(u.email) = m.email
                     where u.id = p.user_id and m.role = 'expert')) as author_is_expert,
         (select count(*) from public.comments c
            where c.post_id = p.id and c.status = 'visible')::int as comment_count,
         coalesce(p.user_id = auth.uid(), false) as is_mine
  from public.posts p
  where p.status = 'visible';

create or replace view public.public_comments as
  select c.id, c.post_id, c.created_at, c.author_name, c.body,
         (exists (select 1 from public.experts x where x.user_id = c.user_id)
          or exists (select 1 from public.member_emails m
                     join auth.users u on lower(u.email) = m.email
                     where u.id = c.user_id and m.role = 'expert')) as author_is_expert,
         coalesce(c.user_id = auth.uid(), false) as is_mine
  from public.comments c
  join public.posts p on p.id = c.post_id and p.status = 'visible'
  where c.status = 'visible';

grant select on public.public_posts, public.public_comments to anon, authenticated;

-- Clean up the helper function from the first version of this script, if it's there.
-- (Safe now: the views above no longer use it.)
drop function if exists public.user_is_expert(uuid);

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-photos', 'community-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "members upload own community photos" on storage.objects;
create policy "members upload own community photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own or moderator delete community photos" on storage.objects;
create policy "own or moderator delete community photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));

-- ---------- "Report this" from visitors ----------
-- Signed-in people can flag a photo or comment. Only moderators (experts and editors) can read
-- the flags. Each person can flag an item once.
create table if not exists public.flags (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('post', 'comment')),
  item_id    uuid not null,
  reason     text not null check (char_length(btrim(reason)) between 1 and 300),
  unique (user_id, kind, item_id)
);
alter table public.flags enable row level security;

revoke all on public.flags from anon;
revoke update on public.flags from authenticated;
grant select, insert, delete on public.flags to authenticated;

drop policy if exists "signed-in users report" on public.flags;
create policy "signed-in users report" on public.flags
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "moderators read reports" on public.flags;
create policy "moderators read reports" on public.flags
  for select to authenticated using (public.is_moderator());

drop policy if exists "moderators clear reports" on public.flags;
create policy "moderators clear reports" on public.flags
  for delete to authenticated using (public.is_moderator());

create or replace function public.limit_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.flags
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You''ve sent a lot of reports in the last hour. Please wait a while.';
  end if;
  return new;
end $$;
drop trigger if exists flags_limit on public.flags;
create trigger flags_limit before insert on public.flags
  for each row execute function public.limit_flags();
