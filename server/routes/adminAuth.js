const express = require('express');
const prisma = require('../db');
const { verifyPassword, hashPassword } = require('../utils/password');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

  const admin = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!admin || !verifyPassword(password, admin.passwordHash, admin.passwordSalt)) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  req.session.adminUserId = admin.id;
  res.json({ id: admin.id, email: admin.email, name: admin.name });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAdmin, async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.session.adminUserId } });
  if (!admin) return res.status(401).json({ error: 'Non authentifié.' });
  res.json({ id: admin.id, email: admin.email, name: admin.name });
});

router.put('/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Mot de passe invalide (min. 8 caractères).' });
  }
  const admin = await prisma.adminUser.findUnique({ where: { id: req.session.adminUserId } });
  if (!verifyPassword(currentPassword, admin.passwordHash, admin.passwordSalt)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  const { hash, salt } = hashPassword(newPassword);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: hash, passwordSalt: salt } });
  res.json({ ok: true });
});

module.exports = router;
