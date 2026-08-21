const express = require('express');
const prisma = require('../db');

const router = express.Router();

async function getBalance(customerId) {
  const result = await prisma.loyaltyLedger.aggregate({
    where: { customerId },
    _sum: { points: true },
  });
  return result._sum.points || 0;
}

// ---------- Settings ----------
router.get('/settings', async (req, res) => {
  let settings = await prisma.loyaltySettings.findFirst();
  if (!settings) settings = await prisma.loyaltySettings.create({ data: {} });
  res.json(settings);
});

router.put('/settings', async (req, res) => {
  let settings = await prisma.loyaltySettings.findFirst();
  if (!settings) settings = await prisma.loyaltySettings.create({ data: {} });
  const data = {};
  if (req.body.amountPerPoint !== undefined) data.amountPerPoint = Number(req.body.amountPerPoint);
  if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
  const updated = await prisma.loyaltySettings.update({ where: { id: settings.id }, data });
  res.json(updated);
});

// ---------- Rewards ----------
router.get('/rewards', async (req, res) => {
  const rewards = await prisma.loyaltyReward.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { redemptions: true } } },
  });
  res.json(rewards);
});

router.post('/rewards', async (req, res) => {
  const body = req.body;
  if (!body.name || body.pointsRequired == null) return res.status(400).json({ error: 'Nom et points requis nécessaires.' });
  const count = await prisma.loyaltyReward.count();
  const reward = await prisma.loyaltyReward.create({
    data: {
      name: body.name,
      description: body.description || null,
      pointsRequired: Number(body.pointsRequired),
      productsIncluded: body.productsIncluded || null,
      redemptionLimit: body.redemptionLimit != null && body.redemptionLimit !== '' ? Number(body.redemptionLimit) : null,
      isActive: body.isActive !== false,
      position: count,
    },
  });
  res.status(201).json(reward);
});

router.put('/rewards/:id', async (req, res) => {
  const body = req.body;
  const data = {};
  ['name', 'description', 'productsIncluded'].forEach((f) => { if (body[f] !== undefined) data[f] = body[f]; });
  if (body.pointsRequired !== undefined) data.pointsRequired = Number(body.pointsRequired);
  if (body.redemptionLimit !== undefined) data.redemptionLimit = body.redemptionLimit === '' || body.redemptionLimit === null ? null : Number(body.redemptionLimit);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.position !== undefined) data.position = Number(body.position);
  try {
    const reward = await prisma.loyaltyReward.update({ where: { id: req.params.id }, data });
    res.json(reward);
  } catch (e) { res.status(404).json({ error: 'Récompense introuvable.' }); }
});

router.delete('/rewards/:id', async (req, res) => {
  try {
    await prisma.loyaltyReward.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'Impossible de supprimer (récompense déjà utilisée dans des rédemptions).' }); }
});

router.post('/rewards/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis.' });
  await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.loyaltyReward.update({ where: { id }, data: { position: index } })
  ));
  res.json({ ok: true });
});

// ---------- Overview ----------
router.get('/overview', async (req, res) => {
  const [members, issuedAgg, redeemedAgg, activeRewardsCount, redemptionCount] = await Promise.all([
    prisma.customer.count({ where: { loyaltyLedger: { some: {} } } }),
    prisma.loyaltyLedger.aggregate({ where: { points: { gt: 0 } }, _sum: { points: true } }),
    prisma.loyaltyLedger.aggregate({ where: { type: 'REDEEMED' }, _sum: { points: true } }),
    prisma.loyaltyReward.count({ where: { isActive: true } }),
    prisma.loyaltyLedger.count({ where: { type: 'REDEEMED' } }),
  ]);
  res.json({
    totalMembers: members,
    totalPointsIssued: issuedAgg._sum.points || 0,
    totalPointsRedeemed: Math.abs(redeemedAgg._sum.points || 0),
    activeRewards: activeRewardsCount,
    totalRedemptions: redemptionCount,
  });
});

// ---------- Customers ----------
router.get('/customers', async (req, res) => {
  const search = req.query.search;
  const where = search
    ? { OR: [{ fullName: { contains: search } }, { phone: { contains: search } }] }
    : { loyaltyLedger: { some: {} } };
  const customers = await prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  const withBalances = await Promise.all(customers.map(async (c) => ({ ...c, balance: await getBalance(c.id) })));
  res.json(withBalances);
});

router.get('/customers/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      orders: { select: { id: true, orderNumber: true, status: true, total: true } },
      loyaltyLedger: { orderBy: { createdAt: 'desc' }, include: { reward: true, order: { select: { orderNumber: true } } } },
    },
  });
  if (!customer) return res.status(404).json({ error: 'Client introuvable.' });

  const balance = customer.loyaltyLedger.reduce((s, l) => s + l.points, 0);
  const rewards = await prisma.loyaltyReward.findMany({ where: { isActive: true }, orderBy: { pointsRequired: 'asc' } });
  const nextReward = rewards.find((r) => r.pointsRequired > balance);

  res.json({
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    city: customer.city,
    orderCount: customer.orders.length,
    deliveredCount: customer.orders.filter((o) => o.status === 'DELIVERED').length,
    balance,
    ledger: customer.loyaltyLedger,
    availableRewards: rewards.filter((r) => r.pointsRequired <= balance),
    nextReward: nextReward || null,
  });
});

router.post('/customers/:id/adjust', async (req, res) => {
  const { points, note } = req.body;
  const delta = Number(points);
  if (!delta || Number.isNaN(delta)) return res.status(400).json({ error: 'Valeur de points invalide.' });
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Client introuvable.' });

  const entry = await prisma.loyaltyLedger.create({
    data: {
      customerId: customer.id,
      type: delta > 0 ? 'MANUAL_ADD' : 'MANUAL_REMOVE',
      points: delta,
      note: note || 'Ajustement manuel',
    },
  });
  res.status(201).json(entry);
});

router.post('/customers/:id/redeem', async (req, res) => {
  const { rewardId } = req.body;
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Client introuvable.' });
  const reward = await prisma.loyaltyReward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.isActive) return res.status(404).json({ error: 'Récompense introuvable.' });

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const balance = (await tx.loyaltyLedger.aggregate({ where: { customerId: customer.id }, _sum: { points: true } }))._sum.points || 0;
      if (balance < reward.pointsRequired) throw new Error('Points insuffisants pour cette récompense.');

      if (reward.redemptionLimit != null) {
        const used = await tx.loyaltyLedger.count({ where: { rewardId: reward.id, type: 'REDEEMED' } });
        if (used >= reward.redemptionLimit) throw new Error('Cette récompense a atteint sa limite de rédemption.');
      }

      return tx.loyaltyLedger.create({
        data: {
          customerId: customer.id,
          type: 'REDEEMED',
          points: -reward.pointsRequired,
          note: `Récompense : ${reward.name}`,
          rewardId: reward.id,
        },
      });
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/ledger/:id/reverse', async (req, res) => {
  const original = await prisma.loyaltyLedger.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Entrée introuvable.' });

  const existing = await prisma.loyaltyLedger.findFirst({ where: { reversesEntryId: original.id } });
  if (existing) return res.status(400).json({ error: 'Cette entrée a déjà été annulée.' });

  const entry = await prisma.loyaltyLedger.create({
    data: {
      customerId: original.customerId,
      type: 'REVERSED',
      points: -original.points,
      note: `Annulation : ${original.note || original.type}`,
      rewardId: original.rewardId,
      orderId: original.orderId,
      reversesEntryId: original.id,
    },
  });
  res.status(201).json(entry);
});

// ---------- "Réclamer vos points" redemption requests ----------
router.get('/redemption-requests', async (req, res) => {
  const status = req.query.status;
  const where = status ? { status } : {};
  const requests = await prisma.loyaltyRedemptionRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(requests);
});

router.put('/redemption-requests/:id', async (req, res) => {
  const { status } = req.body;
  if (!['PENDING', 'CONTACTED', 'COMPLETED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  const request = await prisma.loyaltyRedemptionRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Demande introuvable.' });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Points are only ever deducted the moment a request FIRST becomes
      // COMPLETED — never on a later save, so re-saving an already-completed
      // request can't double-deduct.
      if (status === 'COMPLETED' && request.status !== 'COMPLETED') {
        const customer = await tx.customer.findUnique({ where: { phone: request.phone } });
        if (customer) {
          const balance = (await tx.loyaltyLedger.aggregate({ where: { customerId: customer.id }, _sum: { points: true } }))._sum.points || 0;
          let pointsToDeduct = request.pointsAtRequest;
          if (request.requestedRewardId) {
            const reward = await tx.loyaltyReward.findUnique({ where: { id: request.requestedRewardId } });
            if (reward) pointsToDeduct = reward.pointsRequired;
          }
          if (pointsToDeduct > 0) {
            if (balance < pointsToDeduct) throw new Error(`Points insuffisants pour clôturer cette demande (solde actuel : ${balance}).`);
            await tx.loyaltyLedger.create({
              data: {
                customerId: customer.id,
                type: 'REDEEMED',
                points: -pointsToDeduct,
                note: request.requestedRewardName ? `Récompense réclamée : ${request.requestedRewardName}` : 'Points réclamés (demande client)',
                rewardId: request.requestedRewardId || null,
              },
            });
          }
        }
      }
      return tx.loyaltyRedemptionRequest.update({ where: { id: req.params.id }, data: { status } });
    });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Impossible de mettre à jour cette demande.' });
  }
});

module.exports = router;
