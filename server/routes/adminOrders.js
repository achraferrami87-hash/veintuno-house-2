const express = require('express');
const prisma = require('../db');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

router.get('/', async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.dateFrom || req.query.dateTo) {
    where.createdAt = {};
    if (req.query.dateFrom) where.createdAt.gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  if (req.query.search) {
    const q = req.query.search.toString();
    where.OR = [
      { orderNumber: { contains: q } },
      { fullName: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { items: true, promoCode: true },
  });
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { components: true, product: true, pack: true } },
      promoCode: true,
      customer: true,
    },
  });
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json(order);
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });

  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Commande introuvable.' });

  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status } });

  // Loyalty points are only ever credited once an order is actually Delivered,
  // never at checkout — and clawed back if a delivered order later gets cancelled.
  if (existing.status !== 'DELIVERED' && status === 'DELIVERED' && order.customerId) {
    const alreadyCredited = await prisma.loyaltyLedger.findFirst({ where: { orderId: order.id, type: 'EARNED' } });
    if (!alreadyCredited) {
      const settings = await prisma.loyaltySettings.findFirst();
      const amountPerPoint = settings && settings.isActive ? settings.amountPerPoint : null;
      if (amountPerPoint) {
        const points = Math.round((order.total / amountPerPoint) * 100) / 100;
        await prisma.loyaltyLedger.create({
          data: { customerId: order.customerId, type: 'EARNED', points, note: `Commande ${order.orderNumber}`, orderId: order.id },
        });
      }
    }
  } else if (existing.status === 'DELIVERED' && status === 'CANCELLED') {
    const earned = await prisma.loyaltyLedger.findFirst({ where: { orderId: order.id, type: 'EARNED' } });
    if (earned) {
      const alreadyReversed = await prisma.loyaltyLedger.findFirst({ where: { reversesEntryId: earned.id } });
      if (!alreadyReversed) {
        await prisma.loyaltyLedger.create({
          data: {
            customerId: earned.customerId, type: 'REVERSED', points: -earned.points,
            note: `Commande ${order.orderNumber} annulée`, orderId: order.id, reversesEntryId: earned.id,
          },
        });
      }
    }
  }

  res.json(order);
});

module.exports = router;
