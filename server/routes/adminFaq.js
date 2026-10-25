const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const faqs = await prisma.faq.findMany({ orderBy: { position: 'asc' } });
  res.json(faqs);
});

router.post('/', async (req, res) => {
  const question = (req.body.question || '').trim();
  const answer = (req.body.answer || '').trim();
  if (!question || !answer) return res.status(400).json({ error: 'Question et réponse requises.' });
  const count = await prisma.faq.count();
  const faq = await prisma.faq.create({
    data: {
      question, answer,
      category: req.body.category || null,
      page: req.body.page || null,
      position: count,
    },
  });
  res.status(201).json(faq);
});

router.put('/:id', async (req, res) => {
  const data = {};
  if (req.body.question !== undefined) data.question = req.body.question.trim();
  if (req.body.answer !== undefined) data.answer = req.body.answer.trim();
  if (req.body.category !== undefined) data.category = req.body.category || null;
  if (req.body.page !== undefined) data.page = req.body.page || null;
  if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
  if (req.body.position !== undefined) data.position = Number(req.body.position);
  try {
    const faq = await prisma.faq.update({ where: { id: req.params.id }, data });
    res.json(faq);
  } catch (e) {
    res.status(404).json({ error: 'Question introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Question introuvable.' });
  }
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.faq.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
