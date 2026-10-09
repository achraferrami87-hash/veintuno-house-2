// One-off migration: copy every media file still referenced from a Vercel
// Blob URL into Supabase Storage, then repoint the database rows at the new
// URL. Safe to re-run — anything already on Supabase (or already attempted
// and failed) is skipped/retried without re-uploading what succeeded.
//
// Run with:  node --env-file=.env scripts/migrate-media-to-supabase.js
//
// What it does NOT do: it never deletes the source Blob file, and it never
// overwrites a DB field unless the new copy is confirmed uploaded.
const { PrismaClient } = require('@prisma/client');
const { uploadBuffer, IMAGE_BUCKET, VIDEO_BUCKET } = require('../server/utils/mediaStorage');

const prisma = new PrismaClient();

const BLOB_HOST_RE = /blob\.vercel-storage\.com/;
const VIDEO_EXT_RE = /\.(mp4|webm|mov)(\?|$)/i;

// Every DB location that can hold a Blob URL. `plain` fields are a single
// string column; `json` fields are a JSON string column holding either an
// array of URLs (`shape: 'array'`) or an array of {name, image} objects
// (`shape: 'notes'`, used by the olfactory pyramid fields).
const TARGETS = [
  { model: 'collection', kind: 'plain', field: 'image' },
  { model: 'collection', kind: 'plain', field: 'bannerImage' },
  { model: 'product', kind: 'json', field: 'images', shape: 'array' },
  { model: 'product', kind: 'plain', field: 'videoUrl' },
  { model: 'product', kind: 'json', field: 'notesTopData', shape: 'notes' },
  { model: 'product', kind: 'json', field: 'notesHeartData', shape: 'notes' },
  { model: 'product', kind: 'json', field: 'notesBaseData', shape: 'notes' },
  { model: 'pack', kind: 'plain', field: 'image' },
  { model: 'heroSlide', kind: 'plain', field: 'imageUrl' },
  { model: 'heroSlide', kind: 'plain', field: 'videoUrl' },
  { model: 'homepageVideo', kind: 'plain', field: 'videoUrl' },
  { model: 'homepageVideo', kind: 'plain', field: 'posterImage' },
  { model: 'bundle', kind: 'plain', field: 'image' },
  { model: 'review', kind: 'plain', field: 'customerPhoto' },
  { model: 'review', kind: 'plain', field: 'customerVideo' },
  { model: 'siteSettings', kind: 'plain', field: 'instagramQrImage' },
];

function isBlobUrl(v) {
  return typeof v === 'string' && BLOB_HOST_RE.test(v);
}

// One shared cache: the same photo is often reused (e.g. a pack's image
// equal to its hero product's), so each distinct URL is only downloaded
// and re-uploaded once no matter how many rows/fields reference it.
const urlCache = new Map(); // oldUrl -> { status: 'migrated', newUrl } | { status: 'failed', reason }

async function migrateOneUrl(oldUrl) {
  if (urlCache.has(oldUrl)) return urlCache.get(oldUrl);
  let result;
  try {
    const res = await fetch(oldUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const isVideo = VIDEO_EXT_RE.test(oldUrl) || contentType.startsWith('video/');
    const bucket = isVideo ? VIDEO_BUCKET : IMAGE_BUCKET;
    const extMatch = /\.[a-z0-9]+(?:\?|$)/i.exec(oldUrl);
    const ext = extMatch ? extMatch[0].replace(/\?.*/, '') : (isVideo ? '.mp4' : '.jpg');
    const key = `migrated-${Date.now()}-${Math.random().toString(16).slice(2, 10)}${ext}`;
    const newUrl = await uploadBuffer(bucket, key, buffer, contentType);
    result = { status: 'migrated', newUrl, bucket };
  } catch (err) {
    result = { status: 'failed', reason: err.message || String(err) };
  }
  urlCache.set(oldUrl, result);
  return result;
}

function migrateJsonArray(raw) {
  let arr;
  try { arr = JSON.parse(raw || '[]'); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  return arr;
}

async function main() {
  const report = { migrated: [], failed: [], skipped: 0, rowsUpdated: 0 };

  for (const target of TARGETS) {
    const rows = await prisma[target.model].findMany();
    for (const row of rows) {
      const current = row[target.field];
      if (!current) continue;

      if (target.kind === 'plain') {
        if (!isBlobUrl(current)) { report.skipped += 1; continue; }
        const result = await migrateOneUrl(current);
        if (result.status === 'migrated') {
          await prisma[target.model].update({ where: { id: row.id }, data: { [target.field]: result.newUrl } });
          report.migrated.push({ model: target.model, id: row.id, field: target.field, from: current, to: result.newUrl });
          report.rowsUpdated += 1;
        } else {
          report.failed.push({ model: target.model, id: row.id, field: target.field, url: current, reason: result.reason });
        }
        continue;
      }

      // JSON fields
      const arr = migrateJsonArray(current);
      if (!arr || arr.length === 0) continue;
      let changed = false;
      const nextArr = [];
      for (const item of arr) {
        if (target.shape === 'array') {
          if (!isBlobUrl(item)) { nextArr.push(item); continue; }
          const result = await migrateOneUrl(item);
          if (result.status === 'migrated') {
            nextArr.push(result.newUrl);
            changed = true;
            report.migrated.push({ model: target.model, id: row.id, field: target.field, from: item, to: result.newUrl });
          } else {
            nextArr.push(item); // keep the old URL working rather than break the page
            report.failed.push({ model: target.model, id: row.id, field: target.field, url: item, reason: result.reason });
          }
        } else if (target.shape === 'notes') {
          if (!item || !isBlobUrl(item.image)) { nextArr.push(item); continue; }
          const result = await migrateOneUrl(item.image);
          if (result.status === 'migrated') {
            nextArr.push({ ...item, image: result.newUrl });
            changed = true;
            report.migrated.push({ model: target.model, id: row.id, field: target.field, from: item.image, to: result.newUrl });
          } else {
            nextArr.push(item);
            report.failed.push({ model: target.model, id: row.id, field: target.field, url: item.image, reason: result.reason });
          }
        }
      }
      if (changed) {
        await prisma[target.model].update({ where: { id: row.id }, data: { [target.field]: JSON.stringify(nextArr) } });
        report.rowsUpdated += 1;
      } else {
        report.skipped += 1;
      }
    }
  }

  console.log('\n=== Migration Supabase Storage — rapport ===');
  console.log(`Fichiers migrés avec succès : ${report.migrated.length}`);
  console.log(`Lignes de base de données mises à jour : ${report.rowsUpdated}`);
  console.log(`Champs déjà corrects / sans Blob (ignorés) : ${report.skipped}`);
  console.log(`Échecs (fichier Blob inaccessible) : ${report.failed.length}`);
  if (report.failed.length) {
    console.log('\n--- Détail des échecs (URL d’origine conservée, rien de cassé) ---');
    for (const f of report.failed) {
      console.log(`  [${f.model}#${f.id}.${f.field}] ${f.url} — ${f.reason}`);
    }
  }
  const fs = require('fs');
  const reportPath = require('path').join(__dirname, `migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nRapport complet écrit dans : ${reportPath}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Échec de la migration :', err);
  await prisma.$disconnect();
  process.exit(1);
});
