const express = require('express');
const ExcelJS = require('exceljs');
const prisma = require('../db');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

// Loyalty rate categories — kept in sync with the two rates on
// LoyaltySettings (amountPerPoint = Parfums + Gels Douche, amountPerPointSecondary
// = Cosmétiques + Suppléments). Any collection not in the secondary list
// (including a future new one) safely falls back to the primary rate.
const SECONDARY_RATE_SLUGS = ['cosmetics', 'supplements'];
function rateGroupForSlug(slug) {
  return SECONDARY_RATE_SLUGS.includes(slug) ? 'secondary' : 'primary';
}

const ORDER_ECONOMICS_INCLUDE = {
  items: {
    include: {
      product: { include: { collection: true } },
      pack: { include: { collection: true } },
      components: { include: { product: { include: { collection: true } } } },
    },
  },
};

// Splits an order's revenue by loyalty-rate category and totals its cost of
// goods (for Profit) — shared by the status-update route (which freezes
// these numbers the moment an order first becomes DELIVERED) and the order
// preview endpoint (which shows a live, non-final estimate at any status).
function computeOrderEconomics(items) {
  let primaryRevenue = 0;
  let secondaryRevenue = 0;
  let totalCost = 0;

  items.forEach((item) => {
    const lineRevenue = item.unitPrice * item.quantity;

    if (item.kind === 'PRODUCT' && item.product) {
      const group = rateGroupForSlug(item.product.collection ? item.product.collection.slug : null);
      if (group === 'secondary') secondaryRevenue += lineRevenue; else primaryRevenue += lineRevenue;
      if (item.product.costPrice != null) totalCost += item.product.costPrice * item.quantity;
      return;
    }

    if ((item.kind === 'PACK' || item.kind === 'FREE_PACK') && (item.components || []).length) {
      // Each stored component row already represents exactly one chosen
      // unit (repeats create repeat rows), so no extra multiplier here.
      const group = item.kind === 'PACK' && item.pack
        ? rateGroupForSlug(item.pack.collection ? item.pack.collection.slug : null)
        : null; // FREE_PACK has no single collection — resolve per component below
      item.components.forEach((comp) => {
        const compGroup = group || rateGroupForSlug(comp.product && comp.product.collection ? comp.product.collection.slug : null);
        const share = lineRevenue / item.components.length;
        if (compGroup === 'secondary') secondaryRevenue += share; else primaryRevenue += share;
        if (comp.product && comp.product.costPrice != null) totalCost += comp.product.costPrice;
      });
      return;
    }

    if (item.kind === 'BUNDLE' && (item.components || []).length) {
      // A Bundle's stored components are its fixed recipe (one row per
      // distinct product, not per unit), so the line's own quantity still
      // needs applying per component here.
      item.components.forEach((comp) => {
        const compGroup = rateGroupForSlug(comp.product && comp.product.collection ? comp.product.collection.slug : null);
        const share = lineRevenue / item.components.length;
        if (compGroup === 'secondary') secondaryRevenue += share; else primaryRevenue += share;
        if (comp.product && comp.product.costPrice != null) totalCost += comp.product.costPrice * item.quantity;
      });
      return;
    }

    // No product/collection data available at all (shouldn't normally
    // happen) — count the revenue so totals still balance, at the primary
    // rate, with no cost data to add.
    primaryRevenue += lineRevenue;
  });

  return { primaryRevenue, secondaryRevenue, totalCost, totalRevenue: primaryRevenue + secondaryRevenue };
}

async function computeLoyaltyPoints(primaryRevenue, secondaryRevenue) {
  const settings = await prisma.loyaltySettings.findFirst();
  if (!settings || !settings.isActive) return null;
  const primaryPoints = settings.amountPerPoint ? primaryRevenue / settings.amountPerPoint : 0;
  const secondaryPoints = settings.amountPerPointSecondary ? secondaryRevenue / settings.amountPerPointSecondary : 0;
  return Math.round((primaryPoints + secondaryPoints) * 100) / 100;
}

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
    include: { ...ORDER_ECONOMICS_INCLUDE, promoCode: true, customer: true },
  });
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  // Profit is only ever real/final once the order is Delivered (order.profit,
  // frozen at that moment) — before that, this is just a live, non-final
  // preview so the admin can see what it would be.
  const { totalCost } = computeOrderEconomics(order.items);
  // Net of any discount given (real revenue foregone), never touching
  // delivery fee — that's a pass-through cost, not margin on goods sold.
  const estimatedProfit = Math.round((order.subtotal - order.discountAmount - totalCost) * 100) / 100;
  res.json({ ...order, estimatedProfit });
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });

  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Commande introuvable.' });

  // Loyalty points AND profit are only ever computed once, the moment an
  // order actually transitions into Delivered — never at checkout, never
  // recomputed on a later save of the same status (this `if` only matches a
  // real status change, so re-saving DELIVERED→DELIVERED does nothing here).
  let statusUpdateData = { status };
  if (existing.status !== 'DELIVERED' && status === 'DELIVERED') {
    const full = await prisma.order.findUnique({ where: { id: req.params.id }, include: ORDER_ECONOMICS_INCLUDE });
    const { primaryRevenue, secondaryRevenue, totalCost } = computeOrderEconomics(full.items);
    statusUpdateData.profit = Math.round((full.subtotal - full.discountAmount - totalCost) * 100) / 100;

    if (full.customerId) {
      const alreadyCredited = await prisma.loyaltyLedger.findFirst({ where: { orderId: full.id, type: 'EARNED' } });
      if (!alreadyCredited) {
        const points = await computeLoyaltyPoints(primaryRevenue, secondaryRevenue);
        if (points) {
          await prisma.loyaltyLedger.create({
            data: { customerId: full.customerId, type: 'EARNED', points, note: `Commande ${full.orderNumber}`, orderId: full.id },
          });
        }
      }
    }
  }

  const order = await prisma.order.update({ where: { id: req.params.id }, data: statusUpdateData });

  if (existing.status === 'DELIVERED' && status === 'CANCELLED') {
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
    // order.profit is left as a historical record — "accumulated profit" is
    // computed live from orders currently DELIVERED, so this one simply
    // stops counting toward it without needing to be zeroed out here.
  }

  res.json(order);
});

module.exports = router;
