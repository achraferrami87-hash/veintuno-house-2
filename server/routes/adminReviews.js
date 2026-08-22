const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---------- Settings (site-wide review behavior) ----------
router.get('/settings', async (req, res) => {
  let settings = await prisma.reviewSettings.findFirst();
  if (!settings) settings = await prisma.reviewSettings.create({ data: {} });
  res.json(settings);
});

router.put('/settings', async (req, res) => {
  let settings = await prisma.reviewSettings.findFirst();
  if (!settings) settings = await prisma.reviewSettings.create({ data: {} });
  const body = req.body;
  const data = {};
  ['isEnabled', 'requireApproval', 'autoApprove', 'showCustomerName'].forEach((f) => {
    if (body[f] !== undefined) data[f] = !!body[f];
  });
  if (body.minRating !== undefined) data.minRating = Math.min(5, Math.max(1, Number(body.minRating) || 1));
  if (body.displayCount !== undefined) data.displayCount = Math.max(1, Number(body.displayCount) || 10);
  if (['recent', 'rating_high', 'rating_low', 'featured'].includes(body.sortOrder)) data.sortOrder = body.sortOrder;

  const updated = await prisma.reviewSettings.update({ where: { id: settings.id }, data });
  res.json(updated);
});

// ---------- Reviews list (filterable) ----------
router.get('/', async (req, res) => {
  const { status, productId, rating, search } = req.query;
  const where = {};
  if (status) where.status = status;
  if (productId) where.productId = productId;
  if (rating) where.rating = Number(rating);
  if (search) {
    where.OR = [
      { text: { contains: search } },
      { customerName: { contains: search } },
    ];
  }
  const reviews = await prisma.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, slug: true } }, order: { select: { orderNumber: true } } },
  });
  res.json(reviews);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  if (body.status !== undefined) {
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(body.status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    data.status = body.status;
  }
  if (body.featured !== undefined) data.featured = !!body.featured;
  if (body.text !== undefined) data.text = body.text || null;
  if (body.rating !== undefined) data.rating = Math.min(5, Math.max(1, Number(body.rating) || 1));
  if (body.customerName !== undefined) data.customerName = body.customerName || null;

  try {
    const updated = await prisma.review.update({ where: { id: req.params.id }, data });
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
