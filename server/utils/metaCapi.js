const crypto = require('crypto');
const prisma = require('../db');

const GRAPH_VERSION = 'v21.0';
const TIMEOUT_MS = 2500;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `212${digits.slice(1)}`;
  return digits;
}

async function sendMetaPurchase({ req, order, items, customer, metaContext }) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return;
  try {
    const settings = await prisma.siteSettings.findFirst({ select: { metaPixelId: true } });
    const pixelId = settings && settings.metaPixelId;
    if (!pixelId) return;

    const contentIds = (Array.isArray(items) ? items : [])
      .map((i) => i.productSlug || i.packId || i.bundleId)
      .filter(Boolean);
    const ctx = metaContext && typeof metaContext === 'object' ? metaContext : {};
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();

    const userData = {
      ph: [sha256(normalizePhone(customer.phone))],
      fn: [sha256(customer.fullName.split(' ')[0])],
      ct: [sha256(customer.city.replace(/\s+/g, ''))],
      country: [sha256('ma')],
      client_ip_address: forwardedFor || req.ip,
      client_user_agent: typeof ctx.userAgent === 'string' ? ctx.userAgent.slice(0, 500) : undefined,
    };
    if (typeof ctx.fbp === 'string') userData.fbp = ctx.fbp.slice(0, 200);
    if (typeof ctx.fbc === 'string') userData.fbc = ctx.fbc.slice(0, 200);

    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: order.orderNumber,
        action_source: 'website',
        event_source_url: typeof ctx.sourceUrl === 'string' ? ctx.sourceUrl.slice(0, 500) : undefined,
        user_data: userData,
        custom_data: {
          currency: 'MAD',
          value: order.total,
          content_type: 'product_group',
          content_ids: contentIds,
          num_items: (Array.isArray(items) ? items : []).reduce((s, i) => s + (Number(i.quantity) || 1), 0),
        },
      }],
      ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
    };

    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error('Meta CAPI Purchase failed:', e.message);
  }
}

module.exports = { sendMetaPurchase };
