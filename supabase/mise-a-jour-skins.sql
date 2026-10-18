-- Mise à jour : skins. On change l'animal de son compagnon en gardant son niveau.
-- Les animaux normaux s'achètent 30 h (on garde tous ses skins), ceux de Vainc+ sont gratuits avec l'abonnement.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.

-- ═════════════════════════════════════════════════════════════════════════════
-- v22: skins. Your pet keeps its level when you change its animal.
-- Normal animals are bought one by one (30 h each, you keep every skin you buy);
-- the 10 Vainc+ animals are free to wear as long as Vainc+ is on.
-- The animal you start with (hatched from an egg) is a skin you own.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.pet_skins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  species smallint not null check (species between 0 and 39),
  created_at timestamptz not null default now(),
  primary key (user_id, species)
);
alter table public.pet_skins enable row level security;
drop policy if exists "see own skins" on public.pet_skins;
create policy "see own skins" on public.pet_skins for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.pet_skins from anon, authenticated;

-- Every animal you already hatched is a skin you own.
insert into public.pet_skins (user_id, species)
select distinct user_id, species from public.pets where species between 0 and 39
on conflict do nothing;

-- A new animal (hatching an egg) becomes a skin you own. Changing skin does not add one.
create or replace function public.register_skin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.species between 0 and 39 and (tg_op = 'INSERT' or old.species is null) then
    insert into public.pet_skins (user_id, species) values (new.user_id, new.species) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists register_skin on public.pets;
create trigger register_skin after insert or update of species on public.pets
  for each row execute function public.register_skin();

-- Buy a normal skin: 30 h.
create or replace function public.buy_skin(sp int)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  price constant bigint := 30 * 3600;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if sp is null or sp < 0 or sp > 29 then
    raise exception 'Les animaux Vainc+ sont gratuits avec Vainc+' using errcode = 'P0001';
  end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if exists (select 1 from public.pet_skins where user_id = me.id and species = sp) then
    raise exception 'Tu as déjà ce skin' using errcode = 'P0001';
  end if;
  if not me.featured and me.total_seconds - me.spent_seconds < price then
    raise exception 'Pas assez d''heures' using errcode = 'P0001';
  end if;
  insert into public.pet_skins (user_id, species) values (me.id, sp);
  if not me.featured then
    update public.profiles set spent_seconds = spent_seconds + price where id = me.id;
  end if;
end $$;
revoke execute on function public.buy_skin(int) from public, anon;
grant execute on function public.buy_skin(int) to authenticated;

-- Wear a skin on your active (hatched) pet: one you own, or a Vainc+ one while Vainc+ is on. The level stays.
create or replace function public.set_skin(sp int)
returns void language plpgsql security definer set search_path = public as $$
declare
  pet_id uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if sp is null or sp < 0 or sp > 39 then raise exception 'Skin inconnu' using errcode = 'P0001'; end if;
  select p.id into pet_id from public.pets p
  where p.id = (select active_pet_id from public.profiles where id = auth.uid()) and p.user_id = auth.uid();
  if pet_id is null then raise exception 'Pas d''animal actif' using errcode = 'P0001'; end if;
  if (select species from public.pets where id = pet_id) is null then
    raise exception 'Fais d''abord éclore ton œuf' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pet_skins where user_id = auth.uid() and species = sp)
     and not (sp >= 30 and public.is_premium(auth.uid())) then
    raise exception 'Skin pas débloqué' using errcode = 'P0001';
  end if;
  update public.pets set species = sp where id = pet_id;
end $$;
revoke execute on function public.set_skin(int) from public, anon;
grant execute on function public.set_skin(int) to authenticated;

notify pgrst, 'reload schema';
