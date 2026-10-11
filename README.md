# Lockin 🔒

Révise avec tes potes. Ceux qui lâchent sont démasqués.

Lockin est une app de révision sociale : tu lances une session « Je bosse », tes amis te voient bosser en direct, et si tu quittes l'app pour aller sur TikTok, ils le savent.

## Fonctionnalités

- **Compte** : e-mail + mot de passe, puis prénom, pseudo et photo de profil.
- **Focus** : sujet libre et facultatif (« Compta »…), chrono dans un anneau (blocs de 25 min), écran toujours allumé.
- **Anti-triche** : plus de 10 s hors de l'app pendant une session = abandon, visible par les amis.
- **Amis** : ajout par pseudo, qui est en lock in en direct, qui a craqué, bouton « Relancer ».
- **Lock in de groupe** : « On lock in à 20 h ? » avec invitations, rappel à l'heure, suivi en direct et « premier qui craque 💀 ».
- **Groupes de promo** : créer ou rejoindre un groupe avec un code, classement du groupe.
- **Classement** de la semaine (amis ou groupe), séries 🔥 et **mur de la honte**.
- **Profil** : objectif d'heures de la semaine, **mode partiels** (compte à rebours + heures faites), **badges**, réglages des notifications.
- **Récap de la semaine** partageable en image (story).
- **Notifications push** : relances, demandes d'amis, invitations, réactions, « Léa vient de lock in ».
- **Pause** : durée au choix, le chrono s'arrête, on peut quitter l'app ; notif 1 min avant la fin.
- **To-do de session** : liste de tâches à cocher, visible par les amis (« 3/4 tâches »).
- **Ambiances sonores** : pluie, bruit blanc, bruit brun (sons générés, libres de droits).
- **Réactions** 🔥 💪 🫡 💀 😴 sur les sessions des amis, **couronne 👑** pour le n°1 de la semaine.
- **Mon animal** 🐾 : un œuf qui éclot en un des **100 animaux** (16 corps différents : slime, golem, dragon, pieuvre, escargot…), à faire tourner en 3D.
  Il gagne l'expérience de tes sessions : **40 niveaux**, un changement visible à chaque niveau, 3 formes d'évolution,
  et les paliers Bébé → Rare → Super rare → Épique → Mythique → Légendaire. Le niveau max demande ~2 190 h (2 ans à 3 h/jour).
- **Mon île** 🏝️ : une île de 16×16 cases à décorer comme on veut : peindre le sol (herbe, chemin, pavés, eau, sable, neige, nuages…)
  et poser jusqu'à 150 objets (maisons, arbres, clôtures, bancs, feu de camp, fontaine, château…). Un objet débloqué se pose autant de fois qu'on veut.
  **Les animaux de tous tes amis se promènent sur ton île**, et tu peux aller visiter la leur.
- **Boutique** : chaque heure de lock in se dépense en accessoires et objets d'île (gratuit, puis 10 h → légendaire 400 h) ou en nouvel œuf (100 h). **Bestiaire** des 100 animaux.
- **Rappel quotidien** à l'heure choisie et **joker de série** : un jour raté par mois est pardonné.

## Backend (Supabase)

Les comptes, amis, sessions et photos sont stockés sur [Supabase](https://supabase.com).
Le schéma de la base est dans `supabase/schema.sql` : à exécuter dans **SQL Editor** après chaque mise à jour (on peut le relancer sans risque).
Les notifications push sont envoyées par la base elle-même (extension `pg_net` → service Expo Push) et nécessitent un `projectId` EAS dans `app.json`.
La sécurité repose sur les règles « row level security » de ce fichier : chacun ne voit que ses sessions et celles de ses amis.

## Tester sur ton iPhone (sans Mac)

1. Installe **Expo Go** depuis l'App Store sur ton iPhone.
2. Sur un ordinateur (Windows, Mac ou Linux) avec [Node.js](https://nodejs.org) installé :
   ```bash
   git clone https://github.com/paulodemarne-wq/100-test.git
   cd 100-test
   npm install
   npx expo start
   ```
3. Scanne le QR code affiché avec l'appareil photo de ton iPhone : l'app s'ouvre dans Expo Go.

Le téléphone et l'ordinateur doivent être sur le même Wi-Fi (sinon : `npx expo start --tunnel`).

## Structure

```
assets/sounds/           ambiances, générées par scripts/generate_sounds.py
src/app/                 écrans (Expo Router : chaque fichier = un écran)
  _layout.tsx            racine (+ notifications)
  login.tsx              connexion / création de compte
  setup-profile.tsx      prénom, pseudo, photo
  add-friend.tsx         ajouter un ami par pseudo
  profile.tsx            objectif, partiels, badges, réglages
  new-event.tsx          créer un lock in de groupe
  event/[id].tsx         lock in de groupe en direct
  groups.tsx             groupes de promo (code d'invitation)
  recap.tsx              récap de la semaine à partager
  (tabs)/index.tsx       écran Focus + chrono
  (tabs)/feed.tsx        fil des amis
  (tabs)/pet.tsx         mon animal 3D, accessoires, collection
  (tabs)/ranking.tsx     classement
  shop.tsx, bestiary.tsx boutique et bestiaire
  world.tsx              l'île : visite, amis qui s'y promènent, mode Modifier
src/creatures/           100 espèces, niveaux, boutique (species.ts) modèles 3D (build.ts)
src/world/               l'île : données (world.ts), objets 3D (decor.ts), scène et caméra (scene.ts)
src/components/          PetView et WorldView (3D), Avatar, anneau, listes, date/heure, pause, tâches, sons, réactions
src/lib/
  supabase.ts            connexion à Supabase
  auth.tsx               compte et profil
  social.tsx             amis, groupes, lock in de groupe, partiels (temps réel)
  store.tsx              session en cours, anti-triche
  notifications.ts       notifications push et rappels
  stats.ts               semaine, séries + joker, badges, récap
  reminder.ts            réglage du rappel quotidien
  labels.ts              textes de statut, dates
  photo.ts               choix de la photo de profil
  theme.ts, time.ts      couleurs, typo, formatage du temps
```

## Prochaines étapes

- [x] Comptes et vrais amis (Supabase)
- [x] Statuts en temps réel entre amis
- [x] Notifications push, groupes, lock in de groupe, partiels, badges, récap
- [x] Design clair façon iOS
- [ ] Icône et écran de démarrage Lockin
- [ ] Publication sur l'App Store avec EAS (`npx eas-cli build` / `submit`)
