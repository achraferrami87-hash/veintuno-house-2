const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const search = req.query.search;
  const where = search
    ? { OR: [{ fullName: { contains: search } }, { phone: { contains: search } }, { city: { contains: search } }] }
    : {};
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { orders: { select: { id: true, total: true, status: true, createdAt: true } } },
  });

  const withStats = customers.map((c) => ({
    ...c,
    orderCount: c.orders.length,
    totalSpent: c.orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0),
  }));

  res.json(withStats);
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { orders: { orderBy: { createdAt: 'desc' }, include: { items: true } } },
  });
  if (!customer) return res.status(404).json({ error: 'Client introuvable.' });
  res.json(customer);
});

module.exports = router;
