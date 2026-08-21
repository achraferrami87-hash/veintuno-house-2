const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { eligibleProducts: true, eligiblePacks: true, eligibleCollections: true, _count: { select: { orders: true } } },
  });
  res.json(codes);
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body.code || !body.type || body.value == null) {
    return res.status(400).json({ error: 'Code, type et valeur requis.' });
  }
  try {
    const promo = await prisma.promoCode.create({
      data: {
        code: body.code.trim().toUpperCase(),
        type: body.type,
        value: Number(body.value),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        usageLimit: body.usageLimit != null && body.usageLimit !== '' ? Number(body.usageLimit) : null,
        minOrderAmount: body.minOrderAmount != null && body.minOrderAmount !== '' ? Number(body.minOrderAmount) : null,
        isActive: body.isActive !== false,
      },
    });
    await attachEligibility(promo.id, body);
    res.status(201).json(promo);
  } catch (e) {
    res.status(400).json({ error: 'Ce code promo existe déjà.' });
  }
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  if (body.code !== undefined) data.code = body.code.trim().toUpperCase();
  if (body.type !== undefined) data.type = body.type;
  if (body.value !== undefined) data.value = Number(body.value);
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit === '' || body.usageLimit === null ? null : Number(body.usageLimit);
  if (body.minOrderAmount !== undefined) data.minOrderAmount = body.minOrderAmount === '' || body.minOrderAmount === null ? null : Number(body.minOrderAmount);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  try {
    const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data });
    await attachEligibility(promo.id, body, true);
    res.json(promo);
  } catch (e) {
    res.status(404).json({ error: 'Code promo introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.promoCode.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Code promo introuvable.' });
  }
});

async function attachEligibility(promoCodeId, body, clearFirst) {
  if (Array.isArray(body.eligibleProductIds)) {
    if (clearFirst) await prisma.promoCodeProduct.deleteMany({ where: { promoCodeId } });
    if (body.eligibleProductIds.length) {
      await prisma.promoCodeProduct.createMany({ data: body.eligibleProductIds.map((productId) => ({ promoCodeId, productId })) });
    }
  }
  if (Array.isArray(body.eligiblePackIds)) {
    if (clearFirst) await prisma.promoCodePack.deleteMany({ where: { promoCodeId } });
    if (body.eligiblePackIds.length) {
      await prisma.promoCodePack.createMany({ data: body.eligiblePackIds.map((packId) => ({ promoCodeId, packId })) });
    }
  }
  if (Array.isArray(body.eligibleCollectionIds)) {
    if (clearFirst) await prisma.promoCodeCollection.deleteMany({ where: { promoCodeId } });
    if (body.eligibleCollectionIds.length) {
      await prisma.promoCodeCollection.createMany({ data: body.eligibleCollectionIds.map((collectionId) => ({ promoCodeId, collectionId })) });
    }
  }
}

module.exports = router;
