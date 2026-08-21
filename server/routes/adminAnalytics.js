const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(defaultFrom.getDate() - 29); defaultFrom.setHours(0, 0, 0, 0);
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : defaultFrom;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : now;

  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } },
    include: { items: true },
  });

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const orderCount = orders.length;
  const avgOrderValue = orderCount ? revenue / orderCount : 0;

  const customerCount = await prisma.customer.count();
  const customersWithOrders = await prisma.customer.findMany({ include: { _count: { select: { orders: true } } } });
  const repeatCustomers = customersWithOrders.filter((c) => c._count.orders > 1).length;

  // Top products / packs by revenue
  const productTotals = new Map();
  const packTotals = new Map();
  orders.forEach((order) => {
    order.items.forEach((item) => {
      const map = item.kind === 'PACK' ? packTotals : item.kind === 'PRODUCT' ? productTotals : null;
      if (!map) return;
      const key = item.productId || item.packId || item.name;
      const current = map.get(key) || { name: item.name, revenue: 0, quantity: 0 };
      current.revenue += item.unitPrice * item.quantity;
      current.quantity += item.quantity;
      map.set(key, current);
    });
  });
  const topProducts = Array.from(productTotals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topPacks = Array.from(packTotals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Top collections by revenue (via product/pack collection)
  const collections = await prisma.collection.findMany();
  const collectionNameById = new Map(collections.map((c) => [c.id, c.name]));
  const products = await prisma.product.findMany();
  const productCollectionId = new Map(products.map((p) => [p.id, p.collectionId]));
  const packs = await prisma.pack.findMany();
  const packCollectionId = new Map(packs.map((p) => [p.id, p.collectionId]));

  const collectionTotals = new Map();
  orders.forEach((order) => {
    order.items.forEach((item) => {
      let collectionId = null;
      if (item.kind === 'PRODUCT' && item.productId) collectionId = productCollectionId.get(item.productId);
      if (item.kind === 'PACK' && item.packId) collectionId = packCollectionId.get(item.packId);
      if (!collectionId) return;
      const name = collectionNameById.get(collectionId) || 'Autre';
      collectionTotals.set(name, (collectionTotals.get(name) || 0) + item.unitPrice * item.quantity);
    });
  });
  const topCollections = Array.from(collectionTotals.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Sales over the selected period (capped to 90 points to keep the chart readable)
  const salesByDay = new Map();
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.min(90, Math.max(1, Math.round((to - from) / dayMs) + 1));
  for (let i = spanDays - 1; i >= 0; i -= 1) {
    const d = new Date(to.getTime() - i * dayMs);
    salesByDay.set(d.toISOString().slice(0, 10), 0);
  }
  orders.forEach((o) => {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (salesByDay.has(key)) salesByDay.set(key, salesByDay.get(key) + o.total);
  });
  const salesOverTime = Array.from(salesByDay.entries()).map(([date, total]) => ({ date, total }));

  const recentOrders = await prisma.order.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 8 });

  const stockAlerts = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { stock: 'asc' },
    take: 50,
  });
  const lowStock = stockAlerts.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
  const outOfStock = stockAlerts.filter((p) => p.stock <= 0);

  res.json({
    revenue,
    orderCount,
    avgOrderValue,
    customerCount,
    repeatCustomers,
    topProducts,
    topPacks,
    topCollections,
    salesOverTime,
    recentOrders,
    lowStock,
    outOfStock,
  });
});

module.exports = router;
