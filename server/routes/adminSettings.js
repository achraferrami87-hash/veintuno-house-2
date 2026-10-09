const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  let settings = await prisma.siteSettings.findFirst();
  if (!settings) settings = await prisma.siteSettings.create({ data: {} });
  res.json(settings);
});

router.put('/', async (req, res) => {
  let settings = await prisma.siteSettings.findFirst();
  if (!settings) settings = await prisma.siteSettings.create({ data: {} });

  const body = req.body;
  const data = {};
  ['whatsappNumber', 'instagramLink', 'instagramQrImage'].forEach((f) => {
    if (body[f] !== undefined) data[f] = body[f] || null;
  });
  if (body.perfumeDisclaimer !== undefined && body.perfumeDisclaimer !== '') {
    data.perfumeDisclaimer = body.perfumeDisclaimer;
  }
  if (body.defaultTheme === 'clair' || body.defaultTheme === 'sombre') {
    data.defaultTheme = body.defaultTheme;
  }
  if (body.announcementText !== undefined && body.announcementText !== '') {
    data.announcementText = body.announcementText;
  }
  if (body.trustSignals !== undefined) {
    const list = Array.isArray(body.trustSignals) ? body.trustSignals : [];
    data.trustSignals = JSON.stringify(
      list.map((v) => String(v || '').trim().slice(0, 120)).filter(Boolean).slice(0, 6)
    );
  }
  if (body.metaPixelId !== undefined) {
    data.metaPixelId = body.metaPixelId.toString().trim() || null;
  }

  const updated = await prisma.siteSettings.update({ where: { id: settings.id }, data });
  res.json(updated);
});

module.exports = router;
