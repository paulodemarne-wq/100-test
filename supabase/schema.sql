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
  -- The host is checked directly: right after creating the event, the lookup inside
  -- is_event_member can't see the new row yet (which made creating an event fail).
  for select to authenticated using (host = auth.uid() or public.is_event_member(id, auth.uid()));

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

-- ═════════════════════════════════════════════════════════════════════════════
-- v3: pauses, session to-dos, reactions, lifetime hours
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.study_sessions
  add column if not exists paused_until timestamptz,
  add column if not exists paused_seconds integer not null default 0 check (paused_seconds between 0 and 43200),
  add column if not exists tasks jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_sessions_tasks_check') then
    alter table public.study_sessions
      add constraint study_sessions_tasks_check
      check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 20);
  end if;
end $$;

-- ─── Lifetime hours (for ranks), maintained by the database ─────────────────
alter table public.profiles add column if not exists total_seconds bigint not null default 0;

-- Profiles may only edit these columns themselves; total_seconds is computed.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, display_name, avatar_url) on public.profiles to authenticated;
grant update (username, display_name, avatar_url, weekly_goal_minutes, notify_friend_sessions)
  on public.profiles to authenticated;

create or replace function public.refresh_total_seconds()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set total_seconds = (
    select coalesce(sum(duration_sec), 0) from public.study_sessions
    where user_id = coalesce(new.user_id, old.user_id) and status = 'done'
  )
  where id = coalesce(new.user_id, old.user_id);
  return null;
end $$;

drop trigger if exists refresh_total_seconds on public.study_sessions;
create trigger refresh_total_seconds after insert or update of status, duration_sec or delete on public.study_sessions
  for each row execute function public.refresh_total_seconds();

-- Backfill (cheap, safe to rerun).
update public.profiles p
set total_seconds = coalesce((
  select sum(duration_sec) from public.study_sessions s where s.user_id = p.id and s.status = 'done'
), 0);

-- ─── Reactions on sessions (🔥 💪 💀 😴) ─────────────────────────────────────
create table if not exists public.session_reactions (
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '💪', '💀', '😴', '👑', '🫡')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.session_reactions enable row level security;

-- Visible / allowed when the session itself is visible to you (its select policy applies in the subquery).
drop policy if exists "see reactions on visible sessions" on public.session_reactions;
create policy "see reactions on visible sessions" on public.session_reactions
  for select to authenticated using (exists (select 1 from public.study_sessions s where s.id = session_id));

drop policy if exists "react to friends sessions" on public.session_reactions;
create policy "react to friends sessions" on public.session_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.study_sessions s where s.id = session_id and s.user_id <> auth.uid())
  );

drop policy if exists "change own reaction" on public.session_reactions;
create policy "change own reaction" on public.session_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "remove own reaction" on public.session_reactions;
create policy "remove own reaction" on public.session_reactions
  for delete to authenticated using (user_id = auth.uid());

revoke update on public.session_reactions from anon, authenticated;
grant update (emoji) on public.session_reactions to authenticated;

create or replace function public.push_on_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.study_sessions;
begin
  select * into s from public.study_sessions where id = new.session_id;
  perform public.send_push(array[s.user_id],
    public.display_name_of(new.user_id) || ' a réagi ' || new.emoji,
    case
      when s.status = 'abandoned' then 'à ton craquage 😅'
      when s.status = 'active' then 'à ton lock in en cours'
      else 'à ta session de ' || (coalesce(s.duration_sec, 0) / 60) || ' min'
    end,
    jsonb_build_object('type', 'reaction'));
  return new;
end $$;

drop trigger if exists push_on_reaction on public.session_reactions;
create trigger push_on_reaction after insert on public.session_reactions
  for each row execute function public.push_on_reaction();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_reactions'
  ) then
    alter publication supabase_realtime add table public.session_reactions;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- v4: pets, hours wallet, shop
-- ═════════════════════════════════════════════════════════════════════════════

-- Hours already spent in the shop. Balance = total_seconds - spent_seconds.
alter table public.profiles
  add column if not exists spent_seconds bigint not null default 0,
  add column if not exists active_pet_id uuid;

-- ─── Pets ────────────────────────────────────────────────────────────────────
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Null while still an egg; picked at random on hatching (0..99, see src/creatures/species.ts).
  species smallint check (species between 0 and 99),
  -- Seconds of lock in done while this pet was the active one.
  xp_seconds bigint not null default 0,
  equipped jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  hatched_at timestamptz
);

create index if not exists pets_user on public.pets (user_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_active_pet_fk') then
    alter table public.profiles
      add constraint profiles_active_pet_fk foreign key (active_pet_id) references public.pets (id) on delete set null;
  end if;
end $$;

alter table public.pets enable row level security;

-- Pets are read-only for clients: they change through the functions below.
drop policy if exists "see own and friends pets" on public.pets;
create policy "see own and friends pets" on public.pets
  for select to authenticated using (
    user_id = auth.uid() or public.is_friend(auth.uid(), user_id) or public.shares_group(auth.uid(), user_id)
  );

-- ─── Shop catalogue (prices must match src/creatures/species.ts) ─────────────
create table if not exists public.shop_items (
  id text primary key,
  kind text not null check (kind in ('accessory', 'egg')),
  slot text check (slot in ('head', 'eyes', 'neck', 'back')),
  rarity text not null,
  cost_seconds integer not null check (cost_seconds > 0)
);

-- v5: garden items (house, tree, deco, ground).
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('accessory', 'egg', 'garden', 'upgrade', 'special'));
alter table public.shop_items drop constraint if exists shop_items_slot_check;
alter table public.shop_items add constraint shop_items_slot_check
  check (slot in ('head', 'eyes', 'neck', 'back', 'house', 'tree', 'deco', 'ground', 'boat'));
-- v6: some island items are free (0 h) and owned by everyone.
alter table public.shop_items drop constraint if exists shop_items_cost_seconds_check;
alter table public.shop_items add constraint shop_items_cost_seconds_check check (cost_seconds >= 0);

insert into public.shop_items (id, kind, slot, rarity, cost_seconds) values
  ('egg', 'egg', null, 'rare', 100 * 3600),
  ('cap', 'accessory', 'head', 'commune', 10 * 3600),
  ('beanie', 'accessory', 'head', 'commune', 10 * 3600),
  ('flowers', 'accessory', 'head', 'rare', 30 * 3600),
  ('wizard', 'accessory', 'head', 'épique', 80 * 3600),
  ('halo', 'accessory', 'head', 'mythique', 200 * 3600),
  ('crown', 'accessory', 'head', 'légendaire', 400 * 3600),
  ('glasses', 'accessory', 'eyes', 'commune', 10 * 3600),
  ('shades', 'accessory', 'eyes', 'rare', 30 * 3600),
  ('monocle', 'accessory', 'eyes', 'épique', 80 * 3600),
  ('bowtie', 'accessory', 'neck', 'commune', 10 * 3600),
  ('scarf', 'accessory', 'neck', 'rare', 30 * 3600),
  ('medal', 'accessory', 'neck', 'épique', 80 * 3600),
  ('diamonds', 'accessory', 'neck', 'mythique', 200 * 3600),
  ('backpack', 'accessory', 'back', 'rare', 30 * 3600),
  ('cape', 'accessory', 'back', 'épique', 80 * 3600),
  ('angel', 'accessory', 'back', 'mythique', 200 * 3600),
  ('jetpack', 'accessory', 'back', 'légendaire', 400 * 3600),
  ('grass', 'garden', 'ground', 'commune', 0 * 3600),
  ('path', 'garden', 'ground', 'commune', 0 * 3600),
  ('cobble', 'garden', 'ground', 'commune', 10 * 3600),
  ('water', 'garden', 'ground', 'commune', 10 * 3600),
  ('meadow', 'garden', 'ground', 'rare', 30 * 3600),
  ('beach', 'garden', 'ground', 'rare', 30 * 3600),
  ('wood', 'garden', 'ground', 'rare', 30 * 3600),
  ('snow', 'garden', 'ground', 'épique', 80 * 3600),
  ('clouds', 'garden', 'ground', 'légendaire', 400 * 3600),
  ('fence', 'garden', 'deco', 'commune', 0 * 3600),
  ('rock', 'garden', 'deco', 'commune', 0 * 3600),
  ('pine', 'garden', 'tree', 'commune', 0 * 3600),
  ('tent', 'garden', 'house', 'commune', 10 * 3600),
  ('doghouse', 'garden', 'house', 'commune', 10 * 3600),
  ('cabin', 'garden', 'house', 'rare', 30 * 3600),
  ('cottage', 'garden', 'house', 'épique', 80 * 3600),
  ('mushroom', 'garden', 'house', 'mythique', 200 * 3600),
  ('castle', 'garden', 'house', 'légendaire', 400 * 3600),
  ('bush', 'garden', 'tree', 'commune', 10 * 3600),
  ('apple', 'garden', 'tree', 'rare', 30 * 3600),
  ('palm', 'garden', 'tree', 'rare', 30 * 3600),
  ('sakura', 'garden', 'tree', 'épique', 80 * 3600),
  ('crystal', 'garden', 'tree', 'mythique', 200 * 3600),
  ('flowerbed', 'garden', 'deco', 'commune', 10 * 3600),
  ('hedge', 'garden', 'deco', 'commune', 10 * 3600),
  ('bench', 'garden', 'deco', 'commune', 10 * 3600),
  ('lamp', 'garden', 'deco', 'commune', 10 * 3600),
  ('campfire', 'garden', 'deco', 'commune', 10 * 3600),
  ('pumpkin', 'garden', 'deco', 'commune', 10 * 3600),
  ('table', 'garden', 'deco', 'rare', 30 * 3600),
  ('pond', 'garden', 'deco', 'rare', 30 * 3600),
  ('well', 'garden', 'deco', 'rare', 30 * 3600),
  ('fountain', 'garden', 'deco', 'épique', 80 * 3600),
  ('statue', 'garden', 'deco', 'mythique', 200 * 3600),
  ('rainbow', 'garden', 'deco', 'légendaire', 400 * 3600),
  ('party', 'accessory', 'head', 'commune', 10 * 3600),
  ('headphones', 'accessory', 'head', 'rare', 30 * 3600),
  ('pirate', 'accessory', 'head', 'épique', 80 * 3600),
  ('viking', 'accessory', 'head', 'mythique', 200 * 3600),
  ('hearts', 'accessory', 'eyes', 'rare', 30 * 3600),
  ('patch', 'accessory', 'eyes', 'épique', 80 * 3600),
  ('tie', 'accessory', 'neck', 'commune', 10 * 3600),
  ('bandana', 'accessory', 'neck', 'rare', 30 * 3600),
  ('surfboard', 'accessory', 'back', 'rare', 30 * 3600),
  ('balloons', 'accessory', 'back', 'épique', 80 * 3600),
  ('igloo', 'garden', 'house', 'épique', 80 * 3600),
  ('treehouse', 'garden', 'house', 'mythique', 200 * 3600),
  ('windmill', 'garden', 'house', 'mythique', 200 * 3600),
  ('cactus', 'garden', 'tree', 'commune', 10 * 3600),
  ('sunflower', 'garden', 'tree', 'commune', 10 * 3600),
  ('autumn', 'garden', 'tree', 'rare', 30 * 3600),
  ('bamboo', 'garden', 'tree', 'rare', 30 * 3600),
  ('mailbox', 'garden', 'deco', 'commune', 10 * 3600),
  ('signpost', 'garden', 'deco', 'commune', 10 * 3600),
  ('snowman', 'garden', 'deco', 'commune', 10 * 3600),
  ('umbrella', 'garden', 'deco', 'commune', 10 * 3600),
  ('deckchair', 'garden', 'deco', 'rare', 30 * 3600),
  ('swing', 'garden', 'deco', 'rare', 30 * 3600),
  ('slide', 'garden', 'deco', 'rare', 30 * 3600),
  ('hammock', 'garden', 'deco', 'rare', 30 * 3600),
  ('trampoline', 'garden', 'deco', 'rare', 30 * 3600),
  ('pier', 'garden', 'deco', 'rare', 30 * 3600),
  ('treasure', 'garden', 'deco', 'épique', 80 * 3600),
  ('telescope', 'garden', 'deco', 'épique', 80 * 3600),
  ('lighthouse', 'garden', 'deco', 'mythique', 200 * 3600),
  ('rowboat', 'garden', 'boat', 'commune', 10 * 3600),
  ('duckboat', 'garden', 'boat', 'rare', 30 * 3600),
  ('sailboat', 'garden', 'boat', 'épique', 80 * 3600),
  ('yacht', 'garden', 'boat', 'mythique', 200 * 3600),
  ('pirateship', 'garden', 'boat', 'légendaire', 400 * 3600),
  ('sea', 'upgrade', null, 'commune', 20 * 3600),
  ('size20', 'upgrade', null, 'rare', 50 * 3600),
  ('size24', 'upgrade', null, 'épique', 120 * 3600),
  ('size28', 'upgrade', null, 'mythique', 250 * 3600),
  ('size32', 'upgrade', null, 'légendaire', 500 * 3600),
  -- Not sold: the shop building on featured islands (given by admin.sql).
  ('boutique', 'special', 'house', 'légendaire', 9999 * 3600)
on conflict (id) do update set kind = excluded.kind, slot = excluded.slot, rarity = excluded.rarity, cost_seconds = excluded.cost_seconds;

alter table public.shop_items enable row level security;
drop policy if exists "shop is public" on public.shop_items;
create policy "shop is public" on public.shop_items for select to authenticated using (true);

create table if not exists public.inventory (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
-- v9: island objects are counted (one purchase = one object to place).
alter table public.inventory add column if not exists quantity int not null default 1 check (quantity >= 1);

alter table public.inventory enable row level security;
drop policy if exists "see own inventory" on public.inventory;
create policy "see own inventory" on public.inventory for select to authenticated using (user_id = auth.uid());

-- Clients never write these directly.
revoke insert, update, delete on public.pets, public.inventory, public.shop_items from anon, authenticated;

-- ─── Hatching and XP ─────────────────────────────────────────────────────────
create or replace function public.hatch_if_ready(pet uuid)
returns void language sql security definer set search_path = public as $$
  update public.pets
  set species = floor(random() * 100)::smallint, hatched_at = now()
  where id = pet and species is null and xp_seconds >= 19800; -- level 2 = 5 h 30
$$;

-- Every finished session feeds the active pet.
create or replace function public.feed_active_pet()
returns trigger language plpgsql security definer set search_path = public as $$
declare pet uuid;
begin
  if new.status = 'done' and old.status is distinct from 'done' and coalesce(new.duration_sec, 0) > 0 then
    select active_pet_id into pet from public.profiles where id = new.user_id;
    if pet is not null then
      update public.pets set xp_seconds = xp_seconds + new.duration_sec where id = pet;
      perform public.hatch_if_ready(pet);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists feed_active_pet on public.study_sessions;
create trigger feed_active_pet after update of status on public.study_sessions
  for each row execute function public.feed_active_pet();

-- Everyone starts with an egg.
create or replace function public.give_first_egg()
returns trigger language plpgsql security definer set search_path = public as $$
declare pet uuid;
begin
  insert into public.pets (user_id) values (new.id) returning id into pet;
  update public.profiles set active_pet_id = pet where id = new.id;
  return new;
end $$;

drop trigger if exists give_first_egg on public.profiles;
create trigger give_first_egg after insert on public.profiles
  for each row execute function public.give_first_egg();

-- Existing players get a pet that already has their past hours.
do $$
declare p record; pet uuid;
begin
  for p in select id, total_seconds from public.profiles where not exists (select 1 from public.pets where user_id = profiles.id) loop
    insert into public.pets (user_id, xp_seconds) values (p.id, p.total_seconds) returning id into pet;
    update public.profiles set active_pet_id = pet where id = p.id;
    perform public.hatch_if_ready(pet);
  end loop;
end $$;

-- ─── Shop and pet actions (the only way to change them) ─────────────────────
-- Internal: pays `price` seconds for `item`. Only buy_item and buy_deal call it (never clients directly).
create or replace function public.purchase(item text, price int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  it public.shop_items;
  new_pet uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into it from public.shop_items where id = item;
  if it.id is null then raise exception 'Objet inconnu'; end if;
  if it.cost_seconds = 0 then raise exception 'Déjà acheté' using errcode = 'P0001'; end if;
  if it.kind = 'special' then raise exception 'Pas à vendre' using errcode = 'P0001'; end if;
  -- Lock the profile row so two purchases can't spend the same hours.
  select * into me from public.profiles where id = auth.uid() for update;
  -- Featured accounts (the app's creator) have unlimited hours.
  if not me.featured and me.total_seconds - me.spent_seconds < price then
    raise exception 'Pas assez d''heures' using errcode = 'P0001';
  end if;
  -- A bigger island needs the size just below it first.
  if it.id in ('size24', 'size28', 'size32') and not exists (
    select 1 from public.inventory
    where user_id = me.id and item_id = 'size' || (substring(it.id from 5)::int - 4)::text
  ) then
    raise exception 'Agrandis d''abord à la taille d''avant' using errcode = 'P0001';
  end if;
  if it.kind = 'garden' and it.slot <> 'ground' then
    -- Island objects are bought one by one: each purchase is one more in stock.
    insert into public.inventory (user_id, item_id, quantity) values (me.id, it.id, 1)
    on conflict (user_id, item_id) do update set quantity = public.inventory.quantity + 1;
  elsif it.kind in ('accessory', 'garden', 'upgrade') then
    if exists (select 1 from public.inventory where user_id = me.id and item_id = it.id) then
      raise exception 'Déjà acheté' using errcode = 'P0001';
    end if;
    insert into public.inventory (user_id, item_id) values (me.id, it.id);
  else
    insert into public.pets (user_id) values (me.id) returning id into new_pet;
  end if;
  if not me.featured then
    update public.profiles set spent_seconds = spent_seconds + price where id = me.id;
  end if;
  return new_pet;
end $$;

create or replace function public.buy_item(item text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.purchase(item, (select cost_seconds from public.shop_items where id = item));
end $$;

create or replace function public.set_active_pet(pet uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.pets where id = pet and user_id = auth.uid()) then
    raise exception 'Animal introuvable';
  end if;
  update public.profiles set active_pet_id = pet where id = auth.uid();
end $$;

create or replace function public.equip_item(pet uuid, slot text, item text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if slot not in ('head', 'eyes', 'neck', 'back') then raise exception 'Emplacement inconnu'; end if;
  if not exists (select 1 from public.pets where id = pet and user_id = auth.uid()) then
    raise exception 'Animal introuvable';
  end if;
  if item is null then
    update public.pets set equipped = equipped - slot where id = pet;
    return;
  end if;
  if not exists (
    select 1 from public.inventory i join public.shop_items s on s.id = i.item_id
    where i.user_id = auth.uid() and i.item_id = item and s.slot = equip_item.slot
  ) then
    raise exception 'Accessoire non possédé';
  end if;
  update public.pets set equipped = equipped || jsonb_build_object(slot, item) where id = pet;
end $$;

-- v5: the garden behind the pet. Everyone signed in can read it (friends visit it), only set_garden writes it.
alter table public.profiles add column if not exists garden jsonb not null default '{}'::jsonb;

create or replace function public.set_garden(slot text, item text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if slot not in ('house', 'tree', 'deco', 'ground') then raise exception 'Emplacement inconnu'; end if;
  if item is null then
    update public.profiles set garden = garden - slot where id = auth.uid();
    return;
  end if;
  if not exists (
    select 1 from public.inventory i join public.shop_items s on s.id = i.item_id
    where i.user_id = auth.uid() and i.item_id = item and s.kind = 'garden' and s.slot = set_garden.slot
  ) then
    raise exception 'Objet non possédé';
  end if;
  update public.profiles set garden = garden || jsonb_build_object(slot, item) where id = auth.uid();
end $$;

-- v6: the island (16×16 tiles + placed objects). Friends walk on it; only save_world writes it.
alter table public.profiles add column if not exists world jsonb;

create or replace function public.owns_item(u uuid, item text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_items where id = item and kind = 'garden' and cost_seconds = 0)
      or exists (select 1 from public.inventory where user_id = u and item_id = item);
$$;

create or replace function public.save_world(world jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  size int;
  sea boolean := coalesce((world->>'sea')::boolean, false);
  tiles text := world->>'tiles';
  objects jsonb := world->'objects';
  tile_items constant jsonb := '{"g":"grass","p":"path","o":"cobble","w":"water","f":"meadow","s":"beach","d":"wood","n":"snow","c":"clouds"}';
  ch text;
  o jsonb;
  x int;
  z int;
  boat boolean;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  size := coalesce((world->>'size')::int, 16);
  if size not in (16, 20, 24, 28, 32) then raise exception 'Île invalide'; end if;
  if size > 16 and not exists (select 1 from public.inventory where user_id = auth.uid() and item_id = 'size' || size) then
    raise exception 'Agrandissement non acheté';
  end if;
  if sea and not exists (select 1 from public.inventory where user_id = auth.uid() and item_id = 'sea') then
    raise exception 'Mer non achetée';
  end if;
  if tiles is null or length(tiles) <> size * size or tiles !~ '^[gpowfsdnc]+$' then raise exception 'Île invalide'; end if;
  if objects is null or jsonb_typeof(objects) <> 'array' or jsonb_array_length(objects) > 200 then
    raise exception 'Trop d''objets (200 max)';
  end if;
  for ch in select distinct c from regexp_split_to_table(tiles, '') as c loop
    if not public.owns_item(auth.uid(), tile_items->>ch) then raise exception 'Sol non possédé'; end if;
  end loop;
  for o in select * from jsonb_array_elements(objects) loop
    if jsonb_typeof(o) <> 'array' or jsonb_array_length(o) <> 4
      or jsonb_typeof(o->1) <> 'number' or jsonb_typeof(o->2) <> 'number' or jsonb_typeof(o->3) <> 'number'
      or (o->>1)::numeric <> floor((o->>1)::numeric) or (o->>2)::numeric <> floor((o->>2)::numeric)
      or (o->>3)::numeric not in (0, 1, 2, 3) then
      raise exception 'Objet mal placé';
    end if;
    x := (o->>1)::numeric::int;
    z := (o->>2)::numeric::int;
    if not exists (select 1 from public.shop_items where id = o->>0 and kind in ('garden', 'special') and slot <> 'ground')
      or not public.owns_item(auth.uid(), o->>0) then
      raise exception 'Objet non possédé';
    end if;
    boat := exists (select 1 from public.shop_items where id = o->>0 and slot = 'boat');
    -- No more copies of a paid object than bought.
    if exists (select 1 from public.shop_items where id = o->>0 and cost_seconds > 0) and
       (select count(*) from jsonb_array_elements(objects) e where e->>0 = o->>0) >
       coalesce((select quantity from public.inventory where user_id = auth.uid() and item_id = o->>0), 0) then
      raise exception 'Tu n''as pas assez de % : achète-en un de plus', o->>0 using errcode = 'P0001';
    end if;
    if x >= 0 and z >= 0 and x < size and z < size then
      -- On the island: boats only on water tiles.
      if boat and substr(tiles, z * size + x + 1, 1) <> 'w' then raise exception 'Un bateau doit être sur l''eau'; end if;
    elsif not (boat and sea and x >= -4 and z >= -4 and x < size + 4 and z < size + 4) then
      raise exception 'Objet mal placé';
    end if;
  end loop;
  update public.profiles
  set world = jsonb_build_object('v', 2, 'size', size, 'sea', sea, 'tiles', tiles, 'objects', objects)
  where id = auth.uid();
end $$;

revoke execute on function public.buy_item(text), public.set_active_pet(uuid), public.equip_item(uuid, text, text),
  public.set_garden(text, text), public.save_world(jsonb), public.owns_item(uuid, text), public.hatch_if_ready(uuid)
  from public, anon;
revoke execute on function public.purchase(text, int) from public, anon, authenticated;
grant execute on function public.buy_item(text), public.set_active_pet(uuid), public.equip_item(uuid, text, text),
  public.set_garden(text, text), public.save_world(jsonb) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['pets', 'inventory'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- v8: featured accounts (the app's creator): their pet walks on everyone's island
-- and their island has a shop with deals. Only set from the SQL Editor (see admin.sql).
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists featured boolean not null default false;

-- Everyone can see the pets of featured accounts.
drop policy if exists "see featured pets" on public.pets;
create policy "see featured pets" on public.pets
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = pets.user_id and p.featured)
  );

-- Deals sold on a featured island: percent off (100 = offered). Read-only for players.
create table if not exists public.deals (
  item_id text primary key references public.shop_items (id),
  percent int not null check (percent between 1 and 100),
  label text
);
alter table public.deals enable row level security;
drop policy if exists "deals readable" on public.deals;
create policy "deals readable" on public.deals for select to authenticated using (true);
revoke insert, update, delete on public.deals from anon, authenticated;

-- The featured shop changes every day at midnight (Paris time): 6 deals (-30 % to -75 %) and 1 offered item.
-- Computed from the date, so everyone sees the same shop and nobody can pick their own prices.
create or replace function public.todays_deals()
returns table (item_id text, percent int)
language sql stable security definer set search_path = public as $$
  with day as (select ((now() at time zone 'Europe/Paris')::date)::text as d),
  pool as (
    select s.id, s.kind, s.cost_seconds, md5(day.d || s.id) as h
    from public.shop_items s, day
    where s.cost_seconds > 0 and s.kind in ('accessory', 'garden', 'egg', 'upgrade')
      and s.id not in ('size24', 'size28', 'size32')
  ),
  gift as (
    select p.id from pool p, day
    where p.kind in ('accessory', 'garden') and p.cost_seconds <= 80 * 3600
    order by md5(day.d || 'gift' || p.id) limit 1
  ),
  picks as (
    select p.id, p.h from pool p where p.id not in (select id from gift) order by p.h limit 6
  )
  select id, 100 from gift
  union all
  select id, 30 + (('x' || substr(h, 1, 4))::bit(16)::int % 10) * 5 from picks;
$$;

create or replace function public.buy_deal(item text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pct int;
  cost int;
begin
  select d.percent into pct from public.todays_deals() d where d.item_id = item;
  if pct is null then raise exception 'Cette promo n''est plus dans la boutique du jour' using errcode = 'P0001'; end if;
  select cost_seconds into cost from public.shop_items where id = item;
  return public.purchase(item, (cost * (100 - pct)) / 100);
end $$;

create table if not exists public.claimed_gifts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.claimed_gifts enable row level security;
drop policy if exists "see own gifts" on public.claimed_gifts;
create policy "see own gifts" on public.claimed_gifts for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.claimed_gifts from anon, authenticated;

revoke execute on function public.buy_deal(text), public.todays_deals() from public, anon;
grant execute on function public.buy_deal(text), public.todays_deals() to authenticated;

-- v9 migration: before, an object was bought once and placed many times. Keep what players already placed.
update public.inventory i
set quantity = greatest(i.quantity, c.n)
from (
  select p.id as user_id, o->>0 as item_id, count(*)::int as n
  from public.profiles p, jsonb_array_elements(coalesce(p.world->'objects', '[]'::jsonb)) o
  group by 1, 2
) c
where i.user_id = c.user_id and i.item_id = c.item_id;

-- The daily gift can be an island object (which can be bought again): one gift per player per day.
alter table public.claimed_gifts add column if not exists day date not null default ((now() at time zone 'Europe/Paris')::date);
alter table public.claimed_gifts drop constraint if exists claimed_gifts_pkey;
alter table public.claimed_gifts add primary key (user_id, item_id, day);

create or replace function public.buy_deal(item text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pct int;
  cost int;
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  select d.percent into pct from public.todays_deals() d where d.item_id = item;
  if pct is null then raise exception 'Cette promo n''est plus dans la boutique du jour' using errcode = 'P0001'; end if;
  if pct = 100 then
    if exists (select 1 from public.claimed_gifts where user_id = auth.uid() and item_id = item and day = today) then
      raise exception 'Déjà pris aujourd''hui' using errcode = 'P0001';
    end if;
    insert into public.claimed_gifts (user_id, item_id, day) values (auth.uid(), item, today);
  end if;
  select cost_seconds into cost from public.shop_items where id = item;
  return public.purchase(item, (cost * (100 - pct)) / 100);
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- v12: to-dos with a time budget and a due date. A lock-in can work on one:
-- its focus time is added to the to-do (worked_seconds) when the session ends.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  hours numeric(5, 1) not null check (hours > 0 and hours <= 1000),
  due_date date not null,
  worked_seconds integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_due on public.todos (user_id, due_date);

alter table public.todos enable row level security;
drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Worked time is only added by the database (from finished sessions).
revoke insert, update on public.todos from anon, authenticated;
grant insert (title, hours, due_date) on public.todos to authenticated;
grant update (title, hours, due_date, done_at) on public.todos to authenticated;

alter table public.study_sessions add column if not exists todo_id uuid references public.todos (id) on delete set null;

-- A session can only point at one of its owner's to-dos.
create or replace function public.check_session_todo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.todo_id is not null and not exists (
    select 1 from public.todos where id = new.todo_id and user_id = new.user_id
  ) then
    new.todo_id := null;
  end if;
  return new;
end $$;
drop trigger if exists check_session_todo on public.study_sessions;
create trigger check_session_todo before insert or update of todo_id on public.study_sessions
  for each row execute function public.check_session_todo();

-- A finished session adds its focus time to its to-do.
create or replace function public.feed_todo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.todo_id is not null
     and coalesce(new.duration_sec, 0) > 0 then
    update public.todos set worked_seconds = worked_seconds + new.duration_sec
    where id = new.todo_id and user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists feed_todo on public.study_sessions;
create trigger feed_todo after update of status on public.study_sessions
  for each row execute function public.feed_todo();
