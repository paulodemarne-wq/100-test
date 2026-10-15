# Dossier `vainc/` — pour continuer dans un nouveau chat

Ce dossier garde la mémoire du projet. Ainsi, une nouvelle conversation avec Claude peut reprendre exactement là où on s'est arrêté.

## Comment reprendre dans un nouveau chat

1. Ouvre un nouveau chat Claude Code sur le dépôt **paulodemarne-wq/100-test**.
2. Colle ce message :

   > Lis vainc/CONTEXTE.md en entier, c'est tout le contexte de mon app Vainc et la façon dont je veux qu'on travaille. Ensuite on continue.

   Claude le lit aussi automatiquement grâce au fichier `CLAUDE.md` à la racine, mais ce message assure le coup.

## Ce qu'il y a dedans

| Fichier | À quoi ça sert |
|---|---|
| `CONTEXTE.md` | Le projet, tes préférences, l'organisation du code, la base de données, les animaux, l'île, Vainc+, ce qui reste à tester |
| `tests-sql/` | Tous les tests de la base de données. Lancer : `bash vainc/tests-sql/lancer-tests.sh` |
| `outils/make_update.py` | Refait `supabase/mise-a-jour-tout.sql` |
| `apercu/` | Fait des images des animaux et de l'île sans téléphone : `bash vainc/apercu/apercu.sh scripts/real/preview.ts nom snake` |

Pense à mettre à jour `CONTEXTE.md` (ou à demander à Claude de le faire) après chaque grosse nouveauté.
