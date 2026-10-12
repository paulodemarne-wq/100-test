-- Mise à jour To-do n°2 : changer de to-do pendant le chrono
-- (contient aussi la 1re mise à jour To-do et la correction du lock in de groupe).
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.

drop policy if exists "see own events" on public.lockin_events;
create policy "see own events" on public.lockin_events
  for select to authenticated using (host = auth.uid() or public.is_event_member(id, auth.uid()));

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

-- v13: one lock-in can switch between to-dos. todo_split = {"<todo id>": seconds, ...}.
alter table public.study_sessions add column if not exists todo_split jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_sessions_todo_split_check') then
    alter table public.study_sessions
      add constraint study_sessions_todo_split_check
      check (todo_split is null or (jsonb_typeof(todo_split) = 'object' and pg_column_size(todo_split) < 4000));
  end if;
end $$;

-- A finished session adds its focus time to its to-do(s), never more than the session lasted.
create or replace function public.feed_todo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  left_sec int := coalesce(new.duration_sec, 0);
  part record;
  sec int;
begin
  if new.status <> 'done' or old.status is not distinct from 'done' or left_sec <= 0 then
    return new;
  end if;
  if new.todo_split is not null and new.todo_split <> '{}'::jsonb then
    for part in select key, value from jsonb_each(new.todo_split) loop
      exit when left_sec <= 0;
      continue when part.key !~ '^[0-9a-fA-F-]{36}$' or jsonb_typeof(part.value) <> 'number';
      sec := floor(least(left_sec::numeric, greatest(0, (part.value #>> '{}')::numeric)))::int;
      continue when sec <= 0;
      update public.todos set worked_seconds = worked_seconds + sec
      where id = part.key::uuid and user_id = new.user_id;
      if found then left_sec := left_sec - sec; end if;
    end loop;
  elsif new.todo_id is not null then
    update public.todos set worked_seconds = worked_seconds + left_sec
    where id = new.todo_id and user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists feed_todo on public.study_sessions;
create trigger feed_todo after update of status on public.study_sessions
  for each row execute function public.feed_todo();
