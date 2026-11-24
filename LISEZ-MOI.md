# B.Zik — guide GitHub complet (sans terminal)

Tout se fait dans le NAVIGATEUR du téléphone (Chrome > menu ⋮ > "Version pour ordinateur"),
PAS dans l'app GitHub.

## ETAPE 1 — Créer ton repo privé
1. Connecte-toi sur github.com avec le compte alphakorner.
2. Ouvre https://github.com/new/import
3. "Your old repository's clone URL" : https://github.com/justshivv/Opentune
4. Owner : alphakorner | Repository name : B.Zik (exactement, avec la majuscule et le point) | choisis **Private**
5. Begin import. Attends la fin (quelques minutes), puis ouvre le repo.

## ETAPE 2 — Activer les Actions
Onglet **Actions** > si un bandeau apparaît : "I understand my workflows, go ahead and enable them".

## ETAPE 3 — Envoyer les 6 fichiers (4 envois)
Pour chaque ligne : ouvre le dossier dans le repo > **Add file** > **Upload files** >
choisis le/les fichiers (décompresse d'abord le ZIP) > **Commit changes**.
Un fichier de même nom est remplacé.

| Dossier à ouvrir | Fichier(s) |
|---|---|
| .github/workflows | release.yml |
| app/src/main | AndroidManifest.xml |
| app/src/main/java/com/opentune/ui/settings | SettingsLayout.kt, LinkDeviceScreen.kt, SettingsScreen.kt |
| app/src/main/java/com/opentune/ui/account | PairingDialogs.kt |

## ETAPE 4 — Lancer le build
1. Onglet **Actions** > à gauche "B.Zik Release" > **Run workflow** > bouton vert Run workflow.
2. Attends 15 à 25 min (rond jaune = en cours, coche verte = fini).
3. Au 1er build, la clé de signature est créée toute seule et enregistrée
   dans le fichier `alphakorner-signing.env` du repo. NE LE SUPPRIME JAMAIS.
4. Si rond rouge : ouvre le run > clique l'étape en erreur > envoie-moi le texte.

## ETAPE 5 — Installer
1. Onglet **Releases** (colonne de droite du repo) > dernière version.
2. Télécharge `B.Zik-v1.1.0-arm64-v8a.apk` (bon pour presque tous les téléphones récents).
3. Ouvre-le, autorise "installer des apps inconnues" pour ton navigateur, installe.
   (TV : `B.Zik-TV-v1.1.0.apk`.)
4. Si OpenTune d'origine est installé : désinstalle-le d'abord (même identifiant, autre signature).

## Mises à jour futures
Change le numéro dans app/build.gradle.kts (versionName), puis refais l'étape 4.
Le repo privé exige d'être connecté à GitHub pour télécharger.

## Ce qui est modifié
- Nom partout : OpenTune -> B.Zik (icône, écrans, textes, noms d'APK), fait pendant le build.
- Développeurs : Brice Jacotet | contact strassweb67@gmail.com | alpha-korner.com
- URLs, liens de partage, mise à jour intégrée : justshivv -> alphakorner/B.Zik
- Contrôle SHA-256 de l'ancienne clé retiré (la signature reste active)
- Licence GPL-3.0 : garde les fichiers LICENSE et en-têtes de copyright, code source public si tu distribues.
