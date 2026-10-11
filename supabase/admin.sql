-- ═════════════════════════════════════════════════════════════════════════
-- Compte vedette Lockin : à lancer UNE fois dans Supabase → SQL Editor,
-- APRÈS schema.sql. Remplace TON_PSEUDO (ligne juste en dessous) par ton pseudo.
--
-- Donne à ce compte : tous les objets et accessoires, 19 dragons niveau 40,
-- une île 32×32 avec la mer entièrement construite, et le statut « vedette » :
-- son animal se promène sur l'île de tout le monde et son île a la boutique du jour.
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
  foreach sp in array array[3, 12, 14, 16, 20, 31, 33, 37, 50, 54, 58, 67, 69, 71, 75, 84, 86, 88, 92] loop
    if not exists (select 1 from public.pets where user_id = me and species = sp and xp_seconds >= 7884000) then
      insert into public.pets (user_id, species, xp_seconds, hatched_at, equipped)
      values (me, sp, 7884000, now(), '{"head":"crown","eyes":"shades","neck":"diamonds","back":"jetpack"}'::jsonb)
      returning id into p;
      if first_pet is null then first_pet := p; end if;
    end if;
  end loop;
  if first_pet is not null then
    update public.profiles set active_pet_id = first_pet where id = me;
  end if;

  -- The island.
  update public.profiles set world = '{"v":2,"size":32,"sea":true,"tiles":"ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssgggggggggggggppgggggggggggggssssgfffffffgggggppgggggnnnnnnngssssgfffffffgggggppgggggnnnnnnngssssgfffffffgggggppgggggnnnnnnngssssgfffffffgggggppgggggnnnnnnngssssgfffffffgggggppgggggnnnnnnngssssgfffffffgggggppgggggnnnnnnngssssgggggggggggggppgggggggggggggssssgggggggggggggppgggggggggggggssssgggggggggggggppgggggggggggggssssggggggggggoooppoooggggggggggssssggggggggggooooooooggggggggggssssggggggggggooooooooggggggggggsssspppppppppppoooooopppppppppppsssspppppppppppoooooopppppppppppssssggggggggggooooooooggggggggggssssggggggggggooooooooggwwwgggggssssggggggggggoooppooogwwwwwggggssssgggggggggggggppgggwwwwwwwgggssssgggggggggggggppgggwwwwwwwgggssssgccccccggggggppgggwwwwwwwgggssssgccccccggggggppggggwwwwwggggssssgccccccggggggppgggggwwwgggggssssgccccccggggggppgggggggggggggssssgccccccdddgggppgggggggggggggssssgccccccggggggppgggggggggggggssssgggggggggggggppgggggggggggggssssgggggggggggggppgggggggggggggssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss","objects":[["castle",18,10,0],["boutique",15,14,0],["fountain",14,17,0],["statue",13,13,0],["statue",18,13,0],["lamp",13,18,0],["lamp",18,18,0],["lamp",13,15,0],["lamp",18,15,0],["table",17,17,0],["treasure",16,18,0],["cottage",5,11,0],["treehouse",9,11,0],["mushroom",5,18,0],["windmill",10,19,0],["igloo",25,5,0],["igloo",27,7,0],["cabin",22,11,0],["tent",25,12,0],["doghouse",20,12,0],["lighthouse",29,29,0],["lighthouse",2,2,0],["sakura",3,3,0],["sakura",5,3,0],["sakura",7,3,0],["sakura",9,3,0],["flowerbed",4,6,0],["flowerbed",6,6,0],["flowerbed",8,6,0],["rainbow",6,8,0],["pine",22,3,0],["pine",24,3,0],["pine",26,3,0],["pine",28,3,0],["snowman",24,7,0],["snowman",26,4,0],["crystal",5,24,0],["crystal",7,26,0],["crystal",4,27,0],["palm",2,12,0],["palm",2,20,0],["palm",29,12,0],["palm",29,20,0],["palm",12,29,0],["palm",20,2,0],["bush",11,4,0],["bush",12,7,0],["apple",19,5,0],["apple",20,8,0],["autumn",11,22,0],["autumn",19,26,0],["bamboo",28,26,0],["sunflower",10,24,0],["cactus",12,25,0],["sunflower",27,17,0],["cactus",28,23,0],["swing",21,27,0],["slide",23,27,0],["trampoline",25,27,0],["hammock",27,27,0],["campfire",10,14,0],["bench",9,13,0],["bench",11,13,0],["pumpkin",12,10,0],["umbrella",4,30,0],["deckchair",5,30,0],["umbrella",8,30,0],["deckchair",9,30,0],["umbrella",22,30,0],["deckchair",23,30,0],["umbrella",26,30,0],["deckchair",27,30,0],["telescope",30,15,0],["mailbox",14,21,0],["signpost",17,21,0],["hedge",19,22,0],["fence",21,10,0],["fence",22,10,0],["duckboat",23,20,0],["rowboat",21,22,0],["pirateship",15,-3,0],["yacht",35,10,1],["sailboat",-3,8,1],["sailboat",34,24,2],["rowboat",-2,20,2],["pirateship",16,34,2],["yacht",-3,28,1],["duckboat",33,3,0],["sailboat",8,34,2],["rowboat",26,-2,0]]}'::jsonb where id = me;
end $$;

-- La boutique de ton île change toute seule chaque jour à minuit (6 promos + 1 cadeau) :
-- rien à faire ici.
