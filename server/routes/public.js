const express = require('express');
const prisma = require('../db');
const { resolvePromo } = require('../utils/promo');
const { generateOrderNumber } = require('../utils/orderNumber');

const router = express.Router();

function parseImages(product) {
  let images = [];
  try { images = JSON.parse(product.images || '[]'); } catch (e) { images = []; }
  return { ...product, images };
}

// ---------- Site settings (WhatsApp / Instagram / perfume disclaimer) ----------
router.get('/settings', async (req, res) => {
  let settings = await prisma.siteSettings.findFirst();
  if (!settings) settings = await prisma.siteSettings.create({ data: {} });
  res.json(settings);
});

// ---------- Collections ----------
router.get('/collections', async (req, res) => {
  const where = { isActive: true };
  if (req.query.nav === 'true') where.showInNav = true;
  const collections = await prisma.collection.findMany({
    where,
    orderBy: { position: 'asc' },
  });
  res.json(collections);
});

router.get('/collections/:slug', async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { slug: req.params.slug } });
  if (!collection || !collection.isActive) return res.status(404).json({ error: 'Collection introuvable.' });

  const [products, packs] = await Promise.all([
    prisma.product.findMany({
      where: { collectionId: collection.id, isActive: true },
      orderBy: { position: 'asc' },
    }),
    prisma.pack.findMany({
      where: { collectionId: collection.id, isActive: true },
      orderBy: { position: 'asc' },
    }),
  ]);

  res.json({ collection, products: products.map(parseImages), packs });
});

// ---------- Products ----------
router.get('/products', async (req, res) => {
  const where = { isActive: true };
  if (req.query.collection) {
    const col = await prisma.collection.findUnique({ where: { slug: req.query.collection } });
    if (!col) return res.json([]);
    where.collectionId = col.id;
  }
  if (req.query.bestseller === 'true') where.isBestSeller = true;
  if (req.query.new === 'true') where.isNew = true;

  const products = await prisma.product.findMany({ where, orderBy: { position: 'asc' } });
  res.json(products.map(parseImages));
});

router.get('/products/:slug', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { collection: true },
  });
  if (!product || !product.isActive) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json(parseImages(product));
});

// ---------- Packs ----------
router.get('/packs', async (req, res) => {
  const where = { isActive: true };
  if (req.query.collection) {
    const col = await prisma.collection.findUnique({ where: { slug: req.query.collection } });
    if (!col) return res.json([]);
    where.collectionId = col.id;
  }

  const packs = await prisma.pack.findMany({
    where,
    orderBy: { position: 'asc' },
    include: { collection: true, eligibleProducts: { include: { product: true } } },
  });

  const result = await Promise.all(
    packs.map(async (pack) => {
      let eligibleProducts;
      if (pack.useCollectionEligibility) {
        eligibleProducts = await prisma.product.findMany({
          where: { collectionId: pack.collectionId, isActive: true, packEligible: true },
          orderBy: { position: 'asc' },
        });
      } else {
        eligibleProducts = pack.eligibleProducts.map((r) => r.product).filter((p) => p.isActive);
      }
      return {
        id: pack.id,
        name: pack.name,
        size: pack.size,
        price: pack.price,
        collectionSlug: pack.collection.slug,
        eligibleProducts: eligibleProducts.map(parseImages),
      };
    })
  );

  res.json(result);
});

// ---------- Free Pack ----------
router.get('/free-pack', async (req, res) => {
  const config = await prisma.freePackConfig.findFirst({
    where: { isActive: true },
    include: { eligibleCollections: true, eligibleProducts: { include: { product: true } } },
  });
  if (!config) return res.json(null);

  const collectionIds = config.eligibleCollections.map((r) => r.collectionId);
  const byCollection = collectionIds.length
    ? await prisma.product.findMany({ where: { collectionId: { in: collectionIds }, isActive: true } })
    : [];
  const byProduct = config.eligibleProducts.map((r) => r.product).filter((p) => p.isActive);

  const merged = new Map();
  [...byCollection, ...byProduct].forEach((p) => merged.set(p.id, p));

  res.json({
    id: config.id,
    name: config.name,
    minItems: config.minItems,
    allowMixCategories: config.allowMixCategories,
    eligibleProducts: Array.from(merged.values()).map(parseImages),
  });
});

// ---------- Homepage ----------
router.get('/homepage', async (req, res) => {
  const [slides, sections] = await Promise.all([
    prisma.heroSlide.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
    prisma.homepageSection.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
  ]);

  const resolvedSections = await Promise.all(
    sections.map(async (section) => {
      let config = {};
      try { config = JSON.parse(section.config || '{}'); } catch (e) { config = {}; }

      if (section.type === 'FEATURED_PRODUCTS' && Array.isArray(config.productSlugs)) {
        const products = await prisma.product.findMany({ where: { slug: { in: config.productSlugs }, isActive: true } });
        const ordered = config.productSlugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean);
        config = { ...config, products: ordered.map(parseImages) };
      }
      if (section.type === 'BEST_SELLERS') {
        const products = await prisma.product.findMany({ where: { isBestSeller: true, isActive: true }, take: 8 });
        config = { ...config, products: products.map(parseImages) };
      }
      if (section.type === 'NEW_ARRIVALS') {
        const products = await prisma.product.findMany({ where: { isNew: true, isActive: true }, take: 8 });
        config = { ...config, products: products.map(parseImages) };
      }
      if (section.type === 'FEATURED_COLLECTIONS' && Array.isArray(config.collectionSlugs)) {
        const collections = await prisma.collection.findMany({ where: { slug: { in: config.collectionSlugs }, isActive: true } });
        const ordered = config.collectionSlugs.map((s) => collections.find((c) => c.slug === s)).filter(Boolean);
        config = { ...config, collections: ordered };
      }
      if (section.type === 'PACKS' && config.collectionSlug) {
        const col = await prisma.collection.findUnique({ where: { slug: config.collectionSlug } });
        if (col) {
          const packs = await prisma.pack.findMany({ where: { collectionId: col.id, isActive: true }, orderBy: { position: 'asc' } });
          config = { ...config, packs, collectionSlug: col.slug };
        }
      }

      return { id: section.id, type: section.type, title: section.title, subtitle: section.subtitle, config };
    })
  );

  res.json({ slides, sections: resolvedSections });
});

// ---------- Nav menu ----------
router.get('/nav-menu', async (req, res) => {
  const items = await prisma.navMenuItem.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
  res.json(items);
});

// ---------- Search ----------
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (q.length < 2) return res.json({ products: [], collections: [] });

  const [products, collections] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.collection.findMany({ where: { isActive: true } }),
  ]);

  const matchedProducts = products
    .filter((p) => p.name.toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q))
    .slice(0, 8)
    .map(parseImages);
  const matchedCollections = collections.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4);

  res.json({ products: matchedProducts, collections: matchedCollections });
});

// ---------- Loyalty (customer-facing) ----------
router.post('/loyalty/lookup', async (req, res) => {
  const { phone, fullName } = req.body;
  if (!phone || !fullName) return res.status(400).json({ error: 'Téléphone et nom complet requis.' });

  // Lightweight verification: both phone AND the name on file must match,
  // so a stranger can't probe balances with a phone number alone.
  const customer = await prisma.customer.findUnique({ where: { phone: phone.trim() } });
  if (!customer || customer.fullName.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
    return res.status(404).json({ error: 'Aucun compte fidélité trouvé avec ces informations.' });
  }

  const ledger = await prisma.loyaltyLedger.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    include: { reward: true },
  });
  const balance = ledger.reduce((s, l) => s + l.points, 0);
  const rewards = await prisma.loyaltyReward.findMany({ where: { isActive: true }, orderBy: { pointsRequired: 'asc' } });
  const nextReward = rewards.find((r) => r.pointsRequired > balance);

  res.json({
    fullName: customer.fullName,
    balance,
    history: ledger.map((l) => ({ type: l.type, points: l.points, note: l.note, reward: l.reward ? l.reward.name : null, date: l.createdAt })),
    availableRewards: rewards.filter((r) => r.pointsRequired <= balance),
    nextReward: nextReward || null,
  });
});

// ---------- Promo validation ----------
router.post('/promo/validate', async (req, res) => {
  const { code, items } = req.body;
  if (!code || !Array.isArray(items)) return res.status(400).json({ valid: false, reason: 'Requête invalide.' });

  const promoCode = await prisma.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { eligibleProducts: true, eligiblePacks: true, eligibleCollections: true },
  });

  const resolvedItems = await resolveItemsPricing(items);
  if (resolvedItems.error) return res.status(400).json({ valid: false, reason: resolvedItems.error });

  const subtotal = resolvedItems.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const result = resolvePromo(promoCode, resolvedItems.items, subtotal);
  res.json(result);
});

// ---------- Checkout ----------
router.post('/orders', async (req, res) => {
  const { customer, items, promoCode: promoCodeStr, deliveryFee, clientOrderId } = req.body;

  if (!customer || !customer.fullName || !customer.address || !customer.city || !customer.phone) {
    return res.status(400).json({ error: 'Informations client incomplètes.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide.' });
  }

  // Idempotency: a retried/double-submitted checkout with the same client-generated
  // id must never create a second order — replay the original result instead.
  if (clientOrderId) {
    const existing = await prisma.order.findUnique({ where: { clientOrderId } });
    if (existing) {
      return res.json({
        orderNumber: existing.orderNumber,
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        total: existing.total,
      });
    }
  }

  const resolved = await resolveItemsPricing(items);
  if (resolved.error) return res.status(400).json({ error: resolved.error });

  const subtotal = resolved.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  let promoCode = null;
  let discountAmount = 0;
  if (promoCodeStr) {
    promoCode = await prisma.promoCode.findUnique({
      where: { code: promoCodeStr.trim().toUpperCase() },
      include: { eligibleProducts: true, eligiblePacks: true, eligibleCollections: true },
    });
    const promoResult = resolvePromo(promoCode, resolved.items, subtotal);
    if (!promoResult.valid) return res.status(400).json({ error: promoResult.reason });
    discountAmount = promoResult.discount;
  }

  const fee = Number(deliveryFee) || 0;
  const total = Math.max(0, subtotal - discountAmount + fee);
  const orderNumber = generateOrderNumber();

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Stock check + decrement
      const stockNeeds = new Map(); // productId -> total qty needed
      for (const item of resolved.items) {
        if (item.kind === 'PRODUCT') {
          stockNeeds.set(item.productId, (stockNeeds.get(item.productId) || 0) + item.quantity);
        } else {
          for (const comp of item.components) {
            stockNeeds.set(comp.productId, (stockNeeds.get(comp.productId) || 0) + item.quantity);
          }
        }
      }
      for (const [productId, needed] of stockNeeds) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product || product.stock < needed) {
          throw new Error(`Stock insuffisant pour "${product ? product.name : productId}".`);
        }
      }

      const customerRow = await tx.customer.upsert({
        where: { phone: customer.phone },
        update: { fullName: customer.fullName, address: customer.address, city: customer.city },
        create: { fullName: customer.fullName, address: customer.address, city: customer.city, phone: customer.phone },
      });

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          clientOrderId: clientOrderId || null,
          fullName: customer.fullName,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          subtotal,
          discountAmount,
          deliveryFee: fee,
          total,
          status: 'PENDING',
          customerId: customerRow.id,
          promoCodeId: promoCode ? promoCode.id : null,
        },
      });

      for (const item of resolved.items) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            kind: item.kind,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            detail: item.detail || null,
            productId: item.kind === 'PRODUCT' ? item.productId : null,
            packId: item.kind === 'PACK' ? item.packId : null,
          },
        });
        if (item.components) {
          for (const comp of item.components) {
            await tx.orderItemComponent.create({
              data: { orderItemId: orderItem.id, productId: comp.productId, name: comp.name },
            });
          }
        }
      }

      for (const [productId, needed] of stockNeeds) {
        const product = await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: needed } },
        });
        await tx.stockLog.create({
          data: {
            productId,
            changeAmount: -needed,
            reason: `Commande ${orderNumber}`,
            resultingStock: product.stock,
          },
        });
      }

      if (promoCode) {
        await tx.promoCode.update({ where: { id: promoCode.id }, data: { usageCount: { increment: 1 } } });
      }

      return createdOrder;
    });

    res.json({ orderNumber: order.orderNumber, subtotal, discountAmount, total });
  } catch (err) {
    // Race-condition safety net: two near-simultaneous double-submits both
    // pass the earlier findUnique check, but only one create() wins — the
    // loser hits the unique constraint. Replay the winner's result instead
    // of erroring, so the client still sees a successful confirmation.
    if (err.code === 'P2002' && clientOrderId) {
      const existing = await prisma.order.findUnique({ where: { clientOrderId } });
      if (existing) {
        return res.json({
          orderNumber: existing.orderNumber,
          subtotal: existing.subtotal,
          discountAmount: existing.discountAmount,
          total: existing.total,
        });
      }
    }
    res.status(400).json({ error: err.message || 'Impossible de finaliser la commande.' });
  }
});

// Resolves cart items sent by the client into authoritative, DB-priced line
// items. Never trusts client-sent prices — always re-derives them here.
async function resolveItemsPricing(items) {
  const resolved = [];

  for (const raw of items) {
    const quantity = Math.max(1, parseInt(raw.quantity, 10) || 1);

    if (raw.kind === 'PRODUCT') {
      const product = await prisma.product.findUnique({ where: { slug: raw.productSlug } });
      if (!product || !product.isActive) return { error: `Produit introuvable : ${raw.productSlug}` };
      resolved.push({
        kind: 'PRODUCT', productId: product.id, collectionId: product.collectionId,
        name: product.name, unitPrice: product.price, quantity, detail: null,
      });
      continue;
    }

    if (raw.kind === 'PACK') {
      const pack = await prisma.pack.findUnique({
        where: { id: raw.packId },
        include: { eligibleProducts: true },
      });
      if (!pack || !pack.isActive) return { error: 'Pack introuvable.' };
      const slugs = Array.isArray(raw.componentSlugs) ? raw.componentSlugs : [];
      if (slugs.length !== pack.size) return { error: `Le pack "${pack.name}" nécessite exactement ${pack.size} produits.` };

      const components = await prisma.product.findMany({ where: { slug: { in: slugs } } });
      if (components.length !== slugs.length) return { error: 'Un des produits du pack est introuvable.' };

      const allowedIds = pack.useCollectionEligibility
        ? null
        : new Set(pack.eligibleProducts.map((r) => r.productId));

      for (const comp of components) {
        if (!comp.isActive) return { error: `"${comp.name}" n'est plus disponible.` };
        if (pack.useCollectionEligibility && comp.collectionId !== pack.collectionId) {
          return { error: `"${comp.name}" n'est pas éligible pour ce pack.` };
        }
        if (allowedIds && !allowedIds.has(comp.id)) {
          return { error: `"${comp.name}" n'est pas éligible pour ce pack.` };
        }
      }

      resolved.push({
        kind: 'PACK', packId: pack.id, collectionId: pack.collectionId,
        name: pack.name, unitPrice: pack.price, quantity,
        detail: `${pack.size} produits — ${components.map((c) => c.name).join(', ')}`,
        components: components.map((c) => ({ productId: c.id, name: c.name })),
      });
      continue;
    }

    if (raw.kind === 'FREE_PACK') {
      const config = await prisma.freePackConfig.findFirst({
        where: { isActive: true },
        include: { eligibleCollections: true, eligibleProducts: true },
      });
      if (!config) return { error: 'Free Pack indisponible.' };

      const slugs = Array.isArray(raw.componentSlugs) ? raw.componentSlugs : [];
      if (slugs.length < config.minItems) {
        return { error: `Le ${config.name} nécessite au moins ${config.minItems} produits.` };
      }

      const components = await prisma.product.findMany({ where: { slug: { in: slugs } } });
      if (components.length !== slugs.length) return { error: 'Un des produits sélectionnés est introuvable.' };

      const eligibleCollectionIds = new Set(config.eligibleCollections.map((r) => r.collectionId));
      const eligibleProductIds = new Set(config.eligibleProducts.map((r) => r.productId));

      for (const comp of components) {
        const ok = comp.isActive && (comp.freePackEligible || eligibleProductIds.has(comp.id) || eligibleCollectionIds.has(comp.collectionId));
        if (!ok) return { error: `"${comp.name}" n'est pas éligible pour le ${config.name}.` };
      }

      if (!config.allowMixCategories) {
        const distinctCollections = new Set(components.map((c) => c.collectionId));
        if (distinctCollections.size > 1) {
          return { error: `Le ${config.name} ne permet pas de mélanger plusieurs catégories.` };
        }
      }

      const unitPrice = components.reduce((s, c) => s + c.price, 0);
      resolved.push({
        kind: 'FREE_PACK', collectionId: null,
        name: config.name, unitPrice, quantity,
        detail: components.map((c) => c.name).join(', '),
        components: components.map((c) => ({ productId: c.id, name: c.name })),
      });
      continue;
    }

    return { error: 'Article de panier invalide.' };
  }

  return { items: resolved };
}

module.exports = router;
