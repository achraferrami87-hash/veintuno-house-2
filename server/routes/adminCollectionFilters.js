const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const where = {};
  if (req.query.collectionId) where.collectionId = req.query.collectionId;
  const options = await prisma.collectionFilterOption.findMany({ where, orderBy: { position: 'asc' } });
  res.json(options);
});

router.post('/', async (req, res) => {
  const { collectionId, label } = req.body;
  const trimmed = (label || '').trim();
  if (!collectionId || !trimmed) return res.status(400).json({ error: 'Collection et libellé requis.' });
  const count = await prisma.collectionFilterOption.count({ where: { collectionId } });
  const option = await prisma.collectionFilterOption.create({ data: { collectionId, label: trimmed, position: count } });
  res.status(201).json(option);
});

router.put('/:id', async (req, res) => {
  const data = {};
  if (req.body.label !== undefined) data.label = req.body.label.trim();
  if (req.body.position !== undefined) data.position = Number(req.body.position);
  try {
    const option = await prisma.collectionFilterOption.update({ where: { id: req.params.id }, data });
    res.json(option);
  } catch (e) {
    res.status(404).json({ error: 'Option de filtre introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.collectionFilterOption.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Option de filtre introuvable.' });
  }
});

module.exports = router;
