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

async function uniqueSlug(base, ignoreId) {
  let slug = slugify(base);
  let i = 1;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    i += 1;
    slug = `${slugify(base)}-${i}`;
  }
}

router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({
    include: { collection: true },
    orderBy: [{ collectionId: 'asc' }, { position: 'asc' }],
  });
  res.json(products);
});

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { collection: true, packProducts: true, freePackProducts: true },
  });
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json(product);
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body.name || !body.collectionId || body.price == null) {
    return res.status(400).json({ error: 'Nom, collection et prix requis.' });
  }
  const slug = await uniqueSlug(body.slug || body.name);
  const product = await prisma.product.create({
    data: {
      slug,
      name: body.name,
      description: body.description || null,
      notes: body.notes || null,
      notesTop: body.notesTop || null,
      notesHeart: body.notesHeart || null,
      notesBase: body.notesBase || null,
      gender: body.gender || null,
      volume: body.volume || null,
      price: Number(body.price),
      stock: Number(body.stock) || 0,
      lowStockThreshold: Number(body.lowStockThreshold) || 5,
      images: JSON.stringify(body.images || []),
      videoUrl: body.videoUrl || null,
      shape: body.shape || 'bottle',
      color: body.color || '#0c0c0c',
      isActive: body.isActive !== false,
      isNew: !!body.isNew,
      isBestSeller: !!body.isBestSeller,
      isLimitedEdition: !!body.isLimitedEdition,
      packEligible: body.packEligible !== false,
      freePackEligible: !!body.freePackEligible,
      position: Number(body.position) || 0,
      collectionId: body.collectionId,
    },
  });
  res.status(201).json(product);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  const fields = ['name', 'description', 'notes', 'notesTop', 'notesHeart', 'notesBase', 'videoUrl', 'shape', 'color', 'collectionId'];
  fields.forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.gender !== undefined) data.gender = body.gender || null;
  if (body.volume !== undefined) data.volume = body.volume || null;
  const numFields = ['price', 'stock', 'lowStockThreshold', 'position'];
  numFields.forEach((f) => { if (body[f] !== undefined) data[f] = Number(body[f]); });
  const boolFields = ['isActive', 'isNew', 'isBestSeller', 'isLimitedEdition', 'packEligible', 'freePackEligible'];
  boolFields.forEach((f) => { if (body[f] !== undefined) data[f] = !!body[f]; });
  if (body.images !== undefined) data.images = JSON.stringify(body.images);
  if (body.name && body.regenerateSlug) data.slug = await uniqueSlug(body.name, req.params.id);

  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(product);
  } catch (e) {
    res.status(404).json({ error: 'Produit introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Impossible de supprimer ce produit (probablement référencé dans des commandes)." });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  const original = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Produit introuvable.' });

  const slug = await uniqueSlug(`${original.name}-copie`);
  const { id, createdAt, updatedAt, ...rest } = original;
  const copy = await prisma.product.create({
    data: { ...rest, slug, name: `${original.name} (copie)`, isActive: false },
  });
  res.status(201).json(copy);
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.product.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
