const express = require('express');
const prisma = require('../db');

const router = express.Router();

function slugify(str) {
  const normalized = str.toString().toLowerCase().trim().normalize('NFD');
  let stripped = '';
  for (const ch of normalized) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) continue; // skip combining diacritical marks
    stripped += ch;
  }
  return stripped.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

router.get('/', async (req, res) => {
  const bundles = await prisma.bundle.findMany({
    orderBy: { position: 'asc' },
    include: { items: { include: { product: true } } },
  });
  res.json(bundles);
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body.name || body.price == null || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'Nom, prix et au moins un produit sont requis.' });
  }
  const count = await prisma.bundle.count();
  let slug = slugify(body.name);
  const exists = await prisma.bundle.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;

  const bundle = await prisma.bundle.create({
    data: {
      slug,
      name: body.name,
      description: body.description || null,
      image: body.image || null,
      price: Number(body.price),
      isActive: body.isActive !== false,
      position: count,
    },
  });
  await prisma.bundleItem.createMany({
    data: body.items.map((it) => ({ bundleId: bundle.id, productId: it.productId, quantity: Number(it.quantity) || 1 })),
  });
  const full = await prisma.bundle.findUnique({ where: { id: bundle.id }, include: { items: { include: { product: true } } } });
  res.status(201).json(full);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['name', 'description', 'image'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f] || null; });
  if (body.price !== undefined) data.price = Number(body.price);
  if (body.position !== undefined) data.position = Number(body.position);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  try {
    const bundle = await prisma.bundle.update({ where: { id: req.params.id }, data });
    if (Array.isArray(body.items)) {
      await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
      await prisma.bundleItem.createMany({
        data: body.items.map((it) => ({ bundleId: bundle.id, productId: it.productId, quantity: Number(it.quantity) || 1 })),
      });
    }
    const full = await prisma.bundle.findUnique({ where: { id: bundle.id }, include: { items: { include: { product: true } } } });
    res.json(full);
  } catch (e) {
    res.status(404).json({ error: 'Bundle introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.bundle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Impossible de supprimer ce bundle (probablement référencé dans des commandes).' });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  const original = await prisma.bundle.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!original) return res.status(404).json({ error: 'Bundle introuvable.' });
  let slug = `${original.slug}-copie`;
  const exists = await prisma.bundle.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;
  const copy = await prisma.bundle.create({
    data: {
      slug, name: `${original.name} (copie)`, description: original.description,
      image: original.image, price: original.price, isActive: false, position: original.position,
    },
  });
  if (original.items.length) {
    await prisma.bundleItem.createMany({
      data: original.items.map((it) => ({ bundleId: copy.id, productId: it.productId, quantity: it.quantity })),
    });
  }
  const full = await prisma.bundle.findUnique({ where: { id: copy.id }, include: { items: { include: { product: true } } } });
  res.status(201).json(full);
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.bundle.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
