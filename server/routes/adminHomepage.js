const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---------- Hero slides ----------
router.get('/slides', async (req, res) => {
  const slides = await prisma.heroSlide.findMany({ orderBy: { position: 'asc' } });
  res.json(slides);
});

router.post('/slides', async (req, res) => {
  const body = req.body;
  if (!body.title) return res.status(400).json({ error: 'Titre requis.' });
  const count = await prisma.heroSlide.count();
  const slide = await prisma.heroSlide.create({
    data: {
      eyebrow: body.eyebrow || null,
      title: body.title,
      subtitle: body.subtitle || null,
      imageUrl: body.imageUrl || null,
      videoUrl: body.videoUrl || null,
      gradientFallback: body.gradientFallback || null,
      ctaText1: body.ctaText1 || null,
      ctaHref1: body.ctaHref1 || null,
      ctaText2: body.ctaText2 || null,
      ctaHref2: body.ctaHref2 || null,
      isActive: body.isActive !== false,
      position: count,
    },
  });
  res.status(201).json(slide);
});

router.put('/slides/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['eyebrow', 'title', 'subtitle', 'imageUrl', 'videoUrl', 'gradientFallback', 'ctaText1', 'ctaHref1', 'ctaText2', 'ctaHref2']
    .forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.position !== undefined) data.position = Number(body.position);
  try {
    const slide = await prisma.heroSlide.update({ where: { id: req.params.id }, data });
    res.json(slide);
  } catch (e) {
    res.status(404).json({ error: 'Slide introuvable.' });
  }
});

router.delete('/slides/:id', async (req, res) => {
  try {
    await prisma.heroSlide.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Slide introuvable.' });
  }
});

router.post('/slides/:id/duplicate', async (req, res) => {
  const original = await prisma.heroSlide.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Slide introuvable.' });
  const { id, createdAt, updatedAt, ...rest } = original;
  const copy = await prisma.heroSlide.create({ data: { ...rest, title: `${original.title} (copie)`, isActive: false } });
  res.status(201).json(copy);
});

router.post('/slides/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.heroSlide.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

// ---------- Homepage sections ----------
router.get('/sections', async (req, res) => {
  const sections = await prisma.homepageSection.findMany({ orderBy: { position: 'asc' } });
  res.json(sections.map((s) => ({ ...s, config: safeParse(s.config) })));
});

router.post('/sections', async (req, res) => {
  const body = req.body;
  if (!body.type) return res.status(400).json({ error: 'Type de section requis.' });
  const count = await prisma.homepageSection.count();
  const section = await prisma.homepageSection.create({
    data: {
      type: body.type,
      title: body.title || null,
      subtitle: body.subtitle || null,
      config: JSON.stringify(body.config || {}),
      isActive: body.isActive !== false,
      position: count,
    },
  });
  res.status(201).json({ ...section, config: safeParse(section.config) });
});

router.put('/sections/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['type', 'title', 'subtitle'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.config !== undefined) data.config = JSON.stringify(body.config);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.position !== undefined) data.position = Number(body.position);
  try {
    const section = await prisma.homepageSection.update({ where: { id: req.params.id }, data });
    res.json({ ...section, config: safeParse(section.config) });
  } catch (e) {
    res.status(404).json({ error: 'Section introuvable.' });
  }
});

router.delete('/sections/:id', async (req, res) => {
  try {
    await prisma.homepageSection.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Section introuvable.' });
  }
});

router.post('/sections/:id/duplicate', async (req, res) => {
  const original = await prisma.homepageSection.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Section introuvable.' });
  const { id, createdAt, updatedAt, ...rest } = original;
  const copy = await prisma.homepageSection.create({ data: { ...rest, isActive: false } });
  res.status(201).json({ ...copy, config: safeParse(copy.config) });
});

router.post('/sections/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.homepageSection.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

function safeParse(str) {
  try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
}

module.exports = router;
