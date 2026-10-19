-- Mise à jour : règles de l'App Store (supprimer son compte, bloquer, signaler, filtre de mots).
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.

-- Renommage : la table des événements de groupe s'appelait lockin_events, elle s'appelle maintenant vainc_events.
do $$ begin
  if to_regclass('public.lockin_events') is not null and to_regclass('public.vainc_events') is null then
    alter table public.lockin_events rename to vainc_events;
  end if;
end $$;

-- Les fonctions qui lisent cette table sont recréées avec le nouveau nom.
create or replace function public.is_event_member(e uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_members where event_id = e and user_id = u)
      or exists (select 1 from public.vainc_events where id = e and host = u);
$$;

create or replace function public.event_host(e uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select host from public.vainc_events where id = e;
$$;

-- Invited to a group lock-in.
create or replace function public.push_on_event_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.vainc_events;
begin
  select * into e from public.vainc_events where id = new.event_id;
  if new.user_id <> e.host then
    perform public.send_push(array[new.user_id],
      public.display_name_of(e.host) || ' : on lock in à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || ' ?',
      e.title, jsonb_build_object('type', 'event_invite', 'event_id', e.id));
  end if;
  return new;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- v23: règles de l'App Store (modération et compte).
--   • supprimer son compte depuis l'app (delete_my_account)
--   • bloquer / débloquer quelqu'un (block_user, unblock_user)
--   • signaler quelqu'un ou un message (report_user)
--   • filtre de mots interdits sur les messages, pseudos, noms et libellés vus par les autres
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "see own blocks" on public.blocks;
create policy "see own blocks" on public.blocks for select to authenticated using (blocker = auth.uid());
revoke insert, update, delete on public.blocks from anon, authenticated;

-- Reports are only read by the app's team (Supabase dashboard); nobody can read them from the app.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references public.profiles (id) on delete set null,
  reported uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 60),
  context text check (context is null or char_length(context) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Block: ends the friendship both ways. A blocked person cannot send you a friend request or a message.
create or replace function public.block_user(u uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if u is null or u = auth.uid() then raise exception 'Personne à bloquer' using errcode = 'P0001'; end if;
  insert into public.blocks (blocker, blocked) values (auth.uid(), u) on conflict do nothing;
  delete from public.friendships where (requester = auth.uid() and addressee = u) or (requester = u and addressee = auth.uid());
end $$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(u uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.blocks where blocker = auth.uid() and blocked = u;
$$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.report_user(u uuid, reason text, context text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if u is null or u = auth.uid() then raise exception 'Personne à signaler' using errcode = 'P0001'; end if;
  insert into public.reports (reporter, reported, reason, context)
  values (auth.uid(), u, left(coalesce(nullif(trim(reason), ''), 'Autre'), 60), left(context, 1000));
end $$;
revoke execute on function public.report_user(uuid, text, text) from public, anon;
grant execute on function public.report_user(uuid, text, text) to authenticated;

-- Delete my account: everything of mine goes (profile, sessions, pets, messages, friendships… cascade from the profile).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté'; end if;
  -- The profile photo files.
  begin
    delete from storage.objects where bucket_id = 'avatars' and (storage.foldername(name))[1] = me::text;
  exception when others then null;
  end;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- A friend request or a message never goes through when one of the two blocked the other.
drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests" on public.friendships
  for insert to authenticated with check (
    requester = auth.uid() and status = 'pending' and not public.is_blocked_between(requester, addressee)
  );
drop policy if exists "send messages to friends" on public.messages;
create policy "send messages to friends" on public.messages
  for insert to authenticated with check (
    sender = auth.uid() and recipient <> auth.uid() and public.is_friend(auth.uid(), recipient)
    and not public.is_blocked_between(sender, recipient)
  );

-- Word filter: no insults or slurs in what other people see (messages, names, labels).
create or replace function public.is_clean_text(t text)
returns boolean language sql immutable as $$
  select t is null or lower(translate(t, 'àâäáãçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ', 'aaaaaceeeeiiiinooooouuuuyyaaaaaceeeeiiiinooooouuuuy'))
    !~ '(^|[^a-z])(nazi|nazis|hitler|salope|salopes|salopard|connard|connards|connasse|connasses|encule|encules|enculer|enculee|pute|putes|fdp|ntm|pedophile|pedophiles|pedo|bougnoul|bougnoule|negre|negres|negresse|nigger|niggers|nigga|niggas|faggot|faggots|tapette|tapettes|kys)($|[^a-z])'
$$;

create or replace function public.check_clean_text()
returns trigger language plpgsql as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if not public.is_clean_text(to_jsonb(new) ->> col) then
      raise exception 'Ce texte contient un mot interdit. Choisis autre chose.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists clean_messages on public.messages;
create trigger clean_messages before insert on public.messages for each row execute function public.check_clean_text('body');
drop trigger if exists clean_profiles on public.profiles;
create trigger clean_profiles before insert or update of username, display_name on public.profiles for each row execute function public.check_clean_text('username', 'display_name');
drop trigger if exists clean_pets on public.pets;
create trigger clean_pets before insert or update of nickname on public.pets for each row execute function public.check_clean_text('nickname');
drop trigger if exists clean_sessions on public.study_sessions;
create trigger clean_sessions before insert or update of subject on public.study_sessions for each row execute function public.check_clean_text('subject');
drop trigger if exists clean_events on public.vainc_events;
create trigger clean_events before insert or update of title on public.vainc_events for each row execute function public.check_clean_text('title');
drop trigger if exists clean_groups on public.study_groups;
create trigger clean_groups before insert or update of name on public.study_groups for each row execute function public.check_clean_text('name');

notify pgrst, 'reload schema';
