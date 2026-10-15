# Builds supabase/mise-a-jour-tout.sql: the group lock-in fix + everything from v12 (to-dos) on, from schema.sql.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
s = open('supabase/schema.sql').read()
start = s.rfind('\n-- ═', 0, s.index('-- v12: to-dos')) + 1
fix = '''-- Renommage : la table des événements de groupe s'appelait lockin_events, elle s'appelle maintenant vainc_events.
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

drop policy if exists "see own events" on public.vainc_events;
create policy "see own events" on public.vainc_events
  for select to authenticated using (host = auth.uid() or public.is_event_member(id, auth.uid()));

'''
head = '''-- Mise à jour de la base Vainc : to-do, Vainc+ (abonnement, parrainage, essais à offrir),
-- photo de profil réparée, partiels en commun, et la suite.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque (même si tu as déjà
-- lancé une ancienne mise à jour To-do ou Vainc+).

'''
open('supabase/mise-a-jour-tout.sql', 'w').write(head + fix + s[start:])
