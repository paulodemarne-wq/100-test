# Builds supabase/mise-a-jour-tout.sql: the group vainc fix + everything from v12 (to-dos) on, from schema.sql.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
s = open('supabase/schema.sql').read()
start = s.rfind('\n-- ═', 0, s.index('-- v12: to-dos')) + 1
fix = '''drop policy if exists "see own events" on public.lockin_events;
create policy "see own events" on public.lockin_events
  for select to authenticated using (host = auth.uid() or public.is_event_member(id, auth.uid()));

'''
head = '''-- Mise à jour de la base Vainc : to-do, Vainc+ (abonnement, parrainage, essais à offrir),
-- photo de profil réparée, partiels en commun, et la suite.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque (même si tu as déjà
-- lancé une ancienne mise à jour To-do ou Vainc+).

'''
open('supabase/mise-a-jour-tout.sql', 'w').write(head + fix + s[start:])
