const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---------- Classic packs ----------
router.get('/', async (req, res) => {
  const packs = await prisma.pack.findMany({
    include: { collection: true, eligibleProducts: { include: { product: true } } },
    orderBy: [{ collectionId: 'asc' }, { position: 'asc' }],
  });
  res.json(packs);
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body.name || !body.collectionId || !body.size || body.price == null) {
    return res.status(400).json({ error: 'Nom, collection, taille et prix requis.' });
  }
  const count = await prisma.pack.count({ where: { collectionId: body.collectionId } });
  const pack = await prisma.pack.create({
    data: {
      name: body.name,
      size: Number(body.size),
      price: Number(body.price),
      isCustomizable: body.isCustomizable !== false,
      useCollectionEligibility: body.useCollectionEligibility !== false,
      isActive: body.isActive !== false,
      position: count,
      collectionId: body.collectionId,
    },
  });
  if (!pack.useCollectionEligibility && Array.isArray(body.eligibleProductIds)) {
    await prisma.packProduct.createMany({
      data: body.eligibleProductIds.map((productId) => ({ packId: pack.id, productId })),
    });
  }
  res.status(201).json(pack);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['name', 'collectionId'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  ['size', 'price', 'position'].forEach((f) => { if (body[f] !== undefined) data[f] = Number(body[f]); });
  ['isCustomizable', 'useCollectionEligibility', 'isActive'].forEach((f) => { if (body[f] !== undefined) data[f] = !!body[f]; });

  try {
    const pack = await prisma.pack.update({ where: { id: req.params.id }, data });
    if (Array.isArray(body.eligibleProductIds)) {
      await prisma.packProduct.deleteMany({ where: { packId: pack.id } });
      await prisma.packProduct.createMany({
        data: body.eligibleProductIds.map((productId) => ({ packId: pack.id, productId })),
      });
    }
    res.json(pack);
  } catch (e) {
    res.status(404).json({ error: 'Pack introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.pack.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Impossible de supprimer ce pack (probablement référencé dans des commandes).' });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  const original = await prisma.pack.findUnique({ where: { id: req.params.id }, include: { eligibleProducts: true } });
  if (!original) return res.status(404).json({ error: 'Pack introuvable.' });
  const { id, createdAt, updatedAt, eligibleProducts, ...rest } = original;
  const copy = await prisma.pack.create({ data: { ...rest, name: `${original.name} (copie)`, isActive: false } });
  if (eligibleProducts.length) {
    await prisma.packProduct.createMany({
      data: eligibleProducts.map((r) => ({ packId: copy.id, productId: r.productId })),
    });
  }
  res.status(201).json(copy);
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.pack.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

// ---------- Free Pack config ----------
router.get('/free-pack/config', async (req, res) => {
  let config = await prisma.freePackConfig.findFirst({
    include: { eligibleCollections: true, eligibleProducts: true },
  });
  if (!config) {
    config = await prisma.freePackConfig.create({ data: { name: 'FREE PACK', minItems: 3 } });
    config.eligibleCollections = [];
    config.eligibleProducts = [];
  }
  res.json(config);
});

router.put('/free-pack/config', async (req, res) => {
  const body = req.body;
  let config = await prisma.freePackConfig.findFirst();
  if (!config) config = await prisma.freePackConfig.create({ data: { name: 'FREE PACK', minItems: 3 } });

  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.minItems !== undefined) data.minItems = Number(body.minItems);
  if (body.allowMixCategories !== undefined) data.allowMixCategories = !!body.allowMixCategories;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.priceThreshold !== undefined) data.priceThreshold = Number(body.priceThreshold);
  if (body.flatPrice !== undefined) data.flatPrice = Number(body.flatPrice);
  if (body.perfumePrice !== undefined) data.perfumePrice = Number(body.perfumePrice);
  if (body.gelDouchePrice !== undefined) data.gelDouchePrice = Number(body.gelDouchePrice);

  await prisma.freePackConfig.update({ where: { id: config.id }, data });

  if (Array.isArray(body.eligibleCollectionIds)) {
    await prisma.freePackEligibleCollection.deleteMany({ where: { freePackConfigId: config.id } });
    await prisma.freePackEligibleCollection.createMany({
      data: body.eligibleCollectionIds.map((collectionId) => ({ freePackConfigId: config.id, collectionId })),
    });
  }
  if (Array.isArray(body.eligibleProductIds)) {
    await prisma.freePackEligibleProduct.deleteMany({ where: { freePackConfigId: config.id } });
    await prisma.freePackEligibleProduct.createMany({
      data: body.eligibleProductIds.map((productId) => ({ freePackConfigId: config.id, productId })),
    });
  }

  const updated = await prisma.freePackConfig.findUnique({
    where: { id: config.id },
    include: { eligibleCollections: true, eligibleProducts: true },
  });
  res.json(updated);
});

module.exports = router;
