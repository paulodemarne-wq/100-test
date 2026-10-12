-- Mise à jour Lockin+ (l'abonnement) + réparation de la photo de profil.
-- Contient aussi les mises à jour To-do d'avant : pas besoin de les relancer.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.
-- Ton compte vedette a Lockin+ automatiquement.

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
