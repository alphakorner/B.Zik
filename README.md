# App Zik Brice

Lecteur de musique YouTube Music, sans pub, en application web installable (PWA) et en APK Android.

**Application web :** https://alphakorner.github.io/B.Zik/player/

## Fonctionnalités
- Recherche, accueil, nouveautés et lecture audio seule (sans vidéo)
- Installable sur l'écran d'accueil du téléphone
- Proxy Cloudflare Worker dédié (`proxy/worker.js`)

## Développement
```
cd web/app
pnpm install
pnpm dev
```
Le déploiement GitHub Pages se fait automatiquement à chaque push sur `main` (workflow « B.Zik Web »).

## Licence
Logiciel libre sous licence GPL-3.0 : voir [LICENSE](LICENSE) et [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

© Brice Jacotet — Alpha Korner / Groupe Alpha Nex Strasbourg
