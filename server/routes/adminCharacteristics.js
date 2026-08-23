const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const characteristics = await prisma.characteristic.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  res.json(characteristics);
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom requis.' });
  const count = await prisma.characteristic.count();
  try {
    const characteristic = await prisma.characteristic.create({ data: { name, position: count } });
    res.status(201).json(characteristic);
  } catch (e) {
    res.status(400).json({ error: 'Cette caractéristique existe déjà.' });
  }
});

router.put('/:id', async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) data.name = req.body.name.trim();
  if (req.body.position !== undefined) data.position = Number(req.body.position);
  try {
    const characteristic = await prisma.characteristic.update({ where: { id: req.params.id }, data });
    res.json(characteristic);
  } catch (e) {
    res.status(404).json({ error: 'Caractéristique introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.characteristic.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Caractéristique introuvable.' });
  }
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.characteristic.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
