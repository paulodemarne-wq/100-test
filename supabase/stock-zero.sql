-- Remet le stock d'objets du compte vedette à zéro, pour tester l'achat.
-- Les objets déjà posés sur l'île restent (leur stock = ce qui est posé).
-- Supabase → SQL Editor → + → colle tout → Run.

-- Objets payants jamais posés : plus en stock.
delete from public.inventory i
using public.profiles p, public.shop_items s
where i.user_id = p.id and p.featured
  and s.id = i.item_id and s.kind = 'garden' and s.slot <> 'ground' and s.cost_seconds > 0
  and not exists (
    select 1 from jsonb_array_elements(coalesce(p.world->'objects', '[]'::jsonb)) o
    where o->>0 = i.item_id
  );

-- Objets posés : stock = nombre posé (aucun en réserve).
update public.inventory i
set quantity = c.n
from (
  select p.id as user_id, o->>0 as item_id, count(*)::int as n
  from public.profiles p, jsonb_array_elements(coalesce(p.world->'objects', '[]'::jsonb)) o
  where p.featured
  group by 1, 2
) c, public.shop_items s
where i.user_id = c.user_id and i.item_id = c.item_id
  and s.id = i.item_id and s.kind = 'garden' and s.slot <> 'ground' and s.cost_seconds > 0;
