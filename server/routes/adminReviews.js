const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const status = req.query.status;
  const where = status ? { status } : {};
  const reviews = await prisma.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, slug: true } }, order: { select: { orderNumber: true } } },
  });
  res.json(reviews);
});

router.put('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  try {
    const updated = await prisma.review.update({ where: { id: req.params.id }, data: { status } });
    res.json(updated);
  } catch (e) {
    res.status(404).json({ error: 'Avis introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Avis introuvable.' });
  }
});

module.exports = router;
