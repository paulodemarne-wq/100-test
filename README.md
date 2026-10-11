# Lockin 🔒

Révise avec tes potes. Ceux qui lâchent sont démasqués.

Lockin est une app de révision sociale : tu lances une session « Je bosse », tes amis te voient bosser en direct, et si tu quittes l'app pour aller sur TikTok, ils le savent.

## Version 1 (actuelle)

- **Accueil / onboarding** : pseudo + avatar emoji.
- **Je bosse** : choix de la matière, gros bouton, chrono en direct. L'écran reste allumé pendant la session.
- **Anti-triche** : quitter l'app plus de 10 s pendant une session = session abandonnée (visible par les amis). Une sortie plus courte donne un avertissement.
- **Amis** : qui bosse en ce moment, qui a abandonné, bouton « 📣 Viens bosser ! ».
- **Classement** de la semaine (remis à zéro le lundi) + série de jours 🔥.

Les amis sont pour l'instant **des amis de démo** et les données restent sur le téléphone. Les vrais comptes et vrais amis arriveront avec le backend (Supabase).

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
  onboarding.tsx         premier lancement
  (tabs)/index.tsx       « Je bosse » + chrono
  (tabs)/feed.tsx        fil des amis
  (tabs)/ranking.tsx     classement
src/lib/
  store.tsx              état de l'app, sessions, anti-triche, sauvegarde
  demoFriends.ts         faux amis (en attendant le backend)
  theme.ts, time.ts      couleurs, matières, formatage du temps
```

## Prochaines étapes

- [ ] Comptes et vrais amis (Supabase) : ajout par pseudo ou lien d'invitation
- [ ] Statuts en temps réel entre amis
- [ ] Notifications push (« Léa vient de commencer à bosser », relances)
- [ ] Icône et écran de démarrage Lockin
- [ ] Publication sur l'App Store avec EAS (`npx eas-cli build` / `submit`)
