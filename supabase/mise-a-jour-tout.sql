-- Mise à jour de la base Lockin : to-do, Lockin+ (abonnement, parrainage, essais à offrir),
-- photo de profil réparée, partiels en commun, et la suite.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque (même si tu as déjà
-- lancé une ancienne mise à jour To-do ou Lockin+).

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
  duration int := coalesce(new.duration_sec, 0);
  total numeric := 0;
  k numeric;
  part record;
begin
  if new.status <> 'done' or old.status is not distinct from 'done' or duration <= 0 then
    return new;
  end if;
  if new.todo_split is not null and new.todo_split <> '{}'::jsonb then
    for part in select key, value from jsonb_each(new.todo_split) loop
      continue when part.key !~ '^[0-9a-fA-F-]{36}$' or jsonb_typeof(part.value) <> 'number';
      total := total + greatest(0, (part.value #>> '{}')::numeric);
    end loop;
    -- More time announced than the session lasted: every part shrinks by the same factor.
    k := greatest(total, duration);
    for part in select key, value from jsonb_each(new.todo_split) loop
      continue when part.key !~ '^[0-9a-fA-F-]{36}$' or jsonb_typeof(part.value) <> 'number';
      update public.todos set worked_seconds = worked_seconds + floor(greatest(0, (part.value #>> '{}')::numeric) * duration / k)::int
      where id = part.key::uuid and user_id = new.user_id;
    end loop;
  elsif new.todo_id is not null then
    update public.todos set worked_seconds = worked_seconds + duration
    where id = new.todo_id and user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists feed_todo on public.study_sessions;
create trigger feed_todo after update of status on public.study_sessions
  for each row execute function public.feed_todo();

-- ═════════════════════════════════════════════════════════════════════════════
-- v14: Lockin+ (subscription). premium_until is only set by the server (payment,
-- or by hand in the SQL editor for now). Featured accounts count as Lockin+.
-- Lockin+ gives: a badge next to the name, a decoration around the photo (the photo
-- itself is free), the Lockin+ egg (10 exclusive creatures) and free island decorations.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists premium_until timestamptz,
  add column if not exists badge text,
  add column if not exists badge_color text not null default 'noir',
  add column if not exists decoration text;
-- Badges and decorations: must match src/lib/premium.ts.
alter table public.profiles drop constraint if exists profiles_badge_check;
alter table public.profiles add constraint profiles_badge_check
  check (badge is null or badge in ('star', 'crown', 'flame', 'bolt', 'gem', 'heart', 'moon', 'cap', 'trophy', 'note', 'sparkle', 'paw'));
alter table public.profiles drop constraint if exists profiles_badge_color_check;
alter table public.profiles add constraint profiles_badge_color_check check (badge_color in ('noir', 'or', 'violet'));
alter table public.profiles drop constraint if exists profiles_decoration_check;
alter table public.profiles add constraint profiles_decoration_check
  check (decoration is null or decoration in ('flames', 'crown', 'laurel', 'angel', 'grad', 'headset', 'cat', 'devil', 'orbit', 'sakura'));
grant update (badge, badge_color, decoration) on public.profiles to authenticated;

create or replace function public.is_premium(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select featured or coalesce(premium_until > now(), false) from public.profiles where id = u), false);
$$;

-- Badge and decoration are Lockin+ only (taking them off is always allowed).
-- They stay stored when Lockin+ ends; the app only shows them while it is on.
create or replace function public.check_profile_premium()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The SQL editor (no signed-in user) can do anything.
  if auth.uid() is null or public.is_premium(new.id) then return new; end if;
  if (new.badge is not null and (tg_op = 'INSERT' or new.badge is distinct from old.badge))
     or (new.decoration is not null and (tg_op = 'INSERT' or new.decoration is distinct from old.decoration)) then
    raise exception 'Réservé à Lockin+' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists check_profile_premium on public.profiles;
create trigger check_profile_premium before insert or update of badge, decoration on public.profiles
  for each row execute function public.check_profile_premium();

-- The profile photo is free. Reading your own files back is needed to replace one.
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read own avatar" on storage.objects;
create policy "read own avatar" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lockin+ items: the egg with the 10 exclusive creatures, and free decorations.
alter table public.shop_items add column if not exists premium boolean not null default false;
insert into public.shop_items (id, kind, slot, rarity, cost_seconds, premium) values
  ('egg_plus', 'egg', null, 'légendaire', 50 * 3600, true),
  ('portal', 'garden', 'deco', 'légendaire', 0, true),
  ('crystals', 'garden', 'deco', 'légendaire', 0, true),
  ('lanterns', 'garden', 'deco', 'légendaire', 0, true),
  ('throne', 'garden', 'deco', 'légendaire', 0, true),
  ('balloon', 'garden', 'deco', 'légendaire', 0, true),
  ('gazebo', 'garden', 'house', 'légendaire', 0, true)
on conflict (id) do update set kind = excluded.kind, slot = excluded.slot, rarity = excluded.rarity,
  cost_seconds = excluded.cost_seconds, premium = excluded.premium;

-- Which egg a pet came from; Lockin+ eggs hatch one of the creatures 100..109.
alter table public.pets add column if not exists egg text not null default 'normal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pets_egg_check') then
    alter table public.pets add constraint pets_egg_check check (egg in ('normal', 'plus'));
  end if;
end $$;
alter table public.pets drop constraint if exists pets_species_check;
alter table public.pets add constraint pets_species_check check (species between 0 and 109);

create or replace function public.hatch_if_ready(pet uuid)
returns void language sql security definer set search_path = public as $$
  update public.pets
  set species = case when egg = 'plus' then 100 + floor(random() * 10) else floor(random() * 100) end::smallint, hatched_at = now()
  where id = pet and species is null and xp_seconds >= 19800; -- level 2 = 5 h 30
$$;

create or replace function public.owns_item(u uuid, item text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_items where id = item and kind = 'garden' and cost_seconds = 0
                and (not premium or public.is_premium(u)))
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
  -- Without Lockin+ (it ended), its decorations are taken off the island instead of blocking the save.
  if not public.is_premium(auth.uid()) then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into objects
    from jsonb_array_elements(objects) e
    where not exists (select 1 from public.shop_items s where s.id = e->>0 and s.premium);
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
  if it.premium and not public.is_premium(auth.uid()) then raise exception 'Réservé à Lockin+' using errcode = 'P0001'; end if;
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
    insert into public.pets (user_id, egg) values (me.id, case when it.id = 'egg_plus' then 'plus' else 'normal' end)
    returning id into new_pet;
  end if;
  if not me.featured then
    update public.profiles set spent_seconds = spent_seconds + price where id = me.id;
  end if;
  return new_pet;
end $$;

revoke execute on function public.purchase(text, int) from public, anon, authenticated;

create or replace function public.todays_deals()
returns table (item_id text, percent int)
language sql stable security definer set search_path = public as $$
  with day as (select ((now() at time zone 'Europe/Paris')::date)::text as d),
  pool as (
    select s.id, s.kind, s.cost_seconds, md5(day.d || s.id) as h
    from public.shop_items s, day
    where s.cost_seconds > 0 and s.kind in ('accessory', 'garden', 'egg', 'upgrade') and not s.premium
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

-- ═════════════════════════════════════════════════════════════════════════════
-- v15: Lockin+ referrals and gifted trials.
-- Every Lockin+ period is a row in plus_grants; grant_plus() is the only way to give one
-- (a payment, a trial, a referral reward, or by hand). It is never callable from the app.
-- - Referral: a new user enters a friend's code; when they PAY for Lockin+ the first time,
--   both get one month free.
-- - Trials: a paying subscriber can give up to 5 trials of 7 days to friends who never had Lockin+.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles (id) on delete set null;
update public.profiles set referral_code = upper(substr(md5(id::text || random()::text), 1, 6)) where referral_code is null;
alter table public.profiles alter column referral_code set default upper(substr(md5(gen_random_uuid()::text), 1, 6));
create unique index if not exists profiles_referral_code on public.profiles (referral_code);

create table if not exists public.plus_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('paid', 'trial', 'referral', 'admin')),
  days int not null check (days between 1 and 3660),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists plus_grants_user on public.plus_grants (user_id);
create index if not exists plus_grants_giver on public.plus_grants (granted_by, source);
alter table public.plus_grants enable row level security;
drop policy if exists "see own grants" on public.plus_grants;
create policy "see own grants" on public.plus_grants
  for select to authenticated using (user_id = auth.uid() or granted_by = auth.uid());
revoke insert, update, delete on public.plus_grants from anon, authenticated;

-- Gives Lockin+ for some days (after what is left), and pays the referral reward on a first payment.
create or replace function public.grant_plus(u uuid, days int, source text, giver uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  first_paid boolean;
  sponsor uuid;
begin
  first_paid := source = 'paid' and not exists (select 1 from public.plus_grants where user_id = u and plus_grants.source = 'paid');
  insert into public.plus_grants (user_id, source, days, granted_by) values (u, source, days, giver);
  update public.profiles
  set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => days)
  where id = u;
  if first_paid then
    select referred_by into sponsor from public.profiles where id = u;
    if sponsor is not null then
      perform public.grant_plus(u, 30, 'referral', sponsor);
      perform public.grant_plus(sponsor, 30, 'referral', u);
      perform public.send_push(array[sponsor], 'Parrainage réussi 🎉', 'Ton pote a pris Lockin+ : 1 mois offert pour vous deux.', '{"type":"plus"}');
    end if;
  end if;
end $$;
revoke execute on function public.grant_plus(uuid, int, text, uuid) from public, anon, authenticated;

-- A new user enters a friend's code (once, and only before ever having Lockin+).
create or replace function public.use_referral_code(code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  sponsor public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'Non connecté'; end if;
  if me.referred_by is not null then raise exception 'Tu as déjà un parrain' using errcode = 'P0001'; end if;
  if exists (select 1 from public.plus_grants where user_id = me.id) then
    raise exception 'Le parrainage, c''est avant ton premier Lockin+' using errcode = 'P0001';
  end if;
  select * into sponsor from public.profiles where referral_code = upper(trim(code));
  if sponsor.id is null then raise exception 'Code inconnu' using errcode = 'P0001'; end if;
  if sponsor.id = me.id then raise exception 'C''est ton propre code 😅' using errcode = 'P0001'; end if;
  update public.profiles set referred_by = sponsor.id where id = me.id;
  return sponsor.display_name;
end $$;
revoke execute on function public.use_referral_code(text) from public, anon;
grant execute on function public.use_referral_code(text) to authenticated;

-- Who can give trials: a paying subscriber (or a featured account), 5 trials at most.
create or replace function public.trials_left(u uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when not public.is_premium(u) then 0
    when not (exists (select 1 from public.profiles where id = u and featured)
              or exists (select 1 from public.plus_grants where user_id = u and source = 'paid')) then 0
    else greatest(0, 5 - (select count(*)::int from public.plus_grants where granted_by = u and source = 'trial'))
  end;
$$;

-- My friends who can still get a trial (they never had Lockin+).
create or replace function public.trial_candidates()
returns table (id uuid) language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where public.is_friend(auth.uid(), p.id)
    and p.premium_until is null and not p.featured
    and not exists (select 1 from public.plus_grants g where g.user_id = p.id);
$$;
revoke execute on function public.trial_candidates() from public, anon;
grant execute on function public.trial_candidates() to authenticated;
revoke execute on function public.trials_left(uuid) from public, anon;
grant execute on function public.trials_left(uuid) to authenticated;

create or replace function public.give_trial(friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  -- Lock my row so two gifts at once can't go past 5.
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'Non connecté'; end if;
  if public.trials_left(me.id) <= 0 then raise exception 'Plus d''essai à offrir' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.trial_candidates() c where c.id = friend) then
    raise exception 'Ce pote a déjà eu Lockin+ (ou n''est pas ton ami)' using errcode = 'P0001';
  end if;
  perform public.grant_plus(friend, 7, 'trial', me.id);
  perform public.send_push(array[friend], me.display_name || ' t''offre Lockin+ 🎁', '7 jours d''essai : badge, décoration de photo, animaux exclusifs…', '{"type":"plus"}');
end $$;
revoke execute on function public.give_trial(uuid) from public, anon;
grant execute on function public.give_trial(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- v16: shared exams. The owner (or anyone who joined) invites friends; once they join,
-- they see the exam and its ranking: hours of each member on sessions named like the exam.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.exam_members (
  exam_id uuid not null references public.exams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (exam_id, user_id)
);
alter table public.exam_members enable row level security;

create or replace function public.in_exam(e uuid, u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.exams where id = e and user_id = u)
      or exists (select 1 from public.exam_members where exam_id = e and user_id = u and status = 'joined');
$$;

-- An invited or joined member sees the exam (only its owner changes or deletes it).
drop policy if exists "see shared exams" on public.exams;
create policy "see shared exams" on public.exams
  for select to authenticated using (
    exists (select 1 from public.exam_members m where m.exam_id = exams.id and m.user_id = auth.uid())
  );

drop policy if exists "see exam members" on public.exam_members;
create policy "see exam members" on public.exam_members
  for select to authenticated using (user_id = auth.uid() or public.in_exam(exam_id, auth.uid()));
-- Joining (invited → joined) and leaving are the member's own choice.
drop policy if exists "answer exam invites" on public.exam_members;
create policy "answer exam invites" on public.exam_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'joined');
drop policy if exists "leave exams" on public.exam_members;
create policy "leave exams" on public.exam_members
  for delete to authenticated using (user_id = auth.uid() or exists (select 1 from public.exams x where x.id = exam_id and x.user_id = auth.uid()));
revoke insert, update on public.exam_members from anon, authenticated;
grant update (status) on public.exam_members to authenticated;

create or replace function public.invite_to_exam(exam uuid, friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  x public.exams;
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into x from public.exams where id = exam;
  if x.id is null or not public.in_exam(exam, auth.uid()) then raise exception 'Partiel introuvable' using errcode = 'P0001'; end if;
  if not public.is_friend(auth.uid(), friend) then raise exception 'Tu ne peux inviter que tes amis' using errcode = 'P0001'; end if;
  if friend = x.user_id or exists (select 1 from public.exam_members where exam_id = exam and user_id = friend) then
    raise exception 'Déjà invité' using errcode = 'P0001';
  end if;
  if (select count(*) from public.exam_members where exam_id = exam) >= 50 then raise exception 'Trop de monde (50 max)' using errcode = 'P0001'; end if;
  insert into public.exam_members (exam_id, user_id, invited_by) values (exam, friend, me.id);
  perform public.send_push(array[friend], me.display_name || ' révise ' || x.name || ' 📚', 'Rejoins son partiel pour réviser ensemble et voir qui bosse le plus.', jsonb_build_object('type', 'exam_invite', 'exam_id', exam));
end $$;
revoke execute on function public.invite_to_exam(uuid, uuid) from public, anon;
grant execute on function public.invite_to_exam(uuid, uuid) to authenticated;

-- Hours of each member on this exam (sessions named like it, since it was created). Members only.
create or replace function public.exam_ranking(exam uuid)
returns table (user_id uuid, display_name text, avatar_url text, seconds bigint)
language sql stable security definer set search_path = public as $$
  with x as (select * from public.exams where id = exam and public.in_exam(exam, auth.uid())),
  people as (
    select x.user_id from x
    union
    select m.user_id from public.exam_members m, x where m.exam_id = x.id and m.status = 'joined'
  )
  select p.id, p.display_name, p.avatar_url,
    coalesce((select sum(s.duration_sec) from public.study_sessions s, x
              where s.user_id = p.id and s.status = 'done' and lower(s.subject) = lower(x.name) and s.started_at >= x.created_at), 0)::bigint
  from people pe join public.profiles p on p.id = pe.user_id
  order by 4 desc;
$$;
revoke execute on function public.exam_ranking(uuid) from public, anon;
grant execute on function public.exam_ranking(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- v17: messages between friends (private, live, with a push notification).
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_recipient on public.messages (recipient, created_at desc);
create index if not exists messages_sender on public.messages (sender, created_at desc);
alter table public.messages enable row level security;

drop policy if exists "see own messages" on public.messages;
create policy "see own messages" on public.messages
  for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
-- Only to friends, only as yourself.
drop policy if exists "send messages to friends" on public.messages;
create policy "send messages to friends" on public.messages
  for insert to authenticated with check (sender = auth.uid() and recipient <> auth.uid() and public.is_friend(auth.uid(), recipient));
-- The recipient marks as read; the sender can delete what they sent.
drop policy if exists "read received messages" on public.messages;
create policy "read received messages" on public.messages
  for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());
drop policy if exists "delete sent messages" on public.messages;
create policy "delete sent messages" on public.messages
  for delete to authenticated using (sender = auth.uid());
revoke insert, update on public.messages from anon, authenticated;
grant insert (recipient, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create or replace function public.push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_push(
    array[new.recipient],
    (select display_name from public.profiles where id = new.sender),
    left(new.body, 140),
    jsonb_build_object('type', 'message', 'from', new.sender)
  );
  return new;
end $$;
drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages
  for each row execute function public.push_on_message();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- v18: Lockin+ extras: a title under the name, and a name for your pet.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists title text;
alter table public.profiles drop constraint if exists profiles_title_check;
alter table public.profiles add constraint profiles_title_check check (title is null or title in (
  'Machine de guerre', 'Roi des partiels', 'Reine des partiels', 'Lève-tôt', 'Oiseau de nuit', 'Inarrêtable',
  'Cerveau en feu', 'Rat de bibliothèque', 'Zéro distraction', 'Futur major', 'Mode moine', 'Légende de la BU'));
grant update (title) on public.profiles to authenticated;

create or replace function public.check_profile_premium()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The SQL editor (no signed-in user) can do anything.
  if auth.uid() is null or public.is_premium(new.id) then return new; end if;
  if (new.badge is not null and (tg_op = 'INSERT' or new.badge is distinct from old.badge))
     or (new.decoration is not null and (tg_op = 'INSERT' or new.decoration is distinct from old.decoration))
     or (new.title is not null and (tg_op = 'INSERT' or new.title is distinct from old.title)) then
    raise exception 'Réservé à Lockin+' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists check_profile_premium on public.profiles;
create trigger check_profile_premium before insert or update of badge, decoration, title on public.profiles
  for each row execute function public.check_profile_premium();

alter table public.pets add column if not exists nickname text;
alter table public.pets drop constraint if exists pets_nickname_check;
alter table public.pets add constraint pets_nickname_check check (nickname is null or char_length(nickname) between 1 and 20);

create or replace function public.rename_pet(pet uuid, name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_premium(auth.uid()) then raise exception 'Réservé à Lockin+' using errcode = 'P0001'; end if;
  update public.pets set nickname = nullif(trim(name), '') where id = pet and user_id = auth.uid();
  if not found then raise exception 'Animal introuvable' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.rename_pet(uuid, text) from public, anon;
grant execute on function public.rename_pet(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- v19: more Lockin+: the accessory of the month, two more islands (snow, floating),
-- and bigger group lock-ins (30 people instead of 8).
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.shop_items (id, kind, slot, rarity, cost_seconds, premium) values
  ('tiara', 'accessory', 'head', 'légendaire', 0, true),
  ('bunny', 'accessory', 'head', 'légendaire', 0, true),
  ('galaxy', 'accessory', 'neck', 'légendaire', 0, true),
  ('butterfly', 'accessory', 'back', 'légendaire', 0, true)
on conflict (id) do update set kind = excluded.kind, slot = excluded.slot, rarity = excluded.rarity,
  cost_seconds = excluded.cost_seconds, premium = excluded.premium;

-- Must match MONTHLY_ACCESSORIES in src/creatures/species.ts.
create or replace function public.monthly_accessory()
returns text language sql stable set search_path = public as $$
  select (array['tiara', 'bunny', 'galaxy', 'butterfly'])[
    ((extract(year from now() at time zone 'Europe/Paris')::int * 12 + extract(month from now() at time zone 'Europe/Paris')::int - 1) % 4) + 1];
$$;

create or replace function public.claim_monthly_accessory()
returns text language plpgsql security definer set search_path = public as $$
declare item text := public.monthly_accessory();
begin
  if not public.is_premium(auth.uid()) then raise exception 'Réservé à Lockin+' using errcode = 'P0001'; end if;
  insert into public.inventory (user_id, item_id) values (auth.uid(), item) on conflict do nothing;
  return item;
end $$;
revoke execute on function public.claim_monthly_accessory() from public, anon;
grant execute on function public.claim_monthly_accessory() to authenticated;

-- Islands 2 (snow) and 3 (floating, on clouds): Lockin+ only, same stock of objects as the first one.
alter table public.profiles add column if not exists world2 jsonb, add column if not exists world3 jsonb;

create or replace function public.save_world(world jsonb, island int)
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
  -- The other islands' objects count against the same stock.
  others jsonb;
  free_tile text := case island when 2 then 'n' when 3 then 'c' else '' end;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if island not in (1, 2, 3) then raise exception 'Île invalide'; end if;
  if island > 1 and not public.is_premium(auth.uid()) then raise exception 'Réservé à Lockin+' using errcode = 'P0001'; end if;
  select case when island = 1 then '[]'::jsonb else coalesce(p.world->'objects', '[]'::jsonb) end
    || case when island = 2 then '[]'::jsonb else coalesce(p.world2->'objects', '[]'::jsonb) end
    || case when island = 3 then '[]'::jsonb else coalesce(p.world3->'objects', '[]'::jsonb) end
    into others from public.profiles p where p.id = auth.uid();
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
  -- Without Lockin+ (it ended), its decorations are taken off the island instead of blocking the save.
  if not public.is_premium(auth.uid()) then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into objects
    from jsonb_array_elements(objects) e
    where not exists (select 1 from public.shop_items s where s.id = e->>0 and s.premium);
  end if;
  for ch in select distinct c from regexp_split_to_table(tiles, '') as c loop
    -- The snow island's snow and the floating island's clouds come free with it.
    if ch <> free_tile and not public.owns_item(auth.uid(), tile_items->>ch) then raise exception 'Sol non possédé'; end if;
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
       (select count(*) from jsonb_array_elements(objects) e where e->>0 = o->>0)
       + (select count(*) from jsonb_array_elements(others) e where e->>0 = o->>0) >
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
  if island = 1 then
    update public.profiles set world = jsonb_build_object('v', 2, 'size', size, 'sea', sea, 'tiles', tiles, 'objects', objects) where id = auth.uid();
  elsif island = 2 then
    update public.profiles set world2 = jsonb_build_object('v', 2, 'size', size, 'sea', sea, 'tiles', tiles, 'objects', objects) where id = auth.uid();
  else
    update public.profiles set world3 = jsonb_build_object('v', 2, 'size', size, 'sea', sea, 'tiles', tiles, 'objects', objects) where id = auth.uid();
  end if;
end $$;
revoke execute on function public.save_world(jsonb, int) from public, anon;
grant execute on function public.save_world(jsonb, int) to authenticated;

-- The first island keeps its old entry point.
create or replace function public.save_world(world jsonb)
returns void language sql security definer set search_path = public as $$
  select public.save_world(world, 1);
$$;

-- Group lock-ins: 8 people, or 30 when the host has Lockin+.
create or replace function public.check_event_size()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  host uuid := public.event_host(new.event_id);
  cap int := case when public.is_premium(host) then 30 else 8 end;
begin
  if (select count(*) from public.event_members where event_id = new.event_id) >= cap then
    raise exception 'Lock in de groupe plein (% personnes max%)', cap, case when cap = 8 then ', 30 avec Lockin+' else '' end using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists check_event_size on public.event_members;
create trigger check_event_size before insert on public.event_members
  for each row execute function public.check_event_size();

-- L'app voit tout de suite les nouvelles colonnes (badge, titre…).
notify pgrst, 'reload schema';
