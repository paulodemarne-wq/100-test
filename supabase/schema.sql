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

alter table public.profiles
  add column if not exists weekly_goal_minutes integer not null default 600
    check (weekly_goal_minutes between 0 and 10080),
  add column if not exists notify_friend_sessions boolean not null default true;

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

-- The select, insert and update policies are defined further down, once group lock-ins exist.

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

-- ═════════════════════════════════════════════════════════════════════════════
-- v2: exams, study groups, group lock-ins, push notifications
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Exams ("mode partiels"), private to their owner ─────────────────────────
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  exam_date date not null,
  goal_minutes integer not null default 1200 check (goal_minutes between 0 and 60000),
  created_at timestamptz not null default now()
);

alter table public.exams enable row level security;

drop policy if exists "own exams" on public.exams;
create policy "own exams" on public.exams
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Study groups (a class, a promo…) joined with an invite code ─────────────
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create or replace function public.is_group_member(g uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = u);
$$;

create or replace function public.shares_group(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members ma
    join public.group_members mb on mb.group_id = ma.group_id
    where ma.user_id = a and mb.user_id = b
  );
$$;

alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "members see their groups" on public.study_groups;
create policy "members see their groups" on public.study_groups
  for select to authenticated using (public.is_group_member(id, auth.uid()));

drop policy if exists "create groups" on public.study_groups;
create policy "create groups" on public.study_groups
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "members see each other" on public.group_members;
create policy "members see each other" on public.group_members
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "leave groups" on public.group_members;
create policy "leave groups" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- The creator joins automatically.
create or replace function public.add_group_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_group_created on public.study_groups;
create trigger on_group_created after insert on public.study_groups
  for each row execute function public.add_group_creator();

-- Joining goes through this function so a code is required.
create or replace function public.join_group(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select id into g from public.study_groups where code = upper(trim(invite_code));
  if g is null then
    raise exception 'Code invalide' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;

revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- ─── Group lock-ins ("On lock in à 20 h ?") ──────────────────────────────────
create table if not exists public.lockin_events (
  id uuid primary key default gen_random_uuid(),
  host uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_members (
  event_id uuid not null references public.lockin_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'going', 'declined')),
  primary key (event_id, user_id)
);

alter table public.study_sessions
  add column if not exists event_id uuid references public.lockin_events (id) on delete set null;

create or replace function public.is_event_member(e uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_members where event_id = e and user_id = u)
      or exists (select 1 from public.lockin_events where id = e and host = u);
$$;

create or replace function public.event_host(e uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select host from public.lockin_events where id = e;
$$;

alter table public.lockin_events enable row level security;
alter table public.event_members enable row level security;

drop policy if exists "see own events" on public.lockin_events;
create policy "see own events" on public.lockin_events
  for select to authenticated using (public.is_event_member(id, auth.uid()));

drop policy if exists "host events" on public.lockin_events;
create policy "host events" on public.lockin_events
  for insert to authenticated with check (host = auth.uid());

drop policy if exists "cancel own events" on public.lockin_events;
create policy "cancel own events" on public.lockin_events
  for delete to authenticated using (host = auth.uid());

drop policy if exists "see event members" on public.event_members;
create policy "see event members" on public.event_members
  for select to authenticated using (public.is_event_member(event_id, auth.uid()));

-- The host adds themselves and invites friends.
drop policy if exists "host invites friends" on public.event_members;
create policy "host invites friends" on public.event_members
  for insert to authenticated with check (
    public.event_host(event_id) = auth.uid()
    and (user_id = auth.uid() or public.is_friend(auth.uid(), user_id))
  );

drop policy if exists "answer invitations" on public.event_members;
create policy "answer invitations" on public.event_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.event_members from anon, authenticated;
grant update (status) on public.event_members to authenticated;

-- ─── Who can see whose sessions ──────────────────────────────────────────────
-- Yourself, your friends, people in your groups, and people in the same group lock-in.
drop policy if exists "see own and friends sessions" on public.study_sessions;
create policy "see own and friends sessions" on public.study_sessions
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_friend(auth.uid(), user_id)
    or public.shares_group(auth.uid(), user_id)
    or (event_id is not null and public.is_event_member(event_id, auth.uid()))
  );

-- A session can only be attached to a group lock-in you are part of.
drop policy if exists "start own sessions" on public.study_sessions;
create policy "start own sessions" on public.study_sessions
  for insert to authenticated with check (
    user_id = auth.uid() and (event_id is null or public.is_event_member(event_id, auth.uid()))
  );

drop policy if exists "update own sessions" on public.study_sessions;
create policy "update own sessions" on public.study_sessions
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and (event_id is null or public.is_event_member(event_id, auth.uid()))
  );

-- ─── Push notifications (Expo push service, called from the database) ───────
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "see own push tokens" on public.push_tokens;
create policy "see own push tokens" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "remove own push tokens" on public.push_tokens;
create policy "remove own push tokens" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- A device token moves to whoever is signed in on that phone.
create or replace function public.register_push_token(new_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.push_tokens (token, user_id) values (new_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
end $$;

revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;

create extension if not exists pg_net with schema extensions;

create or replace function public.send_push(recipients uuid[], title text, body text, data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare messages jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', title, 'body', body, 'sound', 'default', 'data', data))
    into messages
    from public.push_tokens where user_id = any(recipients);
  if messages is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;

revoke execute on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;

create or replace function public.display_name_of(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select display_name from public.profiles where id = u;
$$;

-- Nudge received.
create or replace function public.push_on_nudge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_push(array[new.to_user], public.display_name_of(new.from_user) || ' t''attend 📣',
    'Lock in. Maintenant.', jsonb_build_object('type', 'nudge'));
  return new;
end $$;

drop trigger if exists push_on_nudge on public.nudges;
create trigger push_on_nudge after insert on public.nudges
  for each row execute function public.push_on_nudge();

-- Friend requests sent and accepted.
create or replace function public.push_on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.send_push(array[new.addressee], 'Nouvelle demande d''ami',
      public.display_name_of(new.requester) || ' veut lock in avec toi', jsonb_build_object('type', 'friend_request'));
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform public.send_push(array[new.requester], 'Demande acceptée ✓',
      public.display_name_of(new.addressee) || ' et toi êtes maintenant amis', jsonb_build_object('type', 'friend_accepted'));
  end if;
  return new;
end $$;

drop trigger if exists push_on_friendship on public.friendships;
create trigger push_on_friendship after insert or update on public.friendships
  for each row execute function public.push_on_friendship();

-- A friend starts a session (at most one notification per person every 30 min).
create or replace function public.push_on_session_start()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipients uuid[];
begin
  if exists (
    select 1 from public.study_sessions
    where user_id = new.user_id and id <> new.id and started_at > now() - interval '30 minutes'
  ) then
    return new;
  end if;
  select array_agg(p.id) into recipients
  from public.profiles p
  where p.notify_friend_sessions and public.is_friend(p.id, new.user_id);
  if recipients is not null then
    perform public.send_push(recipients, public.display_name_of(new.user_id) || ' vient de lock in 🔒',
      case when new.subject = 'Focus' then 'Et toi ?' else new.subject || ' · Et toi ?' end,
      jsonb_build_object('type', 'friend_session'));
  end if;
  return new;
end $$;

drop trigger if exists push_on_session_start on public.study_sessions;
create trigger push_on_session_start after insert on public.study_sessions
  for each row execute function public.push_on_session_start();

-- Invited to a group lock-in.
create or replace function public.push_on_event_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.lockin_events;
begin
  select * into e from public.lockin_events where id = new.event_id;
  if new.user_id <> e.host then
    perform public.send_push(array[new.user_id],
      public.display_name_of(e.host) || ' : on lock in à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || ' ?',
      e.title, jsonb_build_object('type', 'event_invite', 'event_id', e.id));
  end if;
  return new;
end $$;

drop trigger if exists push_on_event_invite on public.event_members;
create trigger push_on_event_invite after insert on public.event_members
  for each row execute function public.push_on_event_invite();

-- ─── Realtime for the new tables ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['group_members', 'lockin_events', 'event_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
