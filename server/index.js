const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const requireAdmin = require('./middleware/requireAdmin');
const uploadsPath = require('./uploadsPath');

const publicRoutes = require('./routes/public');
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

const app = express();

// Railway (and most PaaS providers) terminate TLS at their edge and forward
// plain HTTP internally. Without this, Express thinks every request is
// insecure, so a `secure` cookie never actually gets set — silently breaking
// admin login in production while working fine locally.
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

// ---------- Public API (storefront) ----------
app.use('/api', publicRoutes);

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

// ---------- Static files ----------
// Uploaded media: filenames are unique per upload, but we still force
// revalidation so an admin's replacement never appears stale.
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..')));

app.use((req, res) => {
  res.status(404).json({ error: 'Introuvable.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VEINTUNO HOUSE server running at http://localhost:${PORT}`);
});
