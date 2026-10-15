-- Corrige l'erreur « new row violates row-level security policy for table lockin_events »
-- quand on crée un vainc de groupe.
-- Supabase → SQL Editor → + → colle tout → Run.
drop policy if exists "see own events" on public.lockin_events;
create policy "see own events" on public.lockin_events
  for select to authenticated using (host = auth.uid() or public.is_event_member(id, auth.uid()));
