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
- **Notifications push** : relances, demandes d'amis, invitations, « Léa vient de lock in ».

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
  (tabs)/ranking.tsx     classement
src/components/          Avatar, anneau, listes, champs date/heure, boutons
src/lib/
  supabase.ts            connexion à Supabase
  auth.tsx               compte et profil
  social.tsx             amis, groupes, lock in de groupe, partiels (temps réel)
  store.tsx              session en cours, anti-triche
  notifications.ts       notifications push et rappels
  stats.ts               semaine, séries, badges, récap
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
