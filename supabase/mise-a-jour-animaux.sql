-- Mise à jour Lockin : les 40 animaux réalistes (30 + 10 Lockin+), sans raretés.
-- Tes animaux déjà éclos deviennent un des nouveaux animaux. Supabase → SQL Editor → + → colle tout → Run.
-- On peut le relancer sans risque.
-- ═════════════════════════════════════════════════════════════════════════════
-- v21: realistic animals. 30 animals for everyone (0..29) + 10 Lockin+ (30..39), no more rarities.
-- Already hatched pets keep a matching animal: old species n → n mod 30, old Lockin+ 100+k → 30+k.
-- species_v marks pets already converted, so this block can be run again safely.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.pets add column if not exists species_v smallint default 1;
alter table public.pets drop constraint if exists pets_species_check;
update public.pets
set species = case when species >= 100 then 30 + (species - 100) % 10 else species % 30 end, species_v = 2
where species_v is distinct from 2 and species is not null;
update public.pets set species_v = 2 where species_v is distinct from 2;
alter table public.pets alter column species_v set default 2;
alter table public.pets add constraint pets_species_check check (species between 0 and 39);

create or replace function public.hatch_if_ready(pet uuid)
returns void language sql security definer set search_path = public as $$
  update public.pets
  set species = case when egg = 'plus' then 30 + floor(random() * 10) else floor(random() * 30) end::smallint, hatched_at = now()
  where id = pet and species is null and xp_seconds >= 19800; -- level 2 = 5 h 30
$$;

-- L'app voit tout de suite les nouvelles colonnes (badge, titre…).
notify pgrst, 'reload schema';
