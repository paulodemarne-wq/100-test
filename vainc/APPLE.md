# Mettre Vainc sur l'App Store : où on en est

## Déjà fait dans le code
- **Supprimer son compte** dans l'app (Profil → Supprimer mon compte, avec deux confirmations). Règle Apple 5.1.1(v).
- **Signaler et bloquer** : menu « … » dans une conversation, appui long sur un message pour le signaler. Les signalements arrivent dans la table `reports` de Supabase (Table Editor). Règle Apple 1.2.
- **Filtre de mots interdits** sur les messages, pseudos, noms, libellés de sessions, noms de groupes et d'animaux (`is_clean_text` dans `schema.sql`). Liste à compléter si besoin.
- **Politique de confidentialité et conditions** : écran dans l'app (Profil → Sécurité et confidentialité) + pages web dans `docs/` (générées par `scripts/legal/make-legal.ts`).
- `app.json` : `bundleIdentifier` `com.paulodemarne.vainc` (à changer avant le 1er envoi si tu veux un autre nom), `ITSAppUsesNonExemptEncryption: false`.
- `eas.json` : profils `development`, `preview`, `production`.

## À faire par toi
1. **Compte Apple Developer** : 99 $ / an, https://developer.apple.com/programs/enroll/
2. **Adresse e-mail de contact** : la mettre dans `src/lib/config.ts` (`SUPPORT_EMAIL`), puis régénérer les pages :
   `npx esbuild scripts/legal/make-legal.ts --bundle --platform=node --outfile=/tmp/legal.js && node /tmp/legal.js`
3. **Publier les pages** : GitHub → dépôt → Settings → Pages → Branch `main`, dossier `/docs`. Les liens deviennent
   `https://paulodemarne-wq.github.io/100-test/privacy.html` (et `terms.html`). Le premier sert d'« URL de politique de confidentialité » dans App Store Connect.
4. **Premier envoi** (une fois le compte Apple actif) :
   ```
   npx eas-cli@latest login
   npx eas-cli@latest build --platform ios --profile production
   npx eas-cli@latest submit --platform ios --profile production
   ```
   Puis tester avec **TestFlight** (app Apple « TestFlight » sur l'iPhone).
5. **Fiche App Store Connect** : nom, description, mots-clés, captures d'écran iPhone, catégorie (Productivité ou Éducation), URL de confidentialité, URL d'assistance, **classe d'âge** (réponds honnêtement : chat entre utilisateurs → 12+ ou 13+), **étiquettes de confidentialité** (e-mail, nom, photo, contenu utilisateur/messages, identifiant d'appareil pour les notifications, historique d'utilisation = liés à l'identité, non utilisés pour le pistage).
6. **Compte de test pour Apple** : crée un compte (e-mail + mot de passe) avec quelques amis, et donne-le dans « Notes pour l'examen ».

## Pas encore fait (bloquant pour l'App Store)
- **Abonnement Vainc+ avec Apple (achat intégré)** : aujourd'hui le paiement n'est pas branché. Il faut le compte Apple Developer, créer l'abonnement dans App Store Connect, puis brancher (par exemple RevenueCat ou `expo-iap`, qui demandent un build de développement, pas Expo Go) et ajouter « Restaurer mes achats ».
- **Cadeaux / essais par lien** : Apple peut refuser un abonnement débloqué hors achat intégré. À vérifier avec eux, ou à remplacer par les « offres promotionnelles » d'Apple.
- **Commission d'Apple** sur l'abonnement (15 ou 30 % selon ton programme, à vérifier).
