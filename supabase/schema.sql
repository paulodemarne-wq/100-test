-- Lockin database schema.
-- Run it once in Supabase: SQL Editor > New query > paste this file > Run.
-- It is safe to run again: every statement is idempotent.

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "users create their own profile" on public.profiles;
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ─── Friendships ─────────────────────────────────────────────────────────────
-- One row per pair: the requester asks, the addressee accepts.
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- Only one row per pair, whoever asked first.
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

-- Accepting may only change the status, never who the friendship is between.
revoke update on public.friendships from anon, authenticated;
grant update (status) on public.friendships to authenticated;

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests" on public.friendships
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');

drop policy if exists "accept friend requests" on public.friendships;
create policy "accept friend requests" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());

drop policy if exists "remove friendships" on public.friendships;
create policy "remove friendships" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- ─── Study sessions ──────────────────────────────────────────────────────────
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 30),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Updated every minute while the session runs, so friends can tell a live
  -- session from one whose app was killed.
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  duration_sec integer check (duration_sec between 0 and 43200),
  leaves integer not null default 0
);

create index if not exists study_sessions_user_started on public.study_sessions (user_id, started_at desc);

alter table public.study_sessions enable row level security;

drop policy if exists "see own and friends sessions" on public.study_sessions;
create policy "see own and friends sessions" on public.study_sessions
  for select to authenticated using (user_id = auth.uid() or public.is_friend(auth.uid(), user_id));

drop policy if exists "start own sessions" on public.study_sessions;
create policy "start own sessions" on public.study_sessions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own sessions" on public.study_sessions;
create policy "update own sessions" on public.study_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own sessions" on public.study_sessions;
create policy "delete own sessions" on public.study_sessions
  for delete to authenticated using (user_id = auth.uid());

-- ─── Nudges ("Viens bosser !") ───────────────────────────────────────────────
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

alter table public.nudges enable row level security;

revoke update on public.nudges from anon, authenticated;
grant update (seen_at) on public.nudges to authenticated;

drop policy if exists "see nudges sent or received" on public.nudges;
create policy "see nudges sent or received" on public.nudges
  for select to authenticated using (auth.uid() in (from_user, to_user));

drop policy if exists "nudge friends" on public.nudges;
create policy "nudge friends" on public.nudges
  for insert to authenticated with check (from_user = auth.uid() and public.is_friend(auth.uid(), to_user));

drop policy if exists "mark received nudges as seen" on public.nudges;
create policy "mark received nudges as seen" on public.nudges
  for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

-- ─── Realtime ────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['study_sessions', 'friendships', 'nudges'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── Profile photos ──────────────────────────────────────────────────────────
-- Public bucket; each user can only write inside a folder named after their id.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
