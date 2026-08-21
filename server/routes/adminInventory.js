const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({
    include: { collection: true },
    orderBy: { stock: 'asc' },
  });
  const withFlags = products.map((p) => ({
    ...p,
    isLowStock: p.stock > 0 && p.stock <= p.lowStockThreshold,
    isOutOfStock: p.stock <= 0,
  }));
  res.json(withFlags);
});

router.get('/:productId/logs', async (req, res) => {
  const logs = await prisma.stockLog.findMany({
    where: { productId: req.params.productId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.post('/:productId/adjust', async (req, res) => {
  const { amount, reason } = req.body;
  const delta = Number(amount);
  if (!delta || Number.isNaN(delta)) return res.status(400).json({ error: 'Quantité invalide.' });

  const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

  const newStock = Math.max(0, product.stock + delta);
  const updated = await prisma.product.update({ where: { id: product.id }, data: { stock: newStock } });
  await prisma.stockLog.create({
    data: {
      productId: product.id,
      changeAmount: newStock - product.stock,
      reason: reason || 'Ajustement manuel',
      resultingStock: newStock,
    },
  });
  res.json(updated);
});

module.exports = router;
