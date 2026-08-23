const express = require('express');
const prisma = require('../db');
const { seedDefaultQuizContent } = require('../utils/quizSeed');

const router = express.Router();

// One-click, idempotent starter content: default questions/answers/weights
// (only if none exist yet) plus auto-tagging of existing Parfums products
// with inferred characteristics (always safe to re-run, additive only).
router.post('/seed-defaults', async (req, res) => {
  const result = await seedDefaultQuizContent();
  res.json(result);
});

const answerInclude = { characteristics: { include: { characteristic: true } } };

async function setAnswerCharacteristics(answerId, characteristics) {
  // characteristics: [{ characteristicId, weight }]
  if (!Array.isArray(characteristics)) return;
  await prisma.quizAnswerCharacteristic.deleteMany({ where: { answerId } });
  const rows = characteristics
    .filter((c) => c && c.characteristicId)
    .map((c) => ({ answerId, characteristicId: c.characteristicId, weight: Math.max(1, Number(c.weight) || 1) }));
  if (rows.length) await prisma.quizAnswerCharacteristic.createMany({ data: rows });
}

// ---------- Questions ----------
router.get('/', async (req, res) => {
  const questions = await prisma.quizQuestion.findMany({
    orderBy: { position: 'asc' },
    include: { answers: { orderBy: { position: 'asc' }, include: answerInclude } },
  });
  res.json(questions);
});

router.post('/', async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Texte de la question requis.' });
  const count = await prisma.quizQuestion.count();
  const question = await prisma.quizQuestion.create({ data: { text, position: count } });
  res.status(201).json(question);
});

router.put('/:id', async (req, res) => {
  const data = {};
  if (req.body.text !== undefined) data.text = req.body.text.trim();
  if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
  if (req.body.position !== undefined) data.position = Number(req.body.position);
  try {
    const question = await prisma.quizQuestion.update({ where: { id: req.params.id }, data });
    res.json(question);
  } catch (e) {
    res.status(404).json({ error: 'Question introuvable.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.quizQuestion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Question introuvable.' });
  }
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.quizQuestion.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

// ---------- Answers ----------
router.post('/:questionId/answers', async (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Libellé requis.' });
  const count = await prisma.quizAnswer.count({ where: { questionId: req.params.questionId } });
  const answer = await prisma.quizAnswer.create({
    data: { label, position: count, questionId: req.params.questionId },
  });
  await setAnswerCharacteristics(answer.id, req.body.characteristics);
  const full = await prisma.quizAnswer.findUnique({ where: { id: answer.id }, include: answerInclude });
  res.status(201).json(full);
});

router.put('/answers/:id', async (req, res) => {
  const data = {};
  if (req.body.label !== undefined) data.label = req.body.label.trim();
  if (req.body.position !== undefined) data.position = Number(req.body.position);
  try {
    const answer = await prisma.quizAnswer.update({ where: { id: req.params.id }, data });
    await setAnswerCharacteristics(answer.id, req.body.characteristics);
    const full = await prisma.quizAnswer.findUnique({ where: { id: answer.id }, include: answerInclude });
    res.json(full);
  } catch (e) {
    res.status(404).json({ error: 'Réponse introuvable.' });
  }
});

router.delete('/answers/:id', async (req, res) => {
  try {
    await prisma.quizAnswer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Réponse introuvable.' });
  }
});

router.post('/:questionId/answers/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.quizAnswer.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

module.exports = router;
