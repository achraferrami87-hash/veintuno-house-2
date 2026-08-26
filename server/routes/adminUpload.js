const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { put } = require('@vercel/blob');

const router = express.Router();

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm']);

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

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  try {
    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });
    res.status(201).json({ url: blob.url });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'envoi du fichier." });
  }
});

module.exports = router;
