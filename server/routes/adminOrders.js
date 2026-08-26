const express = require('express');
const ExcelJS = require('exceljs');
const prisma = require('../db');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

function buildOrdersWhere(query) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  if (query.search) {
    const q = query.search.toString();
    where.OR = [
      { orderNumber: { contains: q } },
      { fullName: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  return where;
}

router.get('/', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: buildOrdersWhere(req.query),
    orderBy: { createdAt: 'desc' },
    include: { items: true, promoCode: true },
  });
  res.json(orders);
});

// Row fill color per status — mirrors the dashboard's badge colors
// (gray = en attente / préparation en cours, green = livrée, red = annulée).
const STATUS_FILL = {
  PENDING: 'FFE0E0E0',
  CONFIRMED: 'FFC6EFCE',
  PREPARING: 'FFE0E0E0',
  SHIPPED: 'FFE0E0E0',
  DELIVERED: 'FFC6EFCE',
  CANCELLED: 'FFFFC7CE',
};

router.get('/export', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: buildOrdersWhere(req.query),
    orderBy: { createdAt: 'desc' },
    include: { items: true, promoCode: true },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Commandes');
  sheet.columns = [
    { header: 'N° commande', key: 'orderNumber', width: 20 },
    { header: 'Client', key: 'fullName', width: 24 },
    { header: 'Téléphone', key: 'phone', width: 16 },
    { header: 'Ville', key: 'city', width: 16 },
    { header: 'Adresse', key: 'address', width: 30 },
    { header: 'Articles', key: 'itemsCount', width: 10 },
    { header: 'Sous-total', key: 'subtotal', width: 12 },
    { header: 'Réduction', key: 'discountAmount', width: 12 },
    { header: 'Livraison', key: 'deliveryFee', width: 12 },
    { header: 'Total (MAD)', key: 'total', width: 14 },
    { header: 'Statut', key: 'status', width: 14 },
    { header: 'Date', key: 'createdAt', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  orders.forEach((o) => {
    const row = sheet.addRow({
      orderNumber: o.orderNumber,
      fullName: o.fullName,
      phone: o.phone,
      city: o.city,
      address: o.address,
      itemsCount: o.items.length,
      subtotal: o.subtotal,
      discountAmount: o.discountAmount,
      deliveryFee: o.deliveryFee,
      total: o.total,
      status: o.status,
      createdAt: new Date(o.createdAt).toLocaleString('fr-FR'),
    });
    const fill = STATUS_FILL[o.status];
    if (fill) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `commandes-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
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
