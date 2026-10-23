// Server-side SEO rendering for crawlers — product/collection pages get a
// real, unique URL (/product/:slug, /collection/:slug) with real meta tags
// and JSON-LD, built from the same index.html shell the SPA already uses.
//
// How it stays 100% non-disruptive for real visitors: the returned HTML is
// the exact existing index.html, just with per-page <head> tags swapped in,
// a JSON-LD block, a <noscript> content snapshot (invisible whenever
// JavaScript runs — i.e. invisible to every real visitor, but present in
// the raw HTML for any crawler that doesn't execute JS), and one inline
// script that sets location.hash before js/script.js's own boot sequence
// reads it — so the page instantly becomes the normal, fully interactive
// SPA view for anyone with JS enabled. Nothing in the existing app code or
// markup is modified.
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'index.html');
const SITE_URL = 'https://www.veintunohouse.shop';

let cachedTemplate = null;
function getTemplate() {
  if (!cachedTemplate) cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return cachedTemplate;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// title/description capped to what search engines actually use, so nothing
// looks truncated/broken in results.
function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? `${str.slice(0, max - 1).trim()}…` : str;
}

function renderSeoPage({ title, description, pagePath, jsonLd, noscriptHtml, initialHash }) {
  let html = getTemplate();
  const canonical = `${SITE_URL}${pagePath}`;
  const safeTitle = escapeHtml(truncate(title, 65));
  const safeDesc = escapeHtml(truncate(description, 160));

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle}</title>`);
  html = html.replace(/<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${safeDesc}">`);
  html = html.replace(/<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${canonical}">`);
  html = html.replace(/<meta property="og:title" content="[\s\S]*?">/, `<meta property="og:title" content="${safeTitle}">`);
  html = html.replace(/<meta property="og:description" content="[\s\S]*?">/, `<meta property="og:description" content="${safeDesc}">`);
  html = html.replace(/<meta property="og:url" content="[\s\S]*?">/, `<meta property="og:url" content="${canonical}">`);
  html = html.replace(/<meta name="twitter:title" content="[\s\S]*?">/, `<meta name="twitter:title" content="${safeTitle}">`);
  html = html.replace(/<meta name="twitter:description" content="[\s\S]*?">/, `<meta name="twitter:description" content="${safeDesc}">`);

  if (jsonLd) {
    const blocks = (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
      .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
      .join('\n');
    html = html.replace('</head>', `${blocks}\n</head>`);
  }

  if (noscriptHtml) {
    html = html.replace('<body>', `<body>\n<noscript>${noscriptHtml}</noscript>`);
  }

  if (initialHash) {
    const bootScript = `<script>if(!location.hash)location.hash=${JSON.stringify(`#${initialHash}`)};</script>\n`;
    html = html.replace(/<script src="\/js\/script\.js/, `${bootScript}<script src="/js/script.js`);
  }

  return html;
}

module.exports = { renderSeoPage, escapeHtml, truncate, SITE_URL };
