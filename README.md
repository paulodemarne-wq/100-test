# Lockin 🔒

Révise avec tes potes. Ceux qui lâchent sont démasqués.

Lockin est une app de révision sociale : tu lances une session « Je bosse », tes amis te voient bosser en direct, et si tu quittes l'app pour aller sur TikTok, ils le savent.

## Fonctionnalités

- **Compte** : e-mail + mot de passe, puis prénom, pseudo et photo de profil.
- **Focus** : sujet libre et facultatif (« partiel de compta »…), chrono en direct dans un anneau de progression (blocs de 25 min). L'écran reste allumé pendant la session.
- **Anti-triche** : quitter l'app plus de 10 s pendant une session = session abandonnée (visible par les amis). Une sortie plus courte donne un avertissement.
- **Amis** : ajout par pseudo, demandes à accepter, qui bosse en direct, qui a abandonné, bouton « Relancer ».
- **Classement** de la semaine entre amis (remis à zéro le lundi) + série de jours 🔥.

## Backend (Supabase)

Les comptes, amis, sessions et photos sont stockés sur [Supabase](https://supabase.com).
Le schéma de la base est dans `supabase/schema.sql` : à exécuter une fois dans **SQL Editor** (on peut le relancer sans risque après une mise à jour).
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
  _layout.tsx            racine
  login.tsx              connexion / création de compte
  setup-profile.tsx      prénom, pseudo, photo
  add-friend.tsx         ajouter un ami par pseudo
  (tabs)/index.tsx       écran Focus + chrono
  (tabs)/feed.tsx        fil des amis
  (tabs)/ranking.tsx     classement
src/components/          Avatar, anneau de progression, boutons et champs
src/lib/
  supabase.ts            connexion à Supabase
  auth.tsx               compte et profil
  social.tsx             amis, sessions des amis, relances (temps réel)
  store.tsx              session en cours, anti-triche
  stats.ts               total de la semaine, séries
  photo.ts               choix de la photo de profil
  theme.ts, time.ts      couleurs, typo, formatage du temps
```

## Prochaines étapes

- [x] Comptes et vrais amis (Supabase)
- [x] Statuts en temps réel entre amis
- [ ] Notifications push (« Léa vient de commencer à bosser », relances)
- [x] Design clair façon iOS
- [ ] Icône et écran de démarrage Lockin
- [ ] Publication sur l'App Store avec EAS (`npx eas-cli build` / `submit`)
