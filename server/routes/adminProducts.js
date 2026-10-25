const express = require('express');
const prisma = require('../db');

const router = express.Router();


function cleanTextList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || '').trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

// Olfactory pyramid notes: {name, image}. Name is required (a note with no
// name is dropped); image is optional (a note can exist before its photo is
// uploaded — the storefront shows a placeholder until then).
function cleanNoteList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => ({
      name: String((v && v.name) || '').trim().slice(0, 60),
      image: v && v.image ? String(v.image).trim().slice(0, 500) : null,
    }))
    .filter((v) => v.name)
    .slice(0, 20);
}

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

function withGendersArray(product) {
  let genders = [];
  try { genders = JSON.parse(product.genders || '[]'); } catch (e) { genders = []; }
  if (genders.length === 0 && product.gender) genders = [product.gender];
  let filterOptionIds = [];
  try { filterOptionIds = JSON.parse(product.filterOptionIds || '[]'); } catch (e) { filterOptionIds = []; }
  const characteristicIds = Array.isArray(product.characteristics)
    ? product.characteristics.map((c) => c.characteristicId)
    : undefined;
  const parseNotes = (raw) => { try { return JSON.parse(raw || '[]'); } catch (e) { return []; } };
  const out = {
    ...product, genders, filterOptionIds,
    notesTopData: parseNotes(product.notesTopData),
    notesHeartData: parseNotes(product.notesHeartData),
    notesBaseData: parseNotes(product.notesBaseData),
  };
  if (characteristicIds) out.characteristicIds = characteristicIds;
  return out;
}

async function setProductCharacteristics(productId, characteristicIds) {
  if (!Array.isArray(characteristicIds)) return;
  await prisma.productCharacteristic.deleteMany({ where: { productId } });
  const uniqueIds = Array.from(new Set(characteristicIds));
  if (uniqueIds.length) {
    await prisma.productCharacteristic.createMany({
      data: uniqueIds.map((characteristicId) => ({ productId, characteristicId })),
    });
  }
}

router.get('/', async (req, res) => {
  const where = {};
  if (req.query.collectionId) where.collectionId = req.query.collectionId;
  if (req.query.isActive === 'true') where.isActive = true;
  if (req.query.isActive === 'false') where.isActive = false;
  if (req.query.flashSaleActive === 'true') where.flashSaleActive = true;
  if (req.query.search) {
    const q = req.query.search.toString();
    where.OR = [{ name: { contains: q } }, { slug: { contains: q } }, { notes: { contains: q } }];
  }
  const products = await prisma.product.findMany({
    where,
    include: { collection: true, characteristics: true },
    orderBy: [{ collectionId: 'asc' }, { position: 'asc' }],
  });
  res.json(products.map(withGendersArray));
});

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { collection: true, packProducts: true, freePackProducts: true, characteristics: true },
  });
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json(withGendersArray(product));
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
      notesTopData: JSON.stringify(cleanNoteList(body.notesTopData)),
      notesHeartData: JSON.stringify(cleanNoteList(body.notesHeartData)),
      notesBaseData: JSON.stringify(cleanNoteList(body.notesBaseData)),
      ingredients: body.ingredients || null,
      usage: body.usage || null,
      deliveryInfo: body.deliveryInfo || null,
      benefits: JSON.stringify(cleanTextList(body.benefits, 8, 120)),
      gender: Array.isArray(body.genders) && body.genders.length ? body.genders[0] : (body.gender || null),
      genders: JSON.stringify(Array.isArray(body.genders) ? body.genders : (body.gender ? [body.gender] : [])),
      filterOptionIds: JSON.stringify(Array.isArray(body.filterOptionIds) ? body.filterOptionIds : []),
      volume: body.volume || null,
      price: Number(body.price),
      costPrice: body.costPrice != null && body.costPrice !== '' ? Number(body.costPrice) : null,
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
      flashSaleActive: !!body.flashSaleActive,
      flashSalePrice: body.flashSalePrice != null && body.flashSalePrice !== '' ? Number(body.flashSalePrice) : null,
      flashSaleStart: body.flashSaleStart ? new Date(body.flashSaleStart) : null,
      flashSaleEnd: body.flashSaleEnd ? new Date(body.flashSaleEnd) : null,
      flashSaleLabel: body.flashSaleLabel || null,
      campaignId: body.campaignId || null,
    },
  });
  await setProductCharacteristics(product.id, body.characteristicIds);
  res.status(201).json(product);
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  const fields = ['name', 'description', 'notes', 'notesTop', 'notesHeart', 'notesBase', 'ingredients', 'usage', 'deliveryInfo', 'videoUrl', 'shape', 'color', 'collectionId'];
  fields.forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.benefits !== undefined) data.benefits = JSON.stringify(cleanTextList(body.benefits, 8, 120));
  if (body.notesTopData !== undefined) data.notesTopData = JSON.stringify(cleanNoteList(body.notesTopData));
  if (body.notesHeartData !== undefined) data.notesHeartData = JSON.stringify(cleanNoteList(body.notesHeartData));
  if (body.notesBaseData !== undefined) data.notesBaseData = JSON.stringify(cleanNoteList(body.notesBaseData));
  if (body.genders !== undefined) {
    const gArr = Array.isArray(body.genders) ? body.genders : [];
    data.genders = JSON.stringify(gArr);
    data.gender = gArr.length ? gArr[0] : null;
  } else if (body.gender !== undefined) {
    data.gender = body.gender || null;
  }
  if (body.filterOptionIds !== undefined) {
    data.filterOptionIds = JSON.stringify(Array.isArray(body.filterOptionIds) ? body.filterOptionIds : []);
  }
  if (body.volume !== undefined) data.volume = body.volume || null;
  const numFields = ['price', 'stock', 'lowStockThreshold', 'position'];
  numFields.forEach((f) => { if (body[f] !== undefined) data[f] = Number(body[f]); });
  if (body.costPrice !== undefined) data.costPrice = body.costPrice != null && body.costPrice !== '' ? Number(body.costPrice) : null;
  const boolFields = ['isActive', 'isNew', 'isBestSeller', 'isLimitedEdition', 'packEligible', 'freePackEligible', 'flashSaleActive'];
  boolFields.forEach((f) => { if (body[f] !== undefined) data[f] = !!body[f]; });
  if (body.flashSalePrice !== undefined) data.flashSalePrice = body.flashSalePrice != null && body.flashSalePrice !== '' ? Number(body.flashSalePrice) : null;
  if (body.flashSaleStart !== undefined) data.flashSaleStart = body.flashSaleStart ? new Date(body.flashSaleStart) : null;
  if (body.flashSaleEnd !== undefined) data.flashSaleEnd = body.flashSaleEnd ? new Date(body.flashSaleEnd) : null;
  if (body.flashSaleLabel !== undefined) data.flashSaleLabel = body.flashSaleLabel || null;
  if (body.campaignId !== undefined) data.campaignId = body.campaignId || null;
  if (body.images !== undefined) data.images = JSON.stringify(body.images);
  if (body.name && body.regenerateSlug) data.slug = await uniqueSlug(body.name, req.params.id);

  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    await setProductCharacteristics(product.id, body.characteristicIds);
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
