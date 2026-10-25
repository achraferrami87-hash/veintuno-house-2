const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { startAt: 'desc' },
    include: { _count: { select: { products: true } } },
  });
  res.json(campaigns);
});

router.get('/:id/products', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { campaignId: req.params.id },
    select: { id: true, name: true, slug: true, price: true, flashSaleActive: true, flashSalePrice: true },
  });
  res.json(products);
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const startAt = req.body.startAt ? new Date(req.body.startAt) : null;
  const endAt = req.body.endAt ? new Date(req.body.endAt) : null;
  if (!name || !startAt || !endAt) return res.status(400).json({ error: 'Nom, date de début et date de fin requis.' });
  const campaign = await prisma.campaign.create({
    data: {
      name,
      description: req.body.description || null,
      bannerImage: req.body.bannerImage || null,
      startAt, endAt,
      isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
      showOnHomepage: req.body.showOnHomepage !== undefined ? !!req.body.showOnHomepage : true,
      showOnProductCards: req.body.showOnProductCards !== undefined ? !!req.body.showOnProductCards : true,
      showOnProductPage: req.body.showOnProductPage !== undefined ? !!req.body.showOnProductPage : true,
      showOnBundles: req.body.showOnBundles !== undefined ? !!req.body.showOnBundles : true,
    },
  });
  res.status(201).json(campaign);
});

router.put('/:id', async (req, res) => {
  const data = {};
  for (const key of ['name', 'description', 'bannerImage']) {
    if (req.body[key] !== undefined) data[key] = req.body[key] || null;
  }
  if (req.body.startAt !== undefined) data.startAt = new Date(req.body.startAt);
  if (req.body.endAt !== undefined) data.endAt = new Date(req.body.endAt);
  for (const key of ['isActive', 'showOnHomepage', 'showOnProductCards', 'showOnProductPage', 'showOnBundles']) {
    if (req.body[key] !== undefined) data[key] = !!req.body[key];
  }
  try {
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data });
    res.json(campaign);
  } catch (e) {
    res.status(404).json({ error: 'Campagne introuvable.' });
  }
});

// Bulk-assign/unassign which products belong to this campaign — the
// campaign only groups+schedules; each product's own flashSale* fields
// still decide its actual discounted price (set separately in the
// product editor), so this never writes a price.
router.put('/:id/products', async (req, res) => {
  const { productIds } = req.body;
  if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds requis.' });
  await prisma.product.updateMany({ where: { campaignId: req.params.id }, data: { campaignId: null } });
  if (productIds.length) {
    await prisma.product.updateMany({ where: { id: { in: productIds } }, data: { campaignId: req.params.id } });
  }
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.updateMany({ where: { campaignId: req.params.id }, data: { campaignId: null } });
    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Campagne introuvable.' });
  }
});

module.exports = router;
