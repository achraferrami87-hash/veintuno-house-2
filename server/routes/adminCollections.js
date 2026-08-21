const express = require('express');
const prisma = require('../db');

const router = express.Router();

function slugify(str) {
  const normalized = str.toString().toLowerCase().trim().normalize('NFD');
  let stripped = '';
  for (const ch of normalized) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) continue;
    stripped += ch;
  }
  return stripped.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function uniqueSlug(base, ignoreId) {
  let slug = slugify(base);
  let i = 1;
  while (true) {
    const existing = await prisma.collection.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    i += 1;
    slug = `${slugify(base)}-${i}`;
  }
}

router.get('/', async (req, res) => {
  const collections = await prisma.collection.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { products: true, packs: true } } },
  });
  res.json(collections);
});

router.get('/:id', async (req, res) => {
  const collection = await prisma.collection.findUnique({
    where: { id: req.params.id },
    include: { products: true, packs: true },
  });
  if (!collection) return res.status(404).json({ error: 'Collection introuvable.' });
  res.json(collection);
});

router.post('/', async (req, res) => {
  const { name, description, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis.' });
  const slug = await uniqueSlug(name);
  const count = await prisma.collection.count();
  const collection = await prisma.collection.create({
    data: { slug, name, description: description || null, image: image || null, position: count },
  });
  res.status(201).json(collection);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['name', 'description', 'image'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.position !== undefined) data.position = Number(body.position);
  if (body.regenerateSlug && body.name) data.slug = await uniqueSlug(body.name, req.params.id);

  try {
    const collection = await prisma.collection.update({ where: { id: req.params.id }, data });
    res.json(collection);
  } catch (e) {
    res.status(404).json({ error: 'Collection introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  const productCount = await prisma.product.count({ where: { collectionId: req.params.id } });
  if (productCount > 0) {
    return res.status(400).json({ error: `Impossible de supprimer : ${productCount} produit(s) rattaché(s) à cette collection.` });
  }
  try {
    await prisma.collection.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Collection introuvable.' });
  }
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.collection.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
