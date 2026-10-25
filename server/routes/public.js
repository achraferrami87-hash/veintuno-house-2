const express = require('express');
const prisma = require('../db');
const { resolvePromo } = require('../utils/promo');
const { generateOrderNumber } = require('../utils/orderNumber');
const { sendMetaPurchase } = require('../utils/metaCapi');

const router = express.Router();

// Flash Sale is never a permanent price change — `product.price` always stays
// the real normal price; this only resolves what the customer sees/pays *now*.
function getEffectivePrice(product) {
  // A campaign's own start/end, when the product belongs to one, govern
  // the countdown shown to the customer — so every product in the same
  // named campaign counts down to the exact same moment. The campaign
  // never sets a price itself: whether this product is actually on sale,
  // and at what price, still comes entirely from its own flashSale* fields.
  const campaignActive = product.campaign && product.campaign.isActive;
  const countdownEnd = campaignActive ? product.campaign.endAt : product.flashSaleEnd;

  if (!product.flashSaleActive || product.flashSalePrice == null) {
    return { price: product.price, onSale: false, countdownEnd: null };
  }
  const now = new Date();
  const start = campaignActive ? product.campaign.startAt : product.flashSaleStart;
  const end = campaignActive ? product.campaign.endAt : product.flashSaleEnd;
  if (start && now < new Date(start)) return { price: product.price, onSale: false, countdownEnd: null };
  if (end && now > new Date(end)) return { price: product.price, onSale: false, countdownEnd: null };
  return { price: product.flashSalePrice, onSale: true, countdownEnd };
}

// A few of a collection's own product photos, used as small round "preview"
// thumbnails next to its main square tile — reuses whatever product images
// already exist, no new admin field involved.
async function attachCollectionPreviews(collections) {
  return Promise.all(collections.map(async (c) => {
    const products = await prisma.product.findMany({
      where: { collectionId: c.id, isActive: true },
      orderBy: { position: 'asc' },
      take: 3,
      select: { images: true },
    });
    const previewImages = products
      .map((p) => { try { return JSON.parse(p.images || '[]')[0]; } catch (e) { return null; } })
      .filter(Boolean);
    return { ...c, previewImages };
  }));
}

function parseImages(product) {
  let images = [];
  try { images = JSON.parse(product.images || '[]'); } catch (e) { images = []; }
  let genders = [];
  try { genders = JSON.parse(product.genders || '[]'); } catch (e) { genders = []; }
  // Backward compatibility: a product only ever migrated with the old
  // single `gender` value still resolves correctly even if `genders` is empty.
  if (genders.length === 0 && product.gender) genders = [product.gender];
  let filterOptionIds = [];
  try { filterOptionIds = JSON.parse(product.filterOptionIds || '[]'); } catch (e) { filterOptionIds = []; }
  const { price: displayPrice, onSale, countdownEnd } = getEffectivePrice(product);
  const characteristics = Array.isArray(product.characteristics)
    ? product.characteristics.map((c) => c.characteristic.name)
    : undefined;
  const parseNotes = (raw) => { try { return JSON.parse(raw || '[]'); } catch (e) { return []; } };
  const discountPercent = onSale && product.price > 0
    ? Math.round((1 - displayPrice / product.price) * 100)
    : null;
  const out = {
    ...product, images, genders, filterOptionIds, displayPrice, onSale, originalPrice: product.price,
    discountPercent, countdownEnd,
    campaignName: product.campaign ? product.campaign.name : null,
    notesTopData: parseNotes(product.notesTopData),
    notesHeartData: parseNotes(product.notesHeartData),
    notesBaseData: parseNotes(product.notesBaseData),
  };
  if (characteristics) out.characteristics = characteristics;
  return out;
}

// Bulk rating aggregate for a list of products — one grouped query instead
// of N per-product requests, so listing grids can show real stars without
// a network call per card. Never fabricated: products with no approved
// review get ratingCount: 0 and the frontend simply hides the stars.
async function attachRatings(products) {
  if (!products.length) return products;
  const ids = products.map((p) => p.id);
  const grouped = await prisma.review.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const byId = new Map(grouped.map((g) => [g.productId, { ratingAverage: g._avg.rating, ratingCount: g._count._all }]));
  return products.map((p) => {
    const r = byId.get(p.id);
    return { ...p, ratingAverage: r ? r.ratingAverage : null, ratingCount: r ? r.ratingCount : 0 };
  });
}

function isValidPhone(phone) {
  return /^\d{10}$/.test((phone || '').toString().trim());
}
const PHONE_ERROR = 'Veuillez entrer un numéro de téléphone valide de 10 chiffres.';

// ---------- Site settings (WhatsApp / Instagram / perfume disclaimer) ----------
router.get('/settings', async (req, res) => {
  let settings = await prisma.siteSettings.findFirst();
  if (!settings) settings = await prisma.siteSettings.create({ data: {} });
  res.json(settings);
});

// ---------- Loyalty program info (public, read-only) ----------
router.get('/loyalty-info', async (req, res) => {
  let settings = await prisma.loyaltySettings.findFirst();
  if (!settings) settings = await prisma.loyaltySettings.create({ data: {} });
  res.json({
    isActive: settings.isActive,
    amountPerPoint: settings.amountPerPoint,
    amountPerPointSecondary: settings.amountPerPointSecondary,
    pointsExplanation: settings.pointsExplanation || null,
  });
});

// ---------- Fragrance characteristics (tag vocabulary shared by search + quiz) ----------
router.get('/characteristics', async (req, res) => {
  const characteristics = await prisma.characteristic.findMany({ orderBy: { position: 'asc' } });
  res.json(characteristics);
});

// ---------- FAQ (storefront accordion + support chat, same data) ----------
// ?page=home only returns global FAQs (page: null) plus that page's own —
// omit ?page to get every active FAQ (used by the chat's full category list).
router.get('/faq', async (req, res) => {
  const where = { isActive: true };
  if (req.query.page) where.OR = [{ page: null }, { page: req.query.page }];
  const faqs = await prisma.faq.findMany({ where, orderBy: { position: 'asc' } });
  res.json(faqs);
});

// ---------- Campaigns (currently-running ones only, for countdown display) ----------
router.get('/campaigns/active', async (req, res) => {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: { isActive: true, startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { endAt: 'asc' },
  });
  res.json(campaigns);
});

// ---------- Collections ----------
router.get('/collections', async (req, res) => {
  const where = { isActive: true };
  if (req.query.nav === 'true') where.showInNav = true;
  const collections = await prisma.collection.findMany({
    where,
    orderBy: { position: 'asc' },
  });
  res.json(await attachCollectionPreviews(collections));
});

router.get('/collections/:slug', async (req, res) => {
  const collection = await prisma.collection.findUnique({
    where: { slug: req.params.slug },
    include: { filterOptions: { orderBy: { position: 'asc' } } },
  });
  if (!collection || !collection.isActive) return res.status(404).json({ error: 'Collection introuvable.' });

  const [products, packs, bundles] = await Promise.all([
    prisma.product.findMany({
      where: { collectionId: collection.id, isActive: true },
      include: { campaign: true },
      orderBy: { position: 'asc' },
    }),
    prisma.pack.findMany({
      where: { collectionId: collection.id, isActive: true },
      orderBy: { position: 'asc' },
    }),
    // Bundles assigned to this collection from the admin dashboard — shown
    // inline in the same product grid, not a separate section.
    prisma.bundle.findMany({
      where: { isActive: true, collections: { some: { id: collection.id } } },
      orderBy: { position: 'asc' },
      include: { items: { include: { product: true } } },
    }),
  ]);

  res.json({
    collection,
    // productCardHTML (frontend) reads product.collection.packOnly to decide
    // whether to show "Ajouter au panier" or "En pack uniquement" — attach
    // the collection we already fetched instead of an extra join, since
    // every product here belongs to it by definition.
    products: await attachRatings(products.map((p) => parseImages({ ...p, collection }))),
    packs,
    bundles: bundles.map((b) => ({
      id: b.id, slug: b.slug, name: b.name, description: b.description,
      image: b.image, price: b.price,
      items: b.items.map((it) => ({ product: parseImages(it.product), quantity: it.quantity })),
    })),
  });
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

  const products = await prisma.product.findMany({
    where,
    include: { collection: true, characteristics: { include: { characteristic: true } }, campaign: true },
    orderBy: { position: 'asc' },
  });
  res.json(products.map(parseImages));
});

router.get('/products/:slug', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { collection: true, characteristics: { include: { characteristic: true } }, campaign: true },
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
        collection: { name: pack.collection.name, slug: pack.collection.slug },
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
    ? await prisma.product.findMany({ where: { collectionId: { in: collectionIds }, isActive: true }, include: { collection: true } })
    : [];
  const byProductRaw = config.eligibleProducts.map((r) => r.product).filter((p) => p.isActive);
  const byProduct = byProductRaw.length
    ? await prisma.product.findMany({ where: { id: { in: byProductRaw.map((p) => p.id) } }, include: { collection: true } })
    : [];

  const merged = new Map();
  [...byCollection, ...byProduct].forEach((p) => merged.set(p.id, p));

  // Per-item Free Pack price, so the storefront can show each product's real
  // Free Pack price (perfume vs gel douche) instead of its normal price.
  function freePackItemPrice(product) {
    const slug = product.collection ? product.collection.slug : null;
    if (slug === 'parfums') return config.perfumePrice;
    if (slug === 'gels-douche') return config.gelDouchePrice;
    return product.price;
  }

  res.json({
    id: config.id,
    name: config.name,
    minItems: config.minItems,
    allowMixCategories: config.allowMixCategories,
    perfumePrice: config.perfumePrice,
    gelDouchePrice: config.gelDouchePrice,
    eligibleProducts: Array.from(merged.values()).map((p) => ({ ...parseImages(p), freePackPrice: freePackItemPrice(p) })),
  });
});

// ---------- Bundles ----------
router.get('/bundles', async (req, res) => {
  const bundles = await prisma.bundle.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { items: { include: { product: true } } },
  });
  res.json(bundles.map((b) => ({
    id: b.id, slug: b.slug, name: b.name, description: b.description,
    image: b.image, price: b.price,
    items: b.items.map((it) => ({ product: parseImages(it.product), quantity: it.quantity })),
  })));
});

router.get('/bundles/:slug', async (req, res) => {
  const bundle = await prisma.bundle.findUnique({
    where: { slug: req.params.slug },
    include: { items: { include: { product: true } } },
  });
  if (!bundle || !bundle.isActive) return res.status(404).json({ error: 'Bundle introuvable.' });
  res.json({
    id: bundle.id, slug: bundle.slug, name: bundle.name, description: bundle.description,
    image: bundle.image, price: bundle.price,
    items: bundle.items.map((it) => ({ product: parseImages(it.product), quantity: it.quantity })),
  });
});

// ---------- Homepage ----------
router.get('/homepage', async (req, res) => {
  const [slides, sections, videos] = await Promise.all([
    prisma.heroSlide.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
    prisma.homepageSection.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
    prisma.homepageVideo.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } }),
  ]);

  const resolvedSections = await Promise.all(
    sections.map(async (section) => {
      let config = {};
      try { config = JSON.parse(section.config || '{}'); } catch (e) { config = {}; }

      if (section.type === 'FEATURED_PRODUCTS' && Array.isArray(config.productSlugs)) {
        const products = await prisma.product.findMany({ where: { slug: { in: config.productSlugs }, isActive: true }, include: { collection: true, campaign: true } });
        const ordered = config.productSlugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean);
        config = { ...config, products: ordered.map(parseImages) };
      }
      if (section.type === 'BEST_SELLERS') {
        const products = await prisma.product.findMany({ where: { isBestSeller: true, isActive: true }, include: { collection: true, campaign: true }, take: 8 });
        config = { ...config, products: products.map(parseImages) };
      }
      if (section.type === 'NEW_ARRIVALS') {
        const products = await prisma.product.findMany({ where: { isNew: true, isActive: true }, include: { collection: true, campaign: true }, take: 8 });
        config = { ...config, products: products.map(parseImages) };
      }
      if (section.type === 'FEATURED_COLLECTIONS' && Array.isArray(config.collectionSlugs)) {
        const collections = await prisma.collection.findMany({ where: { slug: { in: config.collectionSlugs }, isActive: true } });
        const ordered = config.collectionSlugs.map((s) => collections.find((c) => c.slug === s)).filter(Boolean);
        config = { ...config, collections: await attachCollectionPreviews(ordered) };
      }
      if (section.type === 'BUNDLES') {
        const bundles = await prisma.bundle.findMany({
          where: { isActive: true },
          orderBy: { position: 'asc' },
          include: { items: { include: { product: true } } },
        });
        config = {
          ...config,
          bundles: bundles.map((b) => ({
            id: b.id, slug: b.slug, name: b.name, description: b.description, image: b.image, price: b.price,
            items: b.items.map((it) => ({ product: parseImages(it.product), quantity: it.quantity })),
          })),
        };
      }
      if (section.type === 'PACKS' && config.collectionSlug) {
        const col = await prisma.collection.findUnique({ where: { slug: config.collectionSlug } });
        if (col) {
          const packs = await prisma.pack.findMany({ where: { collectionId: col.id, isActive: true }, orderBy: { position: 'asc' } });
          config = { ...config, packs, collectionSlug: col.slug };
        }
      }
      if (section.type === 'PRODUCT_SHOWCASE' && config.productSlug) {
        const product = await prisma.product.findUnique({ where: { slug: config.productSlug }, include: { collection: true, campaign: true } });
        if (product && product.isActive) config = { ...config, product: parseImages(product) };
      }
      if (section.type === 'CLIENT_REVIEWS') {
        const reviews = await prisma.review.findMany({
          where: { showOnHomepage: true, status: 'APPROVED' },
          orderBy: { position: 'asc' },
          include: { product: { select: { name: true, slug: true } } },
          take: 12,
        });
        config = { ...config, reviews };
      }

      return { id: section.id, type: section.type, title: section.title, subtitle: section.subtitle, config };
    })
  );

  res.json({ slides, sections: resolvedSections, videos });
});

// Recent real orders for the storefront's purchase notification. Only the
// product name, quantity and time are exposed — never customer names or cities.
router.get('/recent-purchases', async (req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, items: { select: { name: true, quantity: true, productId: true, packId: true }, take: 1 } },
  });
  const productIds = orders.map((o) => o.items[0] && o.items[0].productId).filter(Boolean);
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, images: true } })
    : [];
  const imageById = new Map(products.map((p) => {
    let images = [];
    try { images = JSON.parse(p.images || '[]'); } catch (e) { images = []; }
    return [p.id, images[0] || null];
  }));

  // How many real orders in the same recent window picked this exact pack/
  // product — shown to visitors as "N personne(s) ont pris ...". Always a
  // genuine count from the database, never an invented number.
  const countCache = new Map();
  async function countFor(item) {
    const key = `${item.packId || ''}|${item.productId || ''}|${item.name}`;
    if (countCache.has(key)) return countCache.get(key);
    const where = {
      order: { status: { not: 'CANCELLED' }, createdAt: { gte: since } },
      ...(item.packId ? { packId: item.packId } : item.productId ? { productId: item.productId } : { name: item.name }),
    };
    const count = await prisma.orderItem.count({ where });
    countCache.set(key, count);
    return count;
  }

  const events = [];
  for (const o of orders) {
    const item = o.items[0];
    if (!item || !item.name) continue;
    events.push({
      name: item.name,
      quantity: item.quantity,
      image: item.productId ? imageById.get(item.productId) || null : null,
      createdAt: o.createdAt,
      count: await countFor(item),
    });
  }
  res.json(events);
});

// ---------- Nav menu ----------
router.get('/nav-menu', async (req, res) => {
  const items = await prisma.navMenuItem.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
  res.json(items);
});

// ---------- "Find Your Scent" quiz ----------
router.get('/quiz', async (req, res) => {
  const questions = await prisma.quizQuestion.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { answers: { orderBy: { position: 'asc' } } },
  });
  res.json(questions);
});

// The customer never sees or influences scoring directly — they submit
// {questionId, answerId} pairs and every product's match % is computed here,
// from admin-configured answer→characteristic weights, never hardcoded.
router.post('/quiz/results', async (req, res) => {
  const answerIds = Array.isArray(req.body.answerIds) ? req.body.answerIds : [];
  if (!answerIds.length) return res.json({ results: [] });

  const answerLinks = await prisma.quizAnswerCharacteristic.findMany({
    where: { answerId: { in: answerIds } },
  });
  if (!answerLinks.length) return res.json({ results: [] });

  const weightByCharacteristic = new Map(); // characteristicId -> summed weight from all chosen answers
  answerLinks.forEach((link) => {
    weightByCharacteristic.set(link.characteristicId, (weightByCharacteristic.get(link.characteristicId) || 0) + link.weight);
  });
  const characteristicIds = Array.from(weightByCharacteristic.keys());

  const products = await prisma.product.findMany({
    where: { isActive: true, characteristics: { some: { characteristicId: { in: characteristicIds } } } },
    include: { collection: true, characteristics: { include: { characteristic: true } } },
  });

  const maxPossibleScore = Array.from(weightByCharacteristic.values()).reduce((s, w) => s + w, 0) || 1;

  const scored = products.map((product) => {
    const matched = product.characteristics.filter((pc) => weightByCharacteristic.has(pc.characteristicId));
    const score = matched.reduce((s, pc) => s + weightByCharacteristic.get(pc.characteristicId), 0);
    return {
      product: parseImages(product),
      matchPercent: Math.min(100, Math.round((score / maxPossibleScore) * 100)),
      matchedCharacteristics: matched.map((pc) => pc.characteristic.name),
    };
  });

  scored.sort((a, b) => b.matchPercent - a.matchPercent);
  res.json({ results: scored.slice(0, 5) });
});

// ---------- Search ----------
// Token + tag scoring, not just an exact-name substring match — a query like
// "fresh summer perfume" surfaces products tagged Fresh/Summer even when
// those words never appear in the product name itself. No external AI/
// embeddings service involved: this is a simple, fast weighted keyword score.
router.get('/search', async (req, res) => {
  const raw = (req.query.q || '').toString().trim().toLowerCase();
  if (raw.length < 2) return res.json({ products: [], collections: [] });
  const tokens = raw.split(/\s+/).filter(Boolean);

  const [products, collections] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { collection: true, characteristics: { include: { characteristic: true } } },
    }),
    prisma.collection.findMany({ where: { isActive: true } }),
  ]);

  function scoreProduct(p) {
    const name = p.name.toLowerCase();
    let genders = [];
    try { genders = JSON.parse(p.genders || '[]'); } catch (e) { genders = []; }
    const taggedFields = [
      p.notes, p.notesTop, p.notesHeart, p.notesBase,
      p.collection ? p.collection.name : '',
      ...genders,
      ...(p.characteristics || []).map((c) => c.characteristic.name),
    ].filter(Boolean).map((s) => s.toString().toLowerCase());

    let score = 0;
    if (name.includes(raw)) score += 10; // whole-phrase match on the name ranks highest
    tokens.forEach((t) => {
      if (name.includes(t)) score += 5;
      taggedFields.forEach((f) => { if (f.includes(t)) score += 2; });
    });
    return score;
  }

  const matchedProducts = products
    .map((p) => ({ p, score: scoreProduct(p) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => parseImages(r.p));
  const matchedCollections = collections.filter((c) => c.name.toLowerCase().includes(raw)).slice(0, 4);

  res.json({ products: matchedProducts, collections: matchedCollections });
});

// ---------- Loyalty (customer-facing) ----------
router.post('/loyalty/lookup', async (req, res) => {
  const { phone, fullName } = req.body;
  if (!phone || !fullName) return res.status(400).json({ error: 'Téléphone et nom complet requis.' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: PHONE_ERROR });

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

// ---------- Order receipt (phone-protected: order number + phone must match) ----------
router.get('/orders/:orderNumber/receipt', async (req, res) => {
  const phone = (req.query.phone || '').toString().trim();
  if (!phone) return res.status(400).json({ error: 'Numéro de téléphone requis.' });

  const order = await prisma.order.findUnique({
    where: { orderNumber: req.params.orderNumber },
    include: {
      items: { include: { components: { include: { product: { select: { slug: true } } } }, product: { select: { slug: true } } } },
      promoCode: true,
    },
  });
  if (!order || order.phone.trim() !== phone) return res.status(404).json({ error: 'Commande introuvable.' });

  // Loyalty points earned/used tied to this order, for the receipt breakdown.
  const ledgerEntries = await prisma.loyaltyLedger.findMany({ where: { orderId: order.id } });
  const pointsEarned = ledgerEntries.filter((l) => l.type === 'EARNED').reduce((s, l) => s + l.points, 0);
  const pointsRedeemed = ledgerEntries.filter((l) => l.type === 'REDEEMED').reduce((s, l) => s + Math.abs(l.points), 0);

  res.json({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    fullName: order.fullName,
    phone: order.phone,
    address: order.address,
    city: order.city,
    items: order.items.map((it) => ({
      kind: it.kind, name: it.name, unitPrice: it.unitPrice, quantity: it.quantity,
      detail: it.detail, productSlug: it.product ? it.product.slug : null,
      components: it.components.map((c) => c.name),
      componentSlugs: it.components.map((c) => c.product ? c.product.slug : null).filter(Boolean),
    })),
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    promoCode: order.promoCode ? order.promoCode.code : null,
    deliveryFee: order.deliveryFee,
    total: order.total,
    pointsEarned,
    pointsRedeemed,
  });
});

// ---------- Order history (phone + fullName verification, like loyalty lookup) ----------
router.post('/orders/history', async (req, res) => {
  const { phone, fullName } = req.body;
  if (!phone || !fullName) return res.status(400).json({ error: 'Téléphone et nom complet requis.' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: PHONE_ERROR });

  const customer = await prisma.customer.findUnique({ where: { phone: phone.trim() } });
  if (!customer || customer.fullName.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
    return res.status(404).json({ error: 'Aucune commande trouvée avec ces informations.' });
  }

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  res.json({
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      total: o.total,
      items: o.items.map((it) => ({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice })),
    })),
  });
});

// ---------- Loyalty: "Réclamer vos points" redemption request ----------
router.post('/loyalty/redeem-request', async (req, res) => {
  const { phone, fullName, rewardId } = req.body;
  if (!phone || !fullName) return res.status(400).json({ error: 'Téléphone et nom complet requis.' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: PHONE_ERROR });

  const customer = await prisma.customer.findUnique({ where: { phone: phone.trim() } });
  if (!customer || customer.fullName.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
    return res.status(404).json({ error: 'Aucun compte fidélité trouvé avec ces informations.' });
  }

  const ledger = await prisma.loyaltyLedger.findMany({ where: { customerId: customer.id } });
  const balance = ledger.reduce((s, l) => s + l.points, 0);

  let reward = null;
  if (rewardId) reward = await prisma.loyaltyReward.findUnique({ where: { id: rewardId } });

  await prisma.loyaltyRedemptionRequest.create({
    data: {
      fullName: customer.fullName,
      phone: customer.phone,
      pointsAtRequest: balance,
      requestedRewardId: reward ? reward.id : null,
      requestedRewardName: reward ? reward.name : null,
    },
  });

  res.json({ message: 'Votre demande a bien été reçue. Nous allons vous contacter prochainement.' });
});

// ---------- Reviews (customer-facing) ----------
router.get('/review-settings', async (req, res) => {
  let settings = await prisma.reviewSettings.findFirst();
  if (!settings) settings = await prisma.reviewSettings.create({ data: {} });
  res.json(settings);
});

router.get('/products/:slug/reviews', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

  const settings = await prisma.reviewSettings.findFirst();
  if (settings && !settings.isEnabled) return res.json({ reviews: [], avgRating: 0, count: 0, enabled: false });

  const minRating = settings ? settings.minRating : 1;
  const allApproved = await prisma.review.findMany({
    where: { productId: product.id, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
  });
  const avgRating = allApproved.length ? allApproved.reduce((s, r) => s + r.rating, 0) / allApproved.length : 0;
  const count = allApproved.length;

  let visible = allApproved.filter((r) => r.rating >= minRating);
  const sortOrder = settings ? settings.sortOrder : 'recent';
  if (sortOrder === 'rating_high') visible = visible.sort((a, b) => b.rating - a.rating);
  else if (sortOrder === 'rating_low') visible = visible.sort((a, b) => a.rating - b.rating);
  else if (sortOrder === 'featured') visible = visible.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const displayCount = settings ? settings.displayCount : 10;
  visible = visible.slice(0, displayCount);

  const showCustomerName = !settings || settings.showCustomerName;
  res.json({
    reviews: visible.map((r) => ({
      rating: r.rating, text: r.text,
      customerName: showCustomerName ? r.customerName : null,
      featured: r.featured, date: r.createdAt,
    })),
    avgRating,
    count,
    enabled: true,
  });
});

router.post('/reviews', async (req, res) => {
  const { productSlug, orderNumber, phone, rating, text, customerName } = req.body;
  const ratingNum = parseInt(rating, 10);
  if (!productSlug || !orderNumber || !phone || !ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Informations manquantes ou note invalide (1 à 5).' });
  }
  if (!isValidPhone(phone)) return res.status(400).json({ error: PHONE_ERROR });

  const reviewSettings = await prisma.reviewSettings.findFirst();
  if (reviewSettings && !reviewSettings.isEnabled) {
    return res.status(403).json({ error: 'Les avis clients sont temporairement désactivés.' });
  }

  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

  // Only a customer with a DELIVERED order containing this product, matched
  // by phone, is allowed to leave a review — prevents drive-by fake reviews.
  // The product may appear directly (PRODUCT item) or as a component of a
  // PACK/FREE_PACK/BUNDLE item, so both places must be checked.
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: { include: { components: true } } },
  });
  if (!order || order.phone.trim() !== phone.trim() || order.status !== 'DELIVERED') {
    return res.status(403).json({ error: 'Seules les commandes livrées peuvent être notées.' });
  }
  const hasProduct = order.items.some((it) => it.productId === product.id || it.components.some((c) => c.productId === product.id));
  if (!hasProduct) return res.status(403).json({ error: 'Ce produit ne fait pas partie de cette commande.' });

  const existing = await prisma.review.findFirst({ where: { orderId: order.id, productId: product.id } });
  if (existing) return res.status(400).json({ error: 'Vous avez déjà noté ce produit pour cette commande.' });

  const autoApprove = reviewSettings && !reviewSettings.requireApproval || (reviewSettings && reviewSettings.autoApprove);
  await prisma.review.create({
    data: {
      productId: product.id,
      orderId: order.id,
      rating: ratingNum,
      text: text || null,
      customerName: customerName || order.fullName,
      status: autoApprove ? 'APPROVED' : 'PENDING',
    },
  });

  res.json({
    message: autoApprove
      ? 'Merci pour votre avis ! Il est déjà visible sur la fiche produit.'
      : 'Merci pour votre avis ! Il sera visible après validation par notre équipe.',
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
// Gel Douche individual-unit delivery fee: 30 MAD, only when the order
// contains exactly one Gel Douche bought as a standalone product (not part
// of a pack) and no pack at all. Computed here — never trusted from the
// client — from the already-resolved, price-verified cart items.
async function computeGelDoucheDeliveryFee(resolvedItems) {
  if (resolvedItems.some((i) => i.kind === 'PACK')) return 0;
  const gelsDouche = await prisma.collection.findUnique({ where: { slug: 'gels-douche' } });
  if (!gelsDouche) return 0;
  const gelDoucheQty = resolvedItems
    .filter((i) => i.kind === 'PRODUCT' && i.collectionId === gelsDouche.id)
    .reduce((s, i) => s + i.quantity, 0);
  return gelDoucheQty === 1 ? 30 : 0;
}

router.post('/orders', async (req, res) => {
  const { customer, items, promoCode: promoCodeStr, clientOrderId } = req.body;

  if (!customer || !customer.fullName || !customer.address || !customer.city || !customer.phone) {
    return res.status(400).json({ error: 'Informations client incomplètes.' });
  }
  if (!isValidPhone(customer.phone)) {
    return res.status(400).json({ error: PHONE_ERROR });
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

  const fee = await computeGelDoucheDeliveryFee(resolved.items);
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
            const per = comp.quantity || 1;
            stockNeeds.set(comp.productId, (stockNeeds.get(comp.productId) || 0) + item.quantity * per);
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
            bundleId: item.kind === 'BUNDLE' ? item.bundleId : null,
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

    await sendMetaPurchase({ req, order, items, customer, metaContext: req.body.metaContext });
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
      // Always re-derive the price server-side — a live Flash Sale is honored
      // automatically, but the client can never dictate the price it pays.
      const { price: unitPrice } = getEffectivePrice(product);
      resolved.push({
        kind: 'PRODUCT', productId: product.id, collectionId: product.collectionId,
        name: product.name, unitPrice, quantity, detail: null,
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

      // Look up by the unique set of slugs (findMany dedupes on the DB side),
      // then re-expand against the original (possibly repeated) slugs list so
      // a customer can pick the same perfume more than once within a pack.
      const uniqueSlugs = [...new Set(slugs)];
      const uniqueProducts = await prisma.product.findMany({ where: { slug: { in: uniqueSlugs } } });
      if (uniqueProducts.length !== uniqueSlugs.length) return { error: 'Un des produits du pack est introuvable.' };
      const bySlug = new Map(uniqueProducts.map((p) => [p.slug, p]));
      const components = slugs.map((s) => bySlug.get(s));

      const allowedIds = pack.useCollectionEligibility
        ? null
        : new Set(pack.eligibleProducts.map((r) => r.productId));

      for (const comp of uniqueProducts) {
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
        detail: `${pack.size} produits — ${summarizeComponentCounts(components)}`,
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

      const uniqueSlugs = [...new Set(slugs)];
      const uniqueProducts = await prisma.product.findMany({
        where: { slug: { in: uniqueSlugs } },
        include: { collection: true },
      });
      if (uniqueProducts.length !== uniqueSlugs.length) return { error: 'Un des produits sélectionnés est introuvable.' };
      const bySlug = new Map(uniqueProducts.map((p) => [p.slug, p]));
      const components = slugs.map((s) => bySlug.get(s));

      const eligibleCollectionIds = new Set(config.eligibleCollections.map((r) => r.collectionId));
      const eligibleProductIds = new Set(config.eligibleProducts.map((r) => r.productId));

      for (const comp of uniqueProducts) {
        const ok = comp.isActive && (comp.freePackEligible || eligibleProductIds.has(comp.id) || eligibleCollectionIds.has(comp.collectionId));
        if (!ok) return { error: `"${comp.name}" n'est pas éligible pour le ${config.name}.` };
      }

      if (!config.allowMixCategories) {
        const distinctCollections = new Set(uniqueProducts.map((c) => c.collectionId));
        if (distinctCollections.size > 1) {
          return { error: `Le ${config.name} ne permet pas de mélanger plusieurs catégories.` };
        }
      }

      // Per-item Free Pack pricing: every perfume is priced individually at
      // config.perfumePrice and every gel douche at config.gelDouchePrice —
      // these are NOT summed into one flat total for the whole pack. Any
      // other category (supplements, cosmetics) keeps its normal price.
      // This pricing rule applies ONLY inside the Free Pack — normal product
      // prices, regular Packs, and the rest of the cart are untouched.
      function freePackItemPrice(product) {
        const slug = product.collection ? product.collection.slug : null;
        if (slug === 'parfums') return config.perfumePrice;
        if (slug === 'gels-douche') return config.gelDouchePrice;
        return product.price;
      }
      const unitPrice = components.reduce((s, c) => s + freePackItemPrice(c), 0);
      resolved.push({
        kind: 'FREE_PACK', collectionId: null,
        name: config.name, unitPrice, quantity,
        detail: summarizeComponentCounts(components),
        components: components.map((c) => ({ productId: c.id, name: c.name })),
      });
      continue;
    }

    if (raw.kind === 'BUNDLE') {
      const bundle = await prisma.bundle.findUnique({
        where: { id: raw.bundleId },
        include: { items: { include: { product: true } } },
      });
      if (!bundle || !bundle.isActive) return { error: 'Bundle introuvable.' };
      for (const it of bundle.items) {
        if (!it.product.isActive) return { error: `"${it.product.name}" n'est plus disponible.` };
      }
      resolved.push({
        kind: 'BUNDLE', bundleId: bundle.id, collectionId: null,
        name: bundle.name, unitPrice: bundle.price, quantity,
        detail: bundle.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', '),
        components: bundle.items.map((it) => ({ productId: it.productId, name: it.product.name, quantity: it.quantity })),
      });
      continue;
    }

    return { error: 'Article de panier invalide.' };
  }

  return { items: resolved };
}

// Turns a (possibly repeated) list of products into a readable summary like
// "Atlas Noir ×2, Minuit Cuir" instead of listing the same name repeatedly.
function summarizeComponentCounts(components) {
  const counts = new Map();
  for (const c of components) counts.set(c.name, (counts.get(c.name) || 0) + 1);
  return Array.from(counts.entries()).map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}

const FUNNEL_EVENTS = new Set([
  'visit', 'view_collection', 'view_product', 'view_pack', 'pack_selected',
  'perfume_selection_started', 'perfume_selected', 'perfumes_selected',
  'checkout_opened', 'form_started', 'form_abandoned', 'order_submit_clicked',
  'order_created', 'confirmation_viewed', 'whatsapp_clicked', 'click',
]);

const trackHits = new Map();
function trackAllowed(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const now = Date.now();
  const rec = trackHits.get(ip) || { count: 0, start: now };
  if (now - rec.start > 60000) { rec.count = 0; rec.start = now; }
  rec.count += 1;
  if (trackHits.size > 5000) trackHits.clear();
  trackHits.set(ip, rec);
  return rec.count <= 120;
}

router.post('/track', async (req, res) => {
  if (!trackAllowed(req)) return res.status(429).end();
  const { sessionId, event, label } = req.body || {};
  if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 64) return res.status(400).end();
  if (!FUNNEL_EVENTS.has(event)) return res.status(400).end();
  await prisma.funnelEvent.create({
    data: { sessionId, event, label: typeof label === 'string' ? label.slice(0, 120) : null },
  });
  res.status(204).end();
});

module.exports = router;
