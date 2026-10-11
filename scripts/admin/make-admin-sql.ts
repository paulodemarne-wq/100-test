// Generates supabase/admin.sql: turns one account into the maxed "featured" account
// (every item, every dragon at level 40, a fully built 32×32 island with the sea, deals on its shop).
// Run: npx esbuild scripts/admin/make-admin-sql.ts --bundle --platform=node --outfile=/tmp/a.js && node /tmp/a.js > supabase/admin.sql
import { LEVEL_HOURS, MAX_LEVEL, SHOP_ITEMS, SPECIES } from '../../src/creatures/species';
import { World } from '../../src/world/world';

const S = 32;
const tiles: string[] = Array(S * S).fill('g');
const set = (x: number, z: number, c: string) => {
  if (x >= 0 && z >= 0 && x < S && z < S) tiles[z * S + x] = c;
};
// Beaches all around, a lake with a pier, a meadow, a snowy corner, cobbled plaza, a cloud garden, paths.
for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) if (x < 2 || z < 2 || x > S - 3 || z > S - 3) set(x, z, 's');
for (let x = 20; x < 27; x++) for (let z = 18; z < 25; z++) if ((x - 23) ** 2 + (z - 21) ** 2 < 11) set(x, z, 'w');
for (let x = 3; x < 10; x++) for (let z = 3; z < 9; z++) set(x, z, 'f');
for (let x = 22; x < 29; x++) for (let z = 3; z < 9; z++) set(x, z, 'n');
for (let x = 12; x < 20; x++) for (let z = 12; z < 20; z++) set(x, z, 'o');
for (let x = 3; x < 9; x++) for (let z = 22; z < 28; z++) set(x, z, 'c');
for (let i = 2; i < S - 2; i++) {
  set(15, i, 'p');
  set(16, i, 'p');
  set(i, 15, 'p');
  set(i, 16, 'p');
}
for (let x = 13; x < 19; x++) for (let z = 13; z < 19; z++) set(x, z, 'o');
for (let x = 9; x < 12; x++) set(x, 26, 'd');

const objects: World['objects'] = [];
const used = new Set<string>();
const put = (id: string, x: number, z: number, r = 0) => {
  const k = `${x},${z}`;
  if (used.has(k)) return;
  if (x >= 0 && z >= 0 && x < S && z < S) {
    const t = tiles[z * S + x];
    const boat = SHOP_ITEMS.find((i) => i.id === id)?.slot === 'boat';
    if (boat ? t !== 'w' : t === 'w' || t === 'p') return;
  }
  used.add(k);
  objects.push([id, x, z, r]);
};
// The shop stand in the middle of the plaza, with the castle behind.
put('castle', 15, 11);
put('fountain', 15, 14);
put('statue', 13, 13);
put('statue', 18, 13);
for (const [x, z] of [[13, 18], [18, 18], [13, 15], [18, 15]]) put('lamp', x, z);
put('table', 17, 17);
put('treasure', 14, 17);
// Houses.
put('cottage', 5, 11); put('treehouse', 9, 11); put('mushroom', 5, 18); put('windmill', 10, 19);
put('igloo', 25, 5); put('igloo', 27, 7); put('cabin', 22, 11); put('tent', 25, 12); put('doghouse', 20, 12);
put('lighthouse', 29, 29); put('lighthouse', 2, 2);
// Gardens & trees.
for (let x = 3; x < 10; x += 2) put('sakura', x, 3);
for (let x = 4; x < 10; x += 2) put('flowerbed', x, 6);
put('rainbow', 6, 8);
for (let x = 22; x < 29; x += 2) put('pine', x, 3);
put('snowman', 24, 7); put('snowman', 26, 4);
put('crystal', 5, 24); put('crystal', 7, 26); put('crystal', 4, 27);
for (const [x, z] of [[2, 12], [2, 20], [29, 12], [29, 20], [12, 29], [20, 2]]) put('palm', x, z);
for (const [x, z] of [[11, 4], [12, 7], [19, 5], [20, 8], [11, 22], [19, 26], [27, 15], [28, 26]]) put(['apple', 'autumn', 'bamboo', 'bush'][(x + z) % 4], x, z);
for (const [x, z] of [[10, 24], [12, 25], [27, 17], [28, 23]]) put(['sunflower', 'cactus'][(x + z) % 2], x, z);
// Fun zone.
put('swing', 21, 27); put('slide', 23, 27); put('trampoline', 25, 27); put('hammock', 27, 27);
put('campfire', 10, 14); put('bench', 9, 13); put('bench', 11, 13); put('pumpkin', 12, 10);
// Beach.
for (const [x, z] of [[4, 30], [8, 30], [22, 30], [26, 30]]) {
  put('umbrella', x, z);
  put('deckchair', x + 1, z);
}
put('telescope', 30, 15); put('well', 20, 15); put('mailbox', 14, 21); put('signpost', 17, 21);
put('pond', 9, 16); put('hedge', 19, 22); put('hedge', 20, 22); put('fence', 21, 10); put('fence', 22, 10);
put('pier', 22, 24);
// Boats on the lake and all around the island.
put('duckboat', 23, 20); put('rowboat', 21, 22);
for (const [id, x, z] of [
  ['pirateship', 15, -3], ['yacht', 35, 10], ['sailboat', -3, 8], ['sailboat', 34, 24], ['rowboat', -2, 20],
  ['pirateship', 16, 34], ['yacht', -3, 28], ['duckboat', 33, 3], ['sailboat', 8, 34], ['rowboat', 26, -2],
] as [string, number, number][])
  put(id, x, z, (x + z) % 4);

const world: World = { v: 2, size: S, sea: true, tiles: tiles.join(''), objects };

// Every species that becomes a dragon (in any form), the ones ending as a dragon first.
const dragons = SPECIES.filter((s) => s.line.includes('dragon')).sort(
  (a, b) => Number(b.line[2] === 'dragon') - Number(a.line[2] === 'dragon'),
);
const maxXp = LEVEL_HOURS[MAX_LEVEL] * 3600;
const equipped = { head: 'crown', eyes: 'shades', neck: 'diamonds', back: 'jetpack' };
const esc = (s: string) => s.replace(/'/g, "''");

console.log(`-- ═════════════════════════════════════════════════════════════════════════
-- Compte vedette Lockin : à lancer UNE fois dans Supabase → SQL Editor,
-- APRÈS schema.sql. Remplace TON_PSEUDO (ligne juste en dessous) par ton pseudo.
--
-- Donne à ce compte : tous les objets et accessoires, ${dragons.length} dragons niveau ${MAX_LEVEL},
-- une île ${S}×${S} avec la mer entièrement construite, et le statut « vedette » :
-- son animal se promène sur l'île de tout le monde et son île a une boutique promo.
-- Généré par scripts/admin/make-admin-sql.ts.
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare
  pseudo text := 'TON_PSEUDO';
  me uuid;
  first_pet uuid;
  p uuid;
  sp int;
begin
  select id into me from public.profiles where lower(username) = lower(pseudo);
  if me is null then
    raise exception 'Pseudo % introuvable : mets ton pseudo exact (celui de ton profil).', pseudo;
  end if;

  update public.profiles set featured = true where id = me;

  -- Every item (accessories, island objects, upgrades).
  insert into public.inventory (user_id, item_id)
  select me, id from public.shop_items where kind <> 'egg'
  on conflict do nothing;

  -- Every dragon, maxed, wearing the legendary set. The first one becomes the active pet.
  foreach sp in array array[${dragons.map((d) => d.id).join(', ')}] loop
    if not exists (select 1 from public.pets where user_id = me and species = sp and xp_seconds >= ${maxXp}) then
      insert into public.pets (user_id, species, xp_seconds, hatched_at, equipped)
      values (me, sp, ${maxXp}, now(), '${JSON.stringify(equipped)}'::jsonb)
      returning id into p;
      if first_pet is null then first_pet := p; end if;
    end if;
  end loop;
  if first_pet is not null then
    update public.profiles set active_pet_id = first_pet where id = me;
  end if;

  -- The island.
  update public.profiles set world = '${esc(JSON.stringify(world))}'::jsonb where id = me;
end $$;

-- Promos de la boutique de ton île (modifiable : percent = réduction, 100 = offert).
insert into public.deals (item_id, percent, label) values
  ('pirate', 100, 'Offert'),
  ('egg', 50, '-50 %'),
  ('crown', 70, '-70 %'),
  ('jetpack', 60, '-60 %'),
  ('balloons', 50, '-50 %'),
  ('castle', 70, '-70 %'),
  ('pirateship', 60, '-60 %'),
  ('lighthouse', 50, '-50 %'),
  ('sea', 50, '-50 %'),
  ('size20', 50, '-50 %'),
  ('rainbow', 75, '-75 %')
on conflict (item_id) do update set percent = excluded.percent, label = excluded.label;`);
