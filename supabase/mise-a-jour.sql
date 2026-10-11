-- Mise à jour rapide (si tu ne relances pas tout schema.sql) :
-- stock d'objets de l'île + temps illimité pour le compte vedette.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.

-- 1. Les objets de l'île se comptent (1 achat = 1 objet à poser).
alter table public.inventory add column if not exists quantity int not null default 1;

-- Personne ne perd ce qu'il avait déjà posé.
update public.inventory i
set quantity = greatest(i.quantity, c.n)
from (
  select p.id as user_id, o->>0 as item_id, count(*)::int as n
  from public.profiles p, jsonb_array_elements(coalesce(p.world->'objects', '[]'::jsonb)) o
  group by 1, 2
) c
where i.user_id = c.user_id and i.item_id = c.item_id;

-- 2. Le compte vedette a un gros stock de chaque objet.
insert into public.inventory (user_id, item_id, quantity)
select p.id, s.id, 999
from public.profiles p, public.shop_items s
where p.featured and s.kind in ('garden', 'special') and s.slot <> 'ground'
on conflict (user_id, item_id) do update set quantity = 999;

-- 3. Achats : objets à la pièce, temps illimité pour le compte vedette.
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
  select * into me from public.profiles where id = auth.uid() for update;
  if not me.featured and me.total_seconds - me.spent_seconds < price then
    raise exception 'Pas assez d''heures' using errcode = 'P0001';
  end if;
  if it.id in ('size24', 'size28', 'size32') and not exists (
    select 1 from public.inventory
    where user_id = me.id and item_id = 'size' || (substring(it.id from 5)::int - 4)::text
  ) then
    raise exception 'Agrandis d''abord à la taille d''avant' using errcode = 'P0001';
  end if;
  if it.kind = 'garden' and it.slot <> 'ground' then
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

revoke execute on function public.purchase(text, int) from public, anon, authenticated;
