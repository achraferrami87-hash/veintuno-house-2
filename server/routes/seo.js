// Crawlable, real-URL pages for search/AI discovery — additive only. These
// routes never touch the cart, checkout, admin, or any existing API; they
// serve a read-only HTML snapshot of real catalog data so a page exists at
// a stable URL (not just a client-side #hash) for Googlebot, OAI-SearchBot,
// etc. See server/utils/seoRender.js for how this stays invisible/no-op
// for real (JavaScript-enabled) visitors.
const express = require('express');
const prisma = require('../db');
const { renderSeoPage, escapeHtml, truncate, SITE_URL } = require('../utils/seoRender');

const router = express.Router();

// Same reasoning as the no-store fix for index.html/script.js/style.css —
// these pages reflect live catalog data and must never be served stale by
// an intermediary cache.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function parseImages(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

// ---------- sitemap.xml — built live from the real catalog, never cached ----------
router.get('/sitemap.xml', async (req, res) => {
  const [collections, products, packs] = await Promise.all([
    prisma.collection.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.pack.findMany({ where: { isActive: true }, select: { id: true, updatedAt: true } }),
  ]);

  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/collections`, priority: '0.8', changefreq: 'weekly' },
    ...collections.map((c) => ({ loc: `${SITE_URL}/collection/${c.slug}`, lastmod: c.updatedAt, priority: '0.8', changefreq: 'weekly' })),
    ...products.map((p) => ({ loc: `${SITE_URL}/product/${p.slug}`, lastmod: p.updatedAt, priority: '0.6', changefreq: 'weekly' })),
    ...packs.map((p) => ({ loc: `${SITE_URL}/pack/${p.id}`, lastmod: p.updatedAt, priority: '0.6', changefreq: 'weekly' })),
  ];

  const body = urls.map((u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

// ---------- /collection/:slug ----------
router.get('/collection/:slug', async (req, res, next) => {
  const collection = await prisma.collection.findUnique({ where: { slug: req.params.slug } });
  if (!collection || !collection.isActive) return next(); // falls through to the normal SPA (404 handled client-side)

  const [products, packs] = await Promise.all([
    prisma.product.findMany({ where: { collectionId: collection.id, isActive: true }, orderBy: { position: 'asc' } }),
    prisma.pack.findMany({ where: { collectionId: collection.id, isActive: true }, orderBy: { position: 'asc' } }),
  ]);

  const title = `${collection.name} | VEINTUNO HOUSE`;
  const description = collection.description
    || `${collection.name} — ${products.length} produit${products.length > 1 ? 's' : ''} chez VEINTUNO HOUSE. Livraison partout au Maroc, paiement à la livraison.`;

  const itemListElements = products.map((p, i) => ({
    '@type': 'ListItem', position: i + 1,
    url: `${SITE_URL}/product/${p.slug}`,
    name: p.name,
  }));

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: collection.name, item: `${SITE_URL}/collection/${collection.slug}` },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: collection.name, description, url: `${SITE_URL}/collection/${collection.slug}`,
      mainEntity: { '@type': 'ItemList', itemListElement: itemListElements },
    },
  ];

  const noscriptItems = [
    ...products.map((p) => `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a>${p.price ? ` — ${p.price} MAD` : ''}</li>`),
    ...packs.map((p) => `<li><a href="/pack/${escapeHtml(p.id)}">${escapeHtml(p.name)}</a> — ${p.size} produits, ${p.price} MAD</li>`),
  ].join('');
  const noscriptHtml = `<h1>${escapeHtml(collection.name)}</h1><p>${escapeHtml(description)}</p><ul>${noscriptItems}</ul>`;

  res.send(renderSeoPage({
    title, description, pagePath: `/collection/${collection.slug}`, jsonLd, noscriptHtml,
    initialHash: `collection/${collection.slug}`,
  }));
});

// ---------- /product/:slug ----------
router.get('/product/:slug', async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { collection: true },
  });
  if (!product || !product.isActive) return next();

  const images = parseImages(product.images);
  const rating = await prisma.review.aggregate({
    where: { productId: product.id, status: 'APPROVED' },
    _avg: { rating: true }, _count: { _all: true },
  });

  const title = `${product.name} | VEINTUNO HOUSE`;
  const description = product.description
    || `${product.name}${product.collection ? ` — collection ${product.collection.name}` : ''} — ${product.price} MAD. Livraison partout au Maroc, paiement à la livraison.`;

  const offer = {
    '@type': 'Offer',
    priceCurrency: 'MAD',
    price: product.price,
    availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    url: `${SITE_URL}/product/${product.slug}`,
  };
  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: product.name,
    description: truncate(description, 500),
    image: images.length ? images : undefined,
    sku: product.id,
    offers: offer,
  };
  if (rating._count._all > 0) {
    productLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(rating._avg.rating * 10) / 10,
      reviewCount: rating._count._all,
    };
  }

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE_URL}/` },
        ...(product.collection ? [{ '@type': 'ListItem', position: 2, name: product.collection.name, item: `${SITE_URL}/collection/${product.collection.slug}` }] : []),
        { '@type': 'ListItem', position: product.collection ? 3 : 2, name: product.name, item: `${SITE_URL}/product/${product.slug}` },
      ],
    },
    productLd,
  ];

  const imgTags = images.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}">`).join('');
  const noscriptHtml = `<h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(description)}</p><p>Prix : ${product.price} MAD</p>${imgTags}`
    + (product.collection ? `<p><a href="/collection/${escapeHtml(product.collection.slug)}">${escapeHtml(product.collection.name)}</a></p>` : '');

  res.send(renderSeoPage({
    title, description, pagePath: `/product/${product.slug}`, jsonLd, noscriptHtml,
    initialHash: `product/${product.slug}`,
  }));
});

// ---------- /pack/:id ----------
router.get('/pack/:id', async (req, res, next) => {
  const pack = await prisma.pack.findUnique({ where: { id: req.params.id }, include: { collection: true } });
  if (!pack || !pack.isActive) return next();

  const title = `${pack.name} | VEINTUNO HOUSE`;
  const description = pack.blurb
    || `${pack.name} — ${pack.size} produits au choix, ${pack.price} MAD. Livraison partout au Maroc, paiement à la livraison.`;

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: pack.name,
    description: truncate(description, 500),
    image: pack.image ? [pack.image] : undefined,
    sku: pack.id,
    offers: {
      '@type': 'Offer', priceCurrency: 'MAD', price: pack.price,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/pack/${pack.id}`,
    },
  };

  const noscriptHtml = `<h1>${escapeHtml(pack.name)}</h1><p>${escapeHtml(description)}</p><p>${pack.size} produits — ${pack.price} MAD</p>`
    + (pack.collection ? `<p><a href="/collection/${escapeHtml(pack.collection.slug)}">${escapeHtml(pack.collection.name)}</a></p>` : '');

  res.send(renderSeoPage({
    title, description, pagePath: `/pack/${pack.id}`, jsonLd, noscriptHtml,
    initialHash: `compose/pack/${pack.id}`,
  }));
});

module.exports = router;
