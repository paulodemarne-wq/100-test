# Vainc — contexte complet pour reprendre le travail

> Ce fichier sert à reprendre le projet dans une **nouvelle conversation** sans rien perdre.
> Claude : lis-le en entier avant de commencer, puis `README.md` (fonctionnalités) et `AGENTS.md` (règles Expo).

## 1. Le projet

**Vainc** est une app iPhone de révision sociale, faite par un étudiant français qui ne code pas lui-même.
On lance un chrono « Je bosse », les amis le voient en direct, et si on quitte l'app plus de 10 s, on a « craqué ».
Autour de ça :
- les to-do ;
- un animal 3D qui grandit avec les heures ;
- une île 3D à décorer ;
- une boutique payée en heures ;
- l'abonnement Vainc+ ;
- les messages, le mode partiels, les groupes, le classement et le mur de la honte.

- Dépôt : https://github.com/paulodemarne-wq/100-test (branche `main`)
- Stack :
  - Expo SDK 57, expo-router (routes dans `src/app/`), React Native 0.86 ;
  - expo-gl + three.js 0.185 (WebGL2 via `src/lib/glRenderer.ts`) ;
  - Supabase (auth, base Postgres, RLS, RPC `security definer`, push via `pg_net` → Expo Push).
- Test : l'utilisateur lance l'app sur son iPhone avec **Expo Go** (`npx expo start -c`, puis scan du QR code). Il n'a pas de Mac.
- Supabase :
  - URL `https://ljomnjzqnnkzkteqnrsy.supabase.co` ;
  - clé publique `sb_publishable_73bX9VlfmUOVxvDF7wL0ow_mKBFBAxg` (dans `src/lib/supabase.ts`).

## 2. Règles de travail avec l'utilisateur (IMPORTANT)

- **Parler en français simple**, phrases courtes, sans jargon. Il écrit vite, sans accents ni ponctuation : comprendre l'intention.
- **« ne code pas »** = on discute seulement, aucun changement de fichier.
- Quand un choix lui revient (design, contenu), poser la question avec des options claires.
- **SQL** : toujours dans un fichier du dépôt (`supabase/xxx.sql`). Donner les deux liens :
  - le lien du dépôt, par exemple [supabase/xxx.sql](supabase/xxx.sql) ;
  - le lien GitHub `https://github.com/paulodemarne-wq/100-test/blob/main/supabase/xxx.sql`, car il ne trouve pas toujours les fichiers.

  Puis expliquer : Supabase → **SQL Editor** → **+** → coller → **Run**.
  Chaque mise à jour SQL doit pouvoir être relancée sans risque (`if not exists`, `create or replace`…) et finir par `notify pgrst, 'reload schema';`.
- **Commandes Terminal** : les donner dans le chat, dans un bloc de code :
  ```
  git pull
  npx expo start -c
  ```
- Quand c'est fini : **commit + push direct sur `main`**, sans pull request (sauf s'il en demande une).
- Travail pas terminé : le pousser sur une branche `wip/...`, car le hook de fin exige que tout soit commit + push.
- Commits en anglais. Ne jamais y mettre de nom de modèle. Les terminer par les lignes d'attribution données par le système.
- **Ne jamais demander ni manipuler** la clé secrète Supabase, la clé `service_role` ou le mot de passe de la base. Seules l'URL et la clé publique ci-dessus sont utilisées.
- Montrer le résultat en images (captures 3D via `vainc/apercu/`) quand on touche aux animaux ou à l'île.
- Avant de dire « fini » : `npx tsc --noEmit`, puis vérifier le bundle iOS :
  ```
  npx expo export --platform ios --output-dir /tmp/exp
  ```
  Lancer aussi les tests SQL si la base a changé.
  Ne pas garder les changements que `npx expo lint` fait tout seul (config eslint, package.json) : les annuler.

## 3. Organisation du code

| Dossier | Contenu |
|---|---|
| `src/app/(tabs)/` | Onglets : `index.tsx` (Focus, le chrono), `todos.tsx`, `pet.tsx` (Mon animal), `feed.tsx`, `ranking.tsx` |
| `src/app/` | Autres écrans : profil, boutique (`shop`), île (`world`), bestiaire, premium (Vainc+), cadeau (`gift/[code]`), `plus-received`, messages, chat, partiels (`exams`), groupes, événements, stats, récap, login |
| `src/lib/` | `store.tsx` (sessions, chrono, to-do), `auth.tsx`, `social.tsx`, `chat.tsx`, `premium.ts`, `gifts.ts`, `wallet.ts`, `notifications.ts`, `supabase.ts`… |
| `src/components/` | `PetView` (animal 3D), `WorldView` (île 3D), `Avatar`, `SubscribeBar`, `PlusCelebration`… |
| `src/creatures/` | `species.ts` (liste des espèces, niveaux, boutique d'accessoires), `build.ts` (construit l'animal 3D + accessoires) |
| `src/creatures/real/` | Animaux réalistes procéduraux (voir §5) |
| `src/world/` | `world.ts` (données de l'île), `scene.ts` (scène 3D de l'île), `flatten.ts` (fusion des meshes), `decor.ts` |
| `src/world/real/` | Île et objets réalistes : `island.ts`, `nature.ts`, `decorHouses.ts`, `decorNature.ts`, `decorProps.ts`, `materials.ts` |
| `supabase/` | `schema.sql` (tout le schéma, versions v2→v21, relançable) + fichiers de mise à jour pour l'utilisateur |
| `scripts/` | `real/*-preview.ts` (aperçus 3D), `admin/make-admin-sql.ts` (génère `supabase/admin.sql`), `icon/` |
| `vainc/` | Ce dossier : contexte, tests SQL, outils |

## 4. Base de données (Supabase)

- `supabase/schema.sql` contient tout le schéma. Il est relançable et se termine par `notify pgrst, 'reload schema';`.
  Les blocs sont numérotés :
  - v2 : partiels, groupes, push ;
  - v3 : pauses, réactions ;
  - v4 : animaux et porte-monnaie d'heures ;
  - v5 à v9 : île et stock d'objets ;
  - v8 : compte vedette ;
  - v12 et v13 : to-do (`todo_split`) ;
  - v14 et v15 : Vainc+ et parrainage ;
  - v16 : partiels en commun ;
  - v17 : messages ;
  - v18 et v19 : bonus Vainc+ ;
  - v20 : cadeaux Vainc+ par lien ;
  - v21 : animaux réalistes, espèces 0..39, colonne `pets.species_v`.
- Fichiers pour l'utilisateur :
  - `mise-a-jour-tout.sql` : v12 → v21. Il est généré par `python3 vainc/outils/make_update.py`.
  - `mise-a-jour-cadeaux.sql` : v20.
  - `mise-a-jour-animaux.sql` : v21.
  - `admin.sql` : compte vedette, généré par `scripts/admin/make-admin-sql.ts`.
  - `verifier.sql` : vérification.
- **Quand on ajoute un bloc v22 dans `schema.sql`** :
  1. Créer aussi `supabase/mise-a-jour-xxx.sql` avec le même bloc.
  2. Régénérer `mise-a-jour-tout.sql`.
  3. Ajouter un test `vainc/tests-sql/v22_test.sql` et l'ajouter à la liste `TESTS` dans `lancer-tests.sh`.
- **Tests SQL** : `bash vainc/tests-sql/lancer-tests.sh`. Il installe un Postgres local sur le port 5499 et teste deux cas :
  - une base neuve, avec `schema.sql` lancé 2 fois ;
  - une vieille base (`old0.sql`) mise à jour avec `mise-a-jour-tout.sql` lancé 2 fois.

  Tout doit afficher `PASSED`.

## 5. Animaux réalistes (refaits en dernier)

- **40 espèces** dans `src/creatures/real/catalog.ts` :
  - **0 à 29 pour tout le monde** : 6 serpents, 16 mammifères, 8 oiseaux.
  - **30 à 39 sont Vainc+** : panthère noire, tigre blanc, lion à crinière noire, loup noir, cobra doré, anaconda, ara hyacinthe, harpie féroce, renard argenté, jaguar (`PLUS_FIRST_ID = 30`).
- **Plus de raretés**. Il ne reste que les niveaux.
  - Niveaux 0 et 1 : œuf (doré pour Vainc+).
  - 5 paliers : **Bébé** (niv 2), **Jeune** (8), **Adulte** (16), **Alpha** (25), **Légende** (34), jusqu'au niveau 40.
  - Le palier « Mythique » a été **supprimé à la demande de l'utilisateur**.
- C'est toujours le même animal à tous les paliers : un bébé serpent reste un serpent, « très stylé » à la fin.
- À chaque palier, il gagne :
  - des **parties du corps en plus** ;
  - des **pouvoirs élémentaires**, avec 5 éléments : feu, glace, foudre, nature, ombre (`powers.ts`).

  Ça donne : piques à pointes lumineuses, cornes, queue, crinière d'élément, particules, aura au sol, ailes d'élément, éclairs, marques lumineuses. L'animal grandit aussi un peu à chaque niveau.
- Fichiers :
  - `loft.ts` : corps balayés le long d'une courbe ;
  - `textures.ts` : textures cuites (couleur, normales, rugosité, lueur), écailles de serpent, yeux ;
  - `fur.ts` : fourrure en coquilles ;
  - `snake.ts`, `quadruped.ts`, `bird.ts` : les trois familles d'animaux ;
  - `lights.ts` : lumière nature, ACES, ombres ;
  - `index.ts` : `stageFor(level)`, `buildAnimal`, `buildEgg` ;
  - `types.ts` : `STAGES`, `QUALITY.lite`.
- Le mode `lite` (moins de fourrure et de particules) sert pour les animaux qui se promènent sur l'île.
- Les accessoires de la boutique (chapeaux…) s'ajoutent dans `src/creatures/build.ts` (`addAccessories`).

## 6. Île réaliste

- `src/world/real/island.ts` : relief, tuiles peintes (texture 1024²), mer avec vagues, falaises et glace sur l'île de neige, nuages sur l'île des nuages.
- Le type d'île est déduit : au moins 30 % de tuiles neige ou nuage.
- 58 objets réalistes : 21 maisons, 16 éléments de nature, 21 objets et bateaux. Les bateaux sont posés à la ligne d'eau, vers y ≈ 0,05.
- Matériaux PBR partagés : `materials.ts`, `pbr()`.
- `flatten.ts` fusionne les objets par matériau pour la performance. Il garde les UV et les couleurs.
- Les animaux des amis se promènent sur l'île. Ils ne sont pas fusionnés, et `update(t)` les anime.

## 7. Vainc+ (abonnement)

- Le **compte vedette** (créateur) a tout gratuitement : heures illimitées et les 10 animaux Vainc+.
- Cadeau comme Snapchat+ : `create_gift_link()` crée un lien `gift/CODE`, et l'ami l'ouvre (`claim_gift`) pour avoir 7 jours d'essai.
  Quand on reçoit Vainc+, l'écran « tu as reçu » s'affiche (`unseen_plus` / `mark_plus_seen`).
- Pendant un essai, on peut quand même s'abonner. Le bouton « S'abonner à Vainc+ » est sur le **profil**, au-dessus de la section Vainc+ (`SubscribeBar`).
- Avantages : badges, titres, renommer l'animal, accessoire du mois, îles neige et nuages, stats détaillées, thèmes de chrono, groupes de 30, 2 jokers de série.

## 8. État actuel et choses à surveiller

- Dernier gros travail : **animaux et île réalistes**, sur `main`.
  - L'utilisateur doit lancer `supabase/mise-a-jour-animaux.sql` (et `mise-a-jour-cadeaux.sql` s'il ne l'a pas fait).
  - Je ne sais pas encore s'il l'a fait.
- **Pas encore testé sur iPhone**. Points à vérifier :
  - la vitesse de chargement de l'île (2 à 3 s sur ordinateur) et la fluidité ;
  - les effets fourrure, particules et mer dans expo-gl.
- Défauts connus :
  - les feuilles de palmier sont un peu plates ;
  - les cristaux roses brillent peu ;
  - la mer est toujours affichée ;
  - les ailes de la Légende serpent sont en partie cachées ;
  - les piques de l'aigle sont cachées par les plumes.
- Prochaine étape probable : l'utilisateur teste et envoie des captures, puis on corrige.

## 9. Outils pratiques (dans `vainc/`)

- `vainc/tests-sql/lancer-tests.sh` : tous les tests SQL.
- `vainc/outils/make_update.py` : régénère `supabase/mise-a-jour-tout.sql` depuis `schema.sql`.
- `vainc/apercu/apercu.sh <script.ts> <nom> [options]` : rend un aperçu 3D en PNG dans `/tmp/vainc-apercu/`. Exemples :
  - `scripts/real/preview.ts` avec `snake`, `wolf`, `eagle`, `island`, `catN:a-b` (espèces a à b) ou `acc` ;
  - `scripts/real/island-preview.ts` avec `g,n,c` ;
  - `scripts/real/decor-*-preview.ts`.
- Régénérer `admin.sql` :
  ```
  npx esbuild scripts/admin/make-admin-sql.ts --bundle --platform=node --outfile=/tmp/a.js && node /tmp/a.js > supabase/admin.sql
  ```

## 10. Historique résumé (du plus ancien au plus récent)

1. Chrono anti-triche, amis, classement, profil, partiels, groupes, vainc de groupe, push, mur de la honte, récap.
2. Pauses, réactions, rappel quotidien, joker de série.
3. Animaux 3D (ancienne version, 100 créatures avec raretés), porte-monnaie d'heures, boutique, bestiaire.
4. Île 16×16 → 32×32 avec mer et bateaux, édition comme Clash of Clans. Compte vedette avec boutique du jour.
5. To-do avec heures et date ; on change de to-do pendant le chrono (`todo_split`).
6. Vainc+ : badges, décorations, parrainage, essais à offrir, bonus, messages entre amis, mode partiels complet.
7. Cadeaux Vainc+ par lien, écran « tu as reçu », bouton S'abonner sur le profil.
8. **Refonte réaliste** : 40 animaux, 5 paliers avec éléments, île et objets réalistes, sans raretés.

## 11. Renommage Lockin → Vainc

L'app s'appelle maintenant **Vainc** (« lock in » devient « vainc » partout dans les textes, le code et la doc).
Deux noms techniques gardent l'ancien nom exprès, pour ne rien casser :
- la table Supabase `lockin_events` (renommer la table casserait la base déjà en place) ;
- le `slug` `lockin` dans `app.json` (il est lié au projet EAS, `extra.eas.projectId`).

Le dépôt GitHub s'appelle toujours `100-test` (à renommer à la main dans GitHub → Settings si besoin).
