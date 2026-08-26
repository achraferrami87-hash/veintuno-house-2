# Déploiement — Local & Vercel

Ce projet fonctionne aussi bien en local, sur Railway, ou sur Vercel — la seule différence est la base de données (Postgres partout désormais, plus de SQLite) et le stockage des images (Vercel Blob au lieu du disque local).

## 1. Lancer le projet en local

1. Crée une base Postgres gratuite sur [Neon](https://neon.tech) (ou Supabase / Vercel Postgres).
2. Copie `.env.example` en `.env` et renseigne :
   - `DATABASE_URL` — la connection string **pooled** de Neon (contient `-pooler` dans l'hôte).
   - `DIRECT_URL` — la connection string **directe** (sans pooler) — Neon te donne les deux.
   - `SESSION_SECRET` — une chaîne aléatoire longue.
   - `BLOB_READ_WRITE_TOKEN` — voir étape 3 (peut rester vide en local si tu ne testes pas les uploads).
3. Installe les dépendances et crée les tables :
   ```
   npm install
   npx prisma migrate deploy
   npm run seed:dev
   ```
4. Lance le serveur :
   ```
   npm run dev
   ```
   Le site tourne sur http://localhost:3000, dashboard sur http://localhost:3000/admin.

## 2. Déployer sur Vercel

1. Importe le repo GitHub dans [vercel.com/new](https://vercel.com/new) — Vercel détecte automatiquement le projet Node.
2. Dans **Settings → Environment Variables**, ajoute exactement les 4 variables listées dans `.env.example` (mêmes valeurs Neon qu'en local, ou une base Neon séparée dédiée à la production).
3. Dans **Storage**, clique **Create Database → Blob**, attache-le au projet — Vercel ajoute automatiquement `BLOB_READ_WRITE_TOKEN` pour toi (pas besoin de le copier manuellement).
4. Déploie. Vercel exécute `npm install` (qui lance `prisma generate` via `postinstall`) puis sert :
   - `/api/*` → la fonction serverless (`api/index.js`, qui est exactement le même code Express que sur Railway).
   - Tout le reste (`/`, `/admin/*.html`, `/css/*`, `/js/*`) → fichiers statiques, servis directement par Vercel.
5. **Important** : les migrations ne se lancent jamais automatiquement sur Vercel (contrairement à Railway). Avant le tout premier déploiement, lance une fois depuis ta machine :
   ```
   DATABASE_URL="..." DIRECT_URL="..." npx prisma migrate deploy
   ```
   en pointant vers la même base Postgres que celle configurée sur Vercel.

## 3. Migrer les données existantes (Railway → Neon/Vercel)

Si tu migres un site déjà en production sur Railway, contacte-moi avant de couper Railway : il faut d'abord copier les données (commandes, produits, clients...) de l'ancienne base SQLite vers la nouvelle base Postgres, et re-uploader les images existantes vers Vercel Blob — sinon elles seraient perdues.
