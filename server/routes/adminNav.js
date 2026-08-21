const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const items = await prisma.navMenuItem.findMany({ orderBy: { position: 'asc' } });
  res.json(items);
});

router.post('/', async (req, res) => {
  const { label, href } = req.body;
  if (!label || !href) return res.status(400).json({ error: 'Label et lien requis.' });
  const count = await prisma.navMenuItem.count();
  const item = await prisma.navMenuItem.create({ data: { label, href, position: count } });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['label', 'href'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.position !== undefined) data.position = Number(body.position);
  try {
    const item = await prisma.navMenuItem.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (e) { res.status(404).json({ error: 'Élément introuvable.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.navMenuItem.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(404).json({ error: 'Élément introuvable.' }); }
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.navMenuItem.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
