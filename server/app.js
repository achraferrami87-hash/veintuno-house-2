const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const requireAdmin = require('./middleware/requireAdmin');

const publicRoutes = require('./routes/public');
const seoRoutes = require('./routes/seo');
const adminAuthRoutes = require('./routes/adminAuth');
const adminProductsRoutes = require('./routes/adminProducts');
const adminCollectionsRoutes = require('./routes/adminCollections');
const adminPacksRoutes = require('./routes/adminPacks');
const adminPromoCodesRoutes = require('./routes/adminPromoCodes');
const adminOrdersRoutes = require('./routes/adminOrders');
const adminCustomersRoutes = require('./routes/adminCustomers');
const adminInventoryRoutes = require('./routes/adminInventory');
const adminHomepageRoutes = require('./routes/adminHomepage');
const adminAnalyticsRoutes = require('./routes/adminAnalytics');
const adminUploadRoutes = require('./routes/adminUpload');
const adminNavRoutes = require('./routes/adminNav');
const adminLoyaltyRoutes = require('./routes/adminLoyalty');
const adminSettingsRoutes = require('./routes/adminSettings');
const adminBundlesRoutes = require('./routes/adminBundles');
const adminReviewsRoutes = require('./routes/adminReviews');
const adminCharacteristicsRoutes = require('./routes/adminCharacteristics');
const adminQuizRoutes = require('./routes/adminQuiz');
const adminCollectionFiltersRoutes = require('./routes/adminCollectionFilters');
const adminFaqRoutes = require('./routes/adminFaq');
const adminCampaignsRoutes = require('./routes/adminCampaigns');

const app = express();

// Railway, Vercel, and most PaaS providers terminate TLS at their edge and
// forward plain HTTP internally. Without this, Express thinks every request
// is insecure, so a `secure` cookie never actually gets set — silently
// breaking admin login in production while working fine locally.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieSession({
  name: 'veintuno_admin_session',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

// Dashboard edits must show up immediately on the storefront — never let the
// browser (or an intermediary) serve a stale cached API response.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Every Supabase storage URL in an API response is rewritten to the
// Cloudflare-cached media subdomain (see the Worker at
// media.veintunohouse.shop) before it leaves the server — one place, so
// every current and future endpoint benefits without per-route changes.
// Repeat visitors then hit Cloudflare's edge cache instead of Supabase's
// own egress quota.
const SUPABASE_STORAGE_ORIGIN = process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/storage/v1/object/public` : null;
const CACHED_MEDIA_ORIGIN = 'https://media.veintunohouse.shop/storage/v1/object/public';

function rewriteMediaUrls(value) {
  if (!SUPABASE_STORAGE_ORIGIN) return value;
  if (typeof value === 'string') {
    return value.startsWith(SUPABASE_STORAGE_ORIGIN) ? CACHED_MEDIA_ORIGIN + value.slice(SUPABASE_STORAGE_ORIGIN.length) : value;
  }
  if (Array.isArray(value)) return value.map(rewriteMediaUrls);
  // Restricted to plain objects so Date instances (serialized to ISO
  // strings by JSON.stringify) pass through untouched instead of being
  // flattened into {} by Object.keys().
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = rewriteMediaUrls(value[key]);
    return out;
  }
  return value;
}

app.use('/api', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(rewriteMediaUrls(body));
  next();
});

// ---------- Public API (storefront) ----------
app.use('/api', publicRoutes);

// ---------- SEO: real crawlable URLs for search/AI bots (sitemap.xml,
// /collection/:slug, /product/:slug, /pack/:id) — read-only, reuses the
// same catalog data as the API above. See routes/seo.js.
app.use(seoRoutes);

// ---------- Admin API ----------
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin/products', requireAdmin, adminProductsRoutes);
app.use('/api/admin/collections', requireAdmin, adminCollectionsRoutes);
app.use('/api/admin/packs', requireAdmin, adminPacksRoutes);
app.use('/api/admin/promo-codes', requireAdmin, adminPromoCodesRoutes);
app.use('/api/admin/orders', requireAdmin, adminOrdersRoutes);
app.use('/api/admin/customers', requireAdmin, adminCustomersRoutes);
app.use('/api/admin/inventory', requireAdmin, adminInventoryRoutes);
app.use('/api/admin/homepage', requireAdmin, adminHomepageRoutes);
app.use('/api/admin/analytics', requireAdmin, adminAnalyticsRoutes);
app.use('/api/admin/upload', requireAdmin, adminUploadRoutes);
app.use('/api/admin/nav-menu', requireAdmin, adminNavRoutes);
app.use('/api/admin/loyalty', requireAdmin, adminLoyaltyRoutes);
app.use('/api/admin/settings', requireAdmin, adminSettingsRoutes);
app.use('/api/admin/bundles', requireAdmin, adminBundlesRoutes);
app.use('/api/admin/reviews', requireAdmin, adminReviewsRoutes);
app.use('/api/admin/characteristics', requireAdmin, adminCharacteristicsRoutes);
app.use('/api/admin/quiz', requireAdmin, adminQuizRoutes);
app.use('/api/admin/collection-filters', requireAdmin, adminCollectionFiltersRoutes);
app.use('/api/admin/faq', requireAdmin, adminFaqRoutes);
app.use('/api/admin/campaigns', requireAdmin, adminCampaignsRoutes);

// ---------- Static files ----------
// These three files change on every deploy; Vercel's edge was caching them
// for hours despite "max-age=0, must-revalidate" (visitors kept getting an
// old script.js/index.html long after a new version went live) — no-store
// forces the edge to always hit this origin for them.
const NO_CACHE_PATHS = new Set(['/', '/index.html', '/js/script.js', '/css/style.css']);
app.use((req, res, next) => {
  if (NO_CACHE_PATHS.has(req.path)) res.set('Cache-Control', 'no-store');
  next();
});
// Uploaded media now lives on Vercel Blob (see routes/adminUpload.js) and is
// served directly from Blob's own public URL — nothing to serve locally here.
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..')));

app.use((req, res) => {
  res.status(404).json({ error: 'Introuvable.' });
});

module.exports = app;
