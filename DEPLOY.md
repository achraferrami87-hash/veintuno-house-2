# Déploiement — Local & Vercel

Ce projet fonctionne aussi bien en local, sur Railway, ou sur Vercel — la seule différence est la base de données (Postgres partout désormais, plus de SQLite) et le stockage des images (Vercel Blob au lieu du disque local).

Le projet Vercel (`ljordan/veintuno-house`), sa base Postgres (Neon, via l'intégration native Vercel Marketplace) et son store Blob sont déjà créés et connectés — voir statut actuel en bas de ce fichier.

## 1. Lancer le projet en local

1. Récupère les variables réelles avec `vercel env pull` (si le CLI est connecté), ou crée ta propre base Postgres gratuite sur [Neon](https://neon.tech).
2. Copie `.env.example` en `.env` et renseigne :
   - `DATABASE_URL` — la connection string **pooled** (contient `-pooler` dans l'hôte).
   - `DATABASE_URL_UNPOOLED` — la connection string **directe** (sans pooler), utilisée uniquement pour les migrations.
   - `SESSION_SECRET` — une chaîne aléatoire longue.
   - `BLOB_READ_WRITE_TOKEN` — voir étape 3 (peut rester vide en local si tu ne testes pas les uploads).
3. Installe les dépendances et crée les tables :
   ```
   npm install
   npx prisma migrate deploy
   ```
4. Lance le serveur :
   ```
   npm run dev
   ```
   Le site tourne sur http://localhost:3000, dashboard sur http://localhost:3000/admin.

## 2. Déployer sur Vercel

1. Le projet est déjà lié (`vercel link`) et les variables d'environnement déjà configurées (Postgres + Blob + SESSION_SECRET).
2. Déploiement : `vercel --prod`, ou laisser l'intégration GitHub déployer automatiquement à chaque push sur `master`.
3. Vercel exécute `npm install` (qui lance `prisma generate` via `postinstall`) puis route TOUTES les requêtes (`/`, `/api/*`, `/admin/*.html`, `/css/*`, `/js/*`) vers la fonction serverless unique (`api/index.js`, qui est exactement le même code Express que sur Railway) — pas de "Output Directory" séparé, donc pas d'erreur de build liée à ça.
4. **Important** : les migrations ne se lancent jamais automatiquement sur Vercel (contrairement à Railway). Après tout changement de `prisma/schema.prisma`, lance une fois depuis ta machine :
   ```
   npx prisma migrate deploy
   ```
   avec `DATABASE_URL` / `DATABASE_URL_UNPOOLED` pointant vers la même base que celle configurée sur Vercel (`vercel env pull` te les donne).

## 3. État de la migration des données (déjà faite)

- Toutes les données réelles de production (commandes, produits, clients, avis, quiz, fidélité, etc. — 33 tables) ont été copiées de l'ancienne base SQLite Railway vers Neon, vérifiées ligne par ligne (comptes identiques, relations intactes).
- **Découverte lors de la migration** : `UPLOADS_DIR` sur Railway pointait vers un chemin invalide (`C:/Program Files/Git/data/uploads`, un chemin Windows sur un serveur Linux) — les fichiers uploadés (3 photos produit : Creed Aventus, Stronger With You Intensely, Style Creed Aventus ; les 4 images de collection ; le QR code Instagram) avaient déjà disparu du volume Railway avant même cette migration, indépendamment de tout ce qui a été fait ici. Les références cassées (`/uploads/...` qui pointent vers rien) ont été nettoyées dans la nouvelle base Neon pour que le site affiche proprement le visuel de secours au lieu d'une icône d'image cassée. **Il faudra réuploader ces images une fois le dashboard Vercel testé et validé.**
- Le store Vercel Blob est créé et connecté ; tout nouvel upload (dashboard admin) y sera stocké correctement et de façon persistante — contrairement au bug ci-dessus.
