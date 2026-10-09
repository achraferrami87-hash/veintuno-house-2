const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { uploadBuffer, createSignedUploadUrl, IMAGE_BUCKET, VIDEO_BUCKET } = require('../utils/mediaStorage');

const router = express.Router();

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov']);
const ALLOWED_VIDEO = new Set(['.mp4', '.webm', '.mov']);

// Files are held in memory just long enough to stream to Blob storage —
// nothing is ever written to the server's own (ephemeral, serverless-unsafe)
// filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('Type de fichier non autorisé.'));
    cb(null, true);
  },
});

const STILL_IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  let ext = path.extname(req.file.originalname).toLowerCase();
  let buffer = req.file.buffer;
  let contentType = req.file.mimetype;
  try {
    if (STILL_IMAGE.has(ext)) {
      buffer = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      ext = '.webp';
      contentType = 'image/webp';
    }
  } catch (err) {
    return res.status(400).json({ error: 'Image illisible.' });
  }
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  try {
    const url = await uploadBuffer(IMAGE_BUCKET, filename, buffer, contentType);
    res.status(201).json({ url });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'envoi du fichier." });
  }
});

// Browser-direct uploads: the file never passes through this serverless
// function (Vercel caps request bodies at ~4.5 MB), so videos of any practical
// size go straight to storage. This route only issues a short-lived signed
// URL — the browser then PUTs the file straight to it (see admin-shared.js).
router.post('/client', async (req, res) => {
  try {
    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'Nom de fichier manquant.' });
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_VIDEO.has(ext)) return res.status(400).json({ error: 'Type de fichier non autorisé.' });
    const key = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const { token, path: storagePath, publicUrl } = await createSignedUploadUrl(VIDEO_BUCKET, key);
    // The browser uploads directly to Supabase using this token — it also
    // needs the project URL and the public anon key to do so (same as any
    // client-side Supabase call; the anon key is meant to be public).
    res.json({
      token,
      path: storagePath,
      bucket: VIDEO_BUCKET,
      url: publicUrl,
      contentType: contentType || 'application/octet-stream',
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Autorisation d'envoi refusée." });
  }
});

module.exports = router;
