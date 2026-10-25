// ===========================
// API helper
// ===========================
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Une erreur est survenue.');
    err.data = data;
    throw err;
  }
  return data;
}

// ===========================
// Phone validation — exactly 10 digits, everywhere a phone is collected
// ===========================
const PHONE_ERROR_MSG = 'Veuillez entrer un numéro de téléphone valide de 10 chiffres.';
function isValidPhone(phone) {
  return /^\d{10}$/.test((phone || '').toString().trim());
}
// Strips non-digits as the customer types, caps at 10, and shows/hides a
// small inline error once they've typed something but it isn't valid yet.
function attachPhoneValidation(input) {
  if (!input || input.dataset.phoneValidationAttached) return;
  input.dataset.phoneValidationAttached = '1';
  let errorEl = input.parentElement.querySelector('.phone-error-msg');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'phone-error-msg';
    errorEl.hidden = true;
    input.insertAdjacentElement('afterend', errorEl);
  }
  function refresh(showError) {
    const isEmpty = input.value.length === 0;
    const isValid = isValidPhone(input.value);
    errorEl.hidden = isEmpty || isValid || !showError;
    errorEl.textContent = PHONE_ERROR_MSG;
    input.classList.toggle('is-invalid', !isEmpty && !isValid && showError);
    input.setCustomValidity(!isEmpty && !isValid ? PHONE_ERROR_MSG : '');
  }
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 10);
    refresh(true);
  });
  input.addEventListener('blur', () => refresh(true));
  input.addEventListener('invalid', () => refresh(true));
  refresh(false);
}

// ===========================
// Mobile nav toggle
// ===========================
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    nav.classList.toggle('nav--open');
    navToggle.classList.toggle('nav-toggle--active');
  });
  // Delegated so dynamically-injected links (Collections dropdown items,
  // admin-managed nav items) also close the mobile menu on click.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('nav--open');
      navToggle.classList.remove('nav-toggle--active');
      const dropdown = document.getElementById('collectionsDropdown');
      if (dropdown) dropdown.classList.remove('is-open');
    }
  });
}

// Header shrink on scroll
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 40 ? '0 4px 20px rgba(0,0,0,0.06)' : 'none';
});

// ===========================
// Product cache (populated as product objects arrive from any endpoint)
// ===========================
const productCache = new Map(); // slug -> product
function cacheProducts(list) {
  (list || []).forEach((p) => { if (p && p.slug) productCache.set(p.slug, p); });
}
async function getProductBySlug(slug) {
  // Always hit the network — never trust a possibly-stale cached copy here.
  // (The cache below is only a lookup table for slug->object during rendering,
  // populated fresh on every page/section render; it must never be the source
  // of truth for "add to cart" or product-detail lookups.)
  const product = await api(`/products/${slug}`);
  productCache.set(slug, product);
  return product;
}

// Duotone product illustrations (bottle / jar / tube)
function productVisual(shape, color) {
  if (shape === 'jar') {
    return `<svg viewBox="0 0 120 220"><rect x="30" y="10" width="60" height="20" rx="4" fill="#0c0c0c"/><path d="M22 30 h76 v130 a14 14 0 0 1 -14 14 H36 a14 14 0 0 1 -14 -14 V30 Z" fill="none" stroke="#0c0c0c" stroke-width="2"/><rect x="26" y="60" width="68" height="100" fill="${color}" opacity="0.9"/></svg>`;
  }
  if (shape === 'tube') {
    return `<svg viewBox="0 0 120 220"><rect x="46" y="0" width="28" height="18" rx="3" fill="#0c0c0c"/><path d="M40 18 h40 v40 l14 130 a10 10 0 0 1 -10 12 H36 a10 10 0 0 1 -10 -12 L40 58 Z" fill="none" stroke="#0c0c0c" stroke-width="2"/><path d="M40 60 l12 128 a4 4 0 0 0 4 4 h8 a4 4 0 0 0 4 -4 L80 60 Z" fill="${color}" opacity="0.9"/></svg>`;
  }
  return `<svg viewBox="0 0 120 220"><rect x="42" y="0" width="36" height="22" rx="3" fill="#0c0c0c"/><path d="M36 22 h48 v28 l10 14 v138 a8 8 0 0 1 -8 8 H34 a8 8 0 0 1 -8 -8 V64 l10 -14 Z" fill="none" stroke="#0c0c0c" stroke-width="2"/><rect x="34" y="90" width="52" height="80" fill="${color}" opacity="0.9"/></svg>`;
}

// A real uploaded photo always takes priority over the generic duotone SVG.
function productMediaHTML(p) {
  const images = Array.isArray(p.images) ? p.images : [];
  if (images[0]) return `<img src="${images[0]}" alt="${p.name}" loading="lazy">`;
  return productVisual(p.shape, p.color);
}

function priceHTML(p, variant) {
  if (!p.onSale) return `<p class="product-detail__price ${variant === 'card' ? 'product-card__price' : ''}">${p.price} MAD</p>`;
  const percentHTML = p.discountPercent ? `<span class="price-discount-percent">-${p.discountPercent}%</span>` : '';
  return `
    <p class="${variant === 'card' ? 'product-card__price product-card__price--flash' : 'product-detail__price product-detail__price--flash'}">
      <span class="price-original">${p.originalPrice} MAD</span>
      <span class="price-sale">${p.displayPrice} MAD</span>
      ${percentHTML}
    </p>`;
}

// Shared escape for admin-entered text rendered as HTML (announcement
// messages, FAQ answers, etc.) — avoids a stray "&" or "<" breaking markup.
function escapeHtmlText(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ===========================
// FAQ — one accordion, reused at the bottom of every main page. `pageKey`
// scopes which page-specific questions join the global (page: null) ones;
// mounted into a per-page <div id="faqSection-<pageKey>"> that already
// exists in index.html. Renders nothing (stays hidden) when there are no
// active questions, so an empty FAQ never shows as an empty shell.
// ===========================
const faqCache = new Map();
async function renderFaqSection(pageKey) {
  const mount = document.getElementById(`faqSection-${pageKey}`);
  if (!mount) return;
  let faqs = faqCache.get(pageKey);
  if (!faqs) {
    try { faqs = await api(`/faq?page=${encodeURIComponent(pageKey)}`); } catch (e) { faqs = []; }
    faqCache.set(pageKey, faqs);
  }
  if (!faqs.length) { mount.hidden = true; mount.innerHTML = ''; return; }
  mount.innerHTML = `
    <p class="section__eyebrow">Besoin d'aide ?</p>
    <h2 class="faq-section__title">QUESTIONS</h2>
    <div class="faq-accordion">
      ${faqs.map((f, i) => `
        <div class="faq-item">
          <button type="button" class="faq-item__question" aria-expanded="false" data-index="${i}">
            <span>${escapeHtmlText(f.question)}</span>
            <span class="faq-item__icon">+</span>
          </button>
          <div class="faq-item__answer"><p>${escapeHtmlText(f.answer)}</p></div>
        </div>`).join('')}
    </div>`;
  mount.hidden = false;
  mount.querySelectorAll('.faq-item__question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

// Editorial touch on the grid card title — italicize the first word only
// (e.g. "<em>Ombre</em> Nomad"), purely typographic, no content change.
function cardTitleHTML(name) {
  const idx = name.indexOf(' ');
  if (idx === -1) return `<em>${name}</em>`;
  return `<em>${name.slice(0, idx)}</em>${name.slice(idx)}`;
}

function productCardHTML(p) {
  const tag = p.isBestSeller ? 'Best Seller' : p.isLimitedEdition ? 'Édition limitée' : p.isNew ? 'Nouveauté' : null;
  const packOnly = p.collection && p.collection.packOnly;
  const hasPhoto = Array.isArray(p.images) && !!p.images[0];
  return `
    <article class="product-card reveal" data-href="#product/${p.slug}">
      <div class="product-card__media${hasPhoto ? ' product-card__media--photo' : ''}">
        ${p.onSale ? `<span class="flash-badge">${p.flashSaleLabel || 'Flash Sale'}</span>` : tag ? `<span class="product-card__tag${tag === 'Best Seller' ? ' product-card__tag--gold' : ''}">${tag}</span>` : ''}
        <button type="button" class="product-card__favorite js-favorite-toggle${Favorites.has(p.slug) ? ' is-active' : ''}" data-slug="${p.slug}" aria-label="Ajouter aux favoris" aria-pressed="${Favorites.has(p.slug)}">
          <svg viewBox="0 0 24 24"><path d="M12 20.5c-5.5-3.6-9-6.8-9-11A5 5 0 0 1 12 6.3 5 5 0 0 1 21 9.5c0 4.2-3.5 7.4-9 11z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
        </button>
        ${p.volume ? `<span class="product-card__volume">${p.volume}</span>` : ''}
        <a href="#product/${p.slug}" class="product-card__bottle">${productMediaHTML(p)}</a>
        <button type="button" class="product-card__quickview js-quick-view" data-slug="${p.slug}">Voir les détails</button>
      </div>
      <div class="product-card__footer">
        <div class="product-card__heading">
          <h3><a href="#product/${p.slug}">${cardTitleHTML(p.name)}</a></h3>
          ${priceHTML(p, 'card')}
        </div>
        <p class="product-card__notes">${p.notes || ''}</p>
        ${ratingRowHTML(p)}
        <div class="product-card__action-row">
          ${packOnly
            ? `<a href="#collection/${p.collection.slug}" class="btn-pill product-card__cta"><svg viewBox="0 0 24 24"><path d="M4 7h16M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Choisir un pack</a>`
            : `<button type="button" class="btn-pill product-card__cta js-add-product" data-slug="${p.slug}"><svg viewBox="0 0 24 24"><path d="M4 6h2l1.5 11.5A2 2 0 0 0 9.48 19h8.04a2 2 0 0 0 1.98-1.7L20.5 9H6.2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="22" r="1.4" fill="currentColor"/><circle cx="17" cy="22" r="1.4" fill="currentColor"/></svg> Ajouter au panier</button>`}
          <button type="button" class="product-card__favorite product-card__favorite--inline js-favorite-toggle${Favorites.has(p.slug) ? ' is-active' : ''}" data-slug="${p.slug}" aria-label="Ajouter aux favoris" aria-pressed="${Favorites.has(p.slug)}">
            <svg viewBox="0 0 24 24"><path d="M12 20.5c-5.5-3.6-9-6.8-9-11A5 5 0 0 1 12 6.3 5 5 0 0 1 21 9.5c0 4.2-3.5 7.4-9 11z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </article>`;
}

// Real approved-review average only — never a fabricated number. Renders
// nothing for a product with zero approved reviews (ratingCount is attached
// server-side by attachRatings, additive and optional).
function ratingRowHTML(p) {
  if (!p.ratingCount) return '';
  const rounded = Math.round(p.ratingAverage);
  return `<div class="product-card__rating">${starsHTML(rounded)} <span>(${Number(p.ratingAverage).toFixed(1)})</span></div>`;
}

// The whole card navigates to the product page — except the two buttons
// (quick view / add to cart) and any inner <a>, which handle their own click.
document.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card[data-href]');
  if (!card) return;
  if (e.target.closest('.js-quick-view, .js-add-product, .js-add-bundle, .js-favorite-toggle, a')) return;
  window.location.hash = card.dataset.href;
});

// ===========================
// Pack composer — in-progress selections, kept at module scope (not inside
// renderComposePack/renderComposeFree) so navigating away and back to the
// same pack — or opening a product's quick view, or filtering/searching —
// never resets what the customer already picked. Cleared once the pack is
// actually added to the cart. Lives only for the current page session
// (not persisted to localStorage) since it's a draft, not a cart item.
// ===========================
const composeDraftState = {
  packs: new Map(), // packId -> Map(slug -> qty)
  free: new Map(), // configId -> [{slug, name, price, collection}]
};

// Set by renderComposePack while a pack composition is on screen, cleared by
// the router the moment the customer navigates anywhere else. Lets Find Your
// Scent — opened as an overlay on top of the composer — add its recommended
// match straight into the pack currently being built, instead of only ever
// linking back to "choose a pack" like it did before a pack was picked.
let activePackComposer = null; // { packId, pack, quantities, changeQty } | null

// Set by the "Ajouter au panier" action on a pack-only perfume's detail page
// — the next pack composer the customer opens pre-selects this product as
// one of their choices, instead of making them find it again in the grid.
let pendingPreselectSlug = null;

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Shared by both the fixed-size pack composer and the free/custom pack
// composer — instant client-side search (by name or notes) plus the same
// Homme/Femme/Unisexe/Tous gender chips used on collection pages. Filtering
// only toggles visibility; it never touches selection state.
// Matches if the query is a prefix of any whole word in the text — typing
// "Ro" finds "Rose Lumière" and "Cèdre Royal" but not "Stronger" (which only
// contains "ro" mid-word). Closer to what a customer expects from "start
// typing a name" than a plain substring-anywhere match.
function matchesByWordPrefix(text, q) {
  if (!q) return true;
  return text.split(/\s+/).some((word) => word.startsWith(q));
}

function initFragranceToolbar({ searchInput, genderFilter, cards, emptyMsg }) {
  let query = '';
  let gender = '';

  function apply() {
    const q = stripAccents(query.trim().toLowerCase());
    let visibleCount = 0;
    cards.forEach((card) => {
      const name = stripAccents((card.dataset.name || '').toLowerCase());
      const notesEl = card.querySelector('.product-card__notes');
      const notes = stripAccents((notesEl ? notesEl.textContent : '').toLowerCase());
      const matchesSearch = matchesByWordPrefix(name, q) || matchesByWordPrefix(notes, q);
      const genders = (card.dataset.genders || '').split(',').filter(Boolean);
      const matchesGender = !gender || genders.includes(gender);
      const visible = matchesSearch && matchesGender;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (emptyMsg) emptyMsg.hidden = visibleCount > 0;
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => { query = searchInput.value; apply(); });
  }
  if (genderFilter) {
    genderFilter.addEventListener('click', (e) => {
      const chip = e.target.closest('.gender-filter__chip');
      if (!chip) return;
      genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      gender = chip.dataset.gender;
      apply();
    });
  }
}

function fragranceToolbarHTML(idPrefix) {
  return `
    <div class="compose-toolbar">
      <div class="compose-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M21 21 L16.6 16.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
        <input type="text" id="${idPrefix}Search" placeholder="Rechercher un parfum...">
      </div>
      <div class="gender-filter" id="${idPrefix}GenderFilter">
        <div class="gender-filter__chip is-active" data-gender="">Tous</div>
        <div class="gender-filter__chip" data-gender="homme">Homme</div>
        <div class="gender-filter__chip" data-gender="femme">Femme</div>
        <div class="gender-filter__chip" data-gender="unisexe">Unisexe</div>
      </div>
    </div>
    <p class="admin-field-help compose-empty-msg" id="${idPrefix}EmptyMsg" hidden>Aucun parfum ne correspond à votre recherche.</p>`;
}

// ===========================
// PACKS cache (by id) — shared between homepage, collection pages, and the pack modal
// ===========================
const packsCache = new Map();
function cachePacks(list) {
  (list || []).forEach((p) => { if (p && p.id) packsCache.set(p.id, p); });
}
async function getPackById(packId) {
  // Packs cached from /collections/:slug don't include eligibleProducts —
  // only trust a cache hit that actually has them.
  const cached = packsCache.get(packId);
  if (cached && cached.eligibleProducts) return cached;
  const all = await api('/packs');
  cachePacks(all);
  return packsCache.get(packId) || null;
}

// ===========================
// FAVORITES — client-side only (localStorage), per browser, no account needed
// ===========================
const Favorites = (() => {
  const KEY = 'veintuno_favorites';
  function load() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function save(set) {
    try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))); } catch (e) { /* storage unavailable */ }
  }
  function has(slug) { return load().has(slug); }
  function toggle(slug) {
    const set = load();
    if (set.has(slug)) set.delete(slug); else set.add(slug);
    save(set);
    return set.has(slug);
  }
  function syncButton(btn) {
    const isFav = has(btn.dataset.slug);
    btn.classList.toggle('is-active', isFav);
    btn.setAttribute('aria-pressed', String(isFav));
  }
  return { has, toggle, syncButton };
})();

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.js-favorite-toggle');
  if (!btn) return;
  e.preventDefault();
  Favorites.toggle(btn.dataset.slug);
  // A card can show the heart twice (on the photo and next to the CTA) —
  // keep every instance for this product in sync, not just the one clicked.
  document.querySelectorAll(`.js-favorite-toggle[data-slug="${btn.dataset.slug}"]`).forEach(Favorites.syncButton);
});

// ===========================
// FUNNEL TRACKING — anonymous, no personal data (random id per browser)
// ===========================
const Track = (() => {
  const KEY = 'veintuno_sid';
  let sid = null;
  function visitorId() {
    if (sid) return sid;
    const fresh = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      sid = localStorage.getItem(KEY) || fresh;
      localStorage.setItem(KEY, sid);
    } catch (e) { sid = fresh; }
    return sid;
  }
  function send(event, label) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: visitorId(), event, label: label || null }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* tracking never blocks the shop */ }
  }
  return { send };
})();

document.addEventListener('click', (e) => {
  if (e.target.closest('a[href*="wa.me"]')) { Track.send('whatsapp_clicked'); return; }
  const el = e.target.closest('button, a');
  if (!el || el.closest('.qty-selector')) return;
  const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (label.length > 1) Track.send('click', label);
});

// ===========================
// CART
// ===========================
const Cart = (() => {
  const STORAGE_KEY = 'veintuno_cart_v2';

  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartBackdrop');
  const badge = document.getElementById('cartBadge');
  const toggleBtn = document.getElementById('cartToggle');

  const stepBag = document.getElementById('cartStepBag');
  const stepCheckout = document.getElementById('cartStepCheckout');
  const stepSuccess = document.getElementById('cartStepSuccess');

  const itemsEl = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountRowEl = document.getElementById('cartDiscountRow');
  const discountEl = document.getElementById('cartDiscount');
  const deliveryRowEl = document.getElementById('cartDeliveryRow');
  const deliveryFeeEl = document.getElementById('cartDeliveryFee');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  const checkoutSubtotalEl = document.getElementById('checkoutSubtotal');
  const checkoutDeliveryRowEl = document.getElementById('checkoutDeliveryRow');
  const checkoutDeliveryFeeEl = document.getElementById('checkoutDeliveryFee');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutErrorEl = document.getElementById('checkoutError');
  const checkoutSubmitBtn = document.getElementById('checkoutReviewBtn');
  if (checkoutForm.phone) attachPhoneValidation(checkoutForm.phone);

  const successNameEl = document.getElementById('successCustomerName');
  const successOrderNumberEl = document.getElementById('successOrderNumber');
  const successListEl = document.getElementById('successOrderList');

  const promoInput = document.getElementById('promoInput');
  const promoApplyBtn = document.getElementById('promoApplyBtn');
  const promoMsg = document.getElementById('promoMsg');

  if (!drawer) return null;

  let items = load();
  let appliedPromo = null; // { code, discount }
  let pendingCustomer = null;
  let clientOrderId = null;
  let isSubmittingOrder = false;
  let formStarted = false;

  // Gel Douche individual-unit delivery fee (30 MAD) — this is only a
  // client-side preview so the customer sees it before submitting; the
  // server independently recomputes and enforces the real fee at checkout,
  // never trusting a value sent from here.
  let gelsDoucheCollectionId = null;
  async function loadGelsDoucheId() {
    try {
      const cols = await api('/collections');
      const gd = cols.find((c) => c.slug === 'gels-douche');
      gelsDoucheCollectionId = gd ? gd.id : null;
      renderAll();
    } catch (e) { /* retried when the checkout opens */ }
  }
  loadGelsDoucheId();

  function newClientOrderId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
  }

  function subtotal() {
    return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  }
  function itemCount() {
    return items.reduce((s, i) => s + i.quantity, 0);
  }
  function discount() {
    return appliedPromo ? appliedPromo.discount : 0;
  }
  // Mirrors the server-side rule in server/routes/public.js exactly: 30 MAD
  // when the cart holds exactly one individually-purchased Gel Douche unit
  // and no pack at all; 0 otherwise (packs keep their own price untouched).
  function deliveryFee() {
    if (!gelsDoucheCollectionId) return 0;
    if (items.some((i) => i.kind === 'PACK')) return 0;
    const gelDoucheQty = items
      .filter((i) => i.kind === 'PRODUCT' && i.collectionId === gelsDoucheCollectionId)
      .reduce((s, i) => s + i.quantity, 0);
    return gelDoucheQty === 1 ? 30 : 0;
  }
  function total() {
    return Math.max(0, subtotal() - discount() + deliveryFee());
  }

  function clearPromo() {
    appliedPromo = null;
    if (promoMsg) { promoMsg.textContent = ''; promoMsg.className = 'cart-drawer__promo-msg'; }
    if (promoInput) promoInput.value = '';
  }

  function apiItems() {
    return items.map((i) => {
      if (i.kind === 'PRODUCT') return { kind: 'PRODUCT', productSlug: i.productSlug, quantity: i.quantity };
      if (i.kind === 'PACK') return { kind: 'PACK', packId: i.packId, componentSlugs: i.componentSlugs, quantity: i.quantity };
      if (i.kind === 'BUNDLE') return { kind: 'BUNDLE', bundleId: i.bundleId, quantity: i.quantity };
      return { kind: 'FREE_PACK', componentSlugs: i.componentSlugs, quantity: i.quantity };
    });
  }

  // Turns a (possibly repeated) list of names into "Atlas Noir ×2, Minuit Cuir"
  // instead of listing the same name once per repeat.
  function summarizeNames(names) {
    const counts = new Map();
    names.forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
    return Array.from(counts.entries()).map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
  }

  function addPack(packId, packName, packPrice, componentSlugs, componentNames, componentImages) {
    // Reuses the exact same `images` field/thumbnail rendering already used
    // for a plain product line — the cart drawer only ever shows the first
    // image of an item, so a pack now shows a real photo of one of its
    // chosen fragrances instead of the generic bottle icon, with zero new
    // rendering code needed.
    const images = Array.isArray(componentImages) ? componentImages.filter(Boolean) : [];
    items.push({
      uid: 'pack-' + Date.now(), kind: 'PACK', packId, name: packName,
      unitPrice: Number(packPrice), quantity: 1, componentSlugs, images,
      detail: `${componentSlugs.length} produits — ${summarizeNames(componentNames)}`,
    });
    clearPromo(); persist(); renderAll();
    trackPixelEvent('AddToCart', { content_name: packName, content_type: 'product_group', value: Number(packPrice), currency: 'MAD' });
  }

  function addFreePack(freePackName, unitPrice, componentSlugs, componentNames) {
    items.push({
      uid: 'freepack-' + Date.now(), kind: 'FREE_PACK', name: freePackName,
      unitPrice, quantity: 1, componentSlugs,
      detail: summarizeNames(componentNames),
    });
    clearPromo(); persist(); renderAll();
    trackPixelEvent('AddToCart', { content_name: freePackName, content_type: 'product_group', value: Number(unitPrice), currency: 'MAD' });
  }

  function addBundle(bundleId, bundleName, bundlePrice, detail) {
    // Merges into an existing line for the same bundle (matching addProduct's
    // pattern) instead of always creating a new one — needed so the bundle
    // detail page's quantity selector (which calls this once per unit, same
    // as the product detail page does) shows "×3" on one line rather than
    // three separate "×1" lines.
    const existing = items.find((i) => i.kind === 'BUNDLE' && i.bundleId === bundleId);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({
        uid: 'bundle-' + bundleId, kind: 'BUNDLE', bundleId, name: bundleName,
        unitPrice: Number(bundlePrice), quantity: 1, detail,
      });
    }
    clearPromo(); persist(); renderAll();
    pulseBadge();
    trackPixelEvent('AddToCart', { content_ids: [bundleId], content_name: bundleName, content_type: 'product_group', value: Number(bundlePrice), currency: 'MAD' });
  }

  function addProduct(product) {
    const existing = items.find((i) => i.kind === 'PRODUCT' && i.productSlug === product.slug);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({
        uid: 'product-' + product.slug, kind: 'PRODUCT', productSlug: product.slug,
        name: product.name, unitPrice: product.onSale ? product.displayPrice : product.price, quantity: 1,
        detail: product.notes || '', shape: product.shape, color: product.color, images: product.images || [],
        collectionId: product.collectionId || null,
      });
    }
    clearPromo(); persist(); renderAll();
    pulseBadge();
    trackPixelEvent('AddToCart', {
      content_ids: [product.slug], content_name: product.name, content_type: 'product',
      value: product.onSale ? product.displayPrice : product.price, currency: 'MAD',
    });
  }

  function removeItem(uid) {
    items = items.filter((i) => i.uid !== uid);
    clearPromo(); persist(); renderAll();
  }

  function clear() {
    items = [];
    clearPromo(); persist(); renderAll();
  }

  function pulseBadge() {
    if (!badge) return;
    badge.style.transform = 'scale(1.35)';
    setTimeout(() => { badge.style.transform = 'scale(1)'; }, 220);
  }

  function renderAll() {
    const count = itemCount();
    if (badge) { badge.textContent = count; badge.hidden = count === 0; }

    if (subtotalEl) subtotalEl.textContent = `${subtotal()} MAD`;
    if (discountEl) discountEl.textContent = `-${discount()} MAD`;
    if (discountRowEl) discountRowEl.hidden = discount() <= 0;
    const fee = deliveryFee();
    if (deliveryFeeEl) deliveryFeeEl.textContent = `${fee} MAD`;
    if (deliveryRowEl) deliveryRowEl.hidden = fee <= 0;
    if (checkoutDeliveryFeeEl) checkoutDeliveryFeeEl.textContent = `${fee} MAD`;
    if (checkoutDeliveryRowEl) checkoutDeliveryRowEl.hidden = fee <= 0;
    if (checkoutSubtotalEl) checkoutSubtotalEl.textContent = `${total()} MAD`;
    if (totalEl) totalEl.textContent = `${total()} MAD`;
    if (checkoutBtn) checkoutBtn.disabled = items.length === 0;
    renderCheckoutSelection();

    if (!itemsEl) return;
    itemsEl.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cart-drawer__empty';
      empty.textContent = 'Votre panier est vide.';
      itemsEl.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      const thumb = document.createElement('div');
      thumb.className = 'cart-item__thumb';
      // A pack with several different fragrances shows every one of their
      // photos (deduplicated — a fragrance picked ×2 only needs one tile),
      // not just the first; a single-fragrance pack, or any other item,
      // keeps the original one-photo thumbnail untouched.
      const distinctImages = Array.isArray(item.images) ? Array.from(new Set(item.images.filter(Boolean))) : [];
      if (item.kind === 'PACK' && distinctImages.length > 1) {
        thumb.classList.add('cart-item__thumb--multi');
        // A real edge-to-edge photo collage: 2 side by side / 3 as one tall
        // plus two stacked / 4 as an even 2×2 grid (top pair and bottom pair
        // get the exact same area) / a 5th fragrance rides in a small
        // circular badge centered over the 2×2 grid instead of being cut.
        const photos = distinctImages.slice(0, 5);
        const fifthPhoto = photos.length >= 5 ? photos[4] : null;
        const gridPhotos = fifthPhoto ? photos.slice(0, 4) : photos;
        if (gridPhotos.length === 2) {
          thumb.style.gridTemplateColumns = '1fr 1fr';
          thumb.style.gridTemplateRows = '1fr';
        } else {
          thumb.style.gridTemplateColumns = '1fr 1fr';
          thumb.style.gridTemplateRows = '1fr 1fr';
        }
        thumb.innerHTML = gridPhotos.map((src, i) => {
          let area = '';
          if (gridPhotos.length === 3 && i === 0) area = 'grid-column:1;grid-row:1 / 3;';
          else if (gridPhotos.length === 3) area = `grid-column:2;grid-row:${i};`;
          else if (gridPhotos.length === 4) area = `grid-column:${(i % 2) + 1};grid-row:${Math.floor(i / 2) + 1};`;
          return `<img src="${src}" alt="${item.name}" style="${area}">`;
        }).join('');
        if (fifthPhoto) {
          thumb.insertAdjacentHTML('beforeend', `<span class="cart-item__thumb-center"><img src="${fifthPhoto}" alt="${item.name}"></span>`);
        }
      } else {
        thumb.innerHTML = distinctImages[0] ? `<img src="${distinctImages[0]}" alt="${item.name}">` : productVisual(item.shape || 'bottle', item.color || '#C9A227');
      }
      const info = document.createElement('div');
      info.className = 'cart-item__info';
      const h4 = document.createElement('h4'); h4.textContent = item.name;
      const p = document.createElement('p'); p.textContent = item.detail;
      const meta = document.createElement('div'); meta.className = 'cart-item__meta';
      const price = document.createElement('span'); price.className = 'cart-item__price';
      price.textContent = item.quantity > 1 ? `${item.quantity} × ${item.unitPrice} MAD` : `${item.unitPrice} MAD`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button'; removeBtn.className = 'cart-item__remove'; removeBtn.textContent = 'Retirer';
      removeBtn.addEventListener('click', () => removeItem(item.uid));
      meta.appendChild(price); meta.appendChild(removeBtn);
      info.appendChild(h4); info.appendChild(p); info.appendChild(meta);
      row.appendChild(thumb); row.appendChild(info);
      itemsEl.appendChild(row);
    });
  }

  function renderCheckoutSelection() {
    const mount = document.getElementById('checkoutSelection');
    if (!mount) return;
    mount.textContent = '';
    if (items.length === 0) return;
    const title = document.createElement('p');
    title.className = 'checkout-selection__title';
    title.textContent = 'Votre sélection';
    const list = document.createElement('ul');
    items.forEach((item) => {
      const li = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'checkout-selection__line';
      const name = document.createElement('span');
      name.textContent = item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name;
      const price = document.createElement('span');
      price.textContent = `${item.unitPrice * item.quantity} MAD`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'checkout-selection__remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Retirer ${item.name}`);
      removeBtn.addEventListener('click', () => removeItem(item.uid));
      head.appendChild(name);
      head.appendChild(price);
      head.appendChild(removeBtn);
      li.appendChild(head);
      if (item.detail) {
        const detail = document.createElement('p');
        detail.className = 'checkout-selection__detail';
        detail.textContent = item.detail;
        li.appendChild(detail);
      }
      list.appendChild(li);
    });
    mount.appendChild(title);
    mount.appendChild(list);
  }

  function showStep(step) {
    stepBag.hidden = step !== 'bag';
    stepCheckout.hidden = step !== 'checkout';
    stepSuccess.hidden = step !== 'success';
  }
  function open(step) {
    drawer.classList.add('cart-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    showStep(step || 'bag');
  }
  function close() {
    if (!stepCheckout.hidden) Track.send('form_abandoned');
    drawer.classList.remove('cart-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', () => open('bag'));
  if (backdrop) backdrop.addEventListener('click', close);
  document.getElementById('cartClose').addEventListener('click', close);
  document.getElementById('cartCloseFromCheckout').addEventListener('click', close);
  document.getElementById('cartCloseFromSuccess').addEventListener('click', close);
  document.getElementById('cartBackToBag').addEventListener('click', () => showStep('bag'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('cart-drawer--open')) close();
  });

  if (promoInput) {
    promoInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      promoApplyBtn.click();
    });
  }

  if (promoApplyBtn) {
    promoApplyBtn.addEventListener('click', async () => {
      const code = promoInput.value.trim();
      if (!code) { clearPromo(); renderAll(); return; }
      promoMsg.textContent = 'Vérification...';
      promoMsg.className = 'cart-drawer__promo-msg';
      try {
        const result = await api('/promo/validate', { method: 'POST', body: JSON.stringify({ code, items: apiItems() }) });
        if (result.valid) {
          appliedPromo = { code, discount: result.discount };
          promoMsg.textContent = `Code appliqué : -${result.discount} MAD`;
          promoMsg.className = 'cart-drawer__promo-msg cart-drawer__promo-msg--ok';
        } else {
          appliedPromo = null;
          promoMsg.textContent = result.reason || 'Code invalide.';
          promoMsg.className = 'cart-drawer__promo-msg cart-drawer__promo-msg--error';
        }
      } catch (e) {
        appliedPromo = null;
        promoMsg.textContent = e.message;
        promoMsg.className = 'cart-drawer__promo-msg cart-drawer__promo-msg--error';
      }
      renderAll();
    });
  }

  function openCheckout() {
    if (items.length === 0) return;
    if (checkoutSubtotalEl) checkoutSubtotalEl.textContent = `${total()} MAD`;
    checkoutErrorEl.hidden = true;
    // A fresh checkout attempt gets a fresh idempotency key so a double-submit
    // of the SAME attempt is recognized server-side and never creates a second order.
    clientOrderId = newClientOrderId();
    formStarted = false;
    open('checkout');
    if (gelsDoucheCollectionId === null) loadGelsDoucheId();
    Track.send('checkout_opened');
    trackPixelEvent('InitiateCheckout', {
      value: total(), currency: 'MAD', num_items: itemCount(),
      content_ids: items.map((i) => i.productSlug || i.packId || i.bundleId).filter(Boolean),
    });
  }

  checkoutBtn.addEventListener('click', openCheckout);

  checkoutForm.addEventListener('input', () => {
    if (formStarted) return;
    formStarted = true;
    Track.send('form_started');
  });

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    Track.send('order_submit_clicked');
    if (!checkoutForm.reportValidity()) return;
    if (!isValidPhone(checkoutForm.phone.value)) {
      checkoutErrorEl.textContent = PHONE_ERROR_MSG;
      checkoutErrorEl.hidden = false;
      return;
    }
    // Belt-and-suspenders against double submission: a synchronous flag
    // (immune to a second click landing before disabled= takes visual
    // effect) plus the disabled attribute plus a server-side idempotency key.
    if (isSubmittingOrder) return;
    isSubmittingOrder = true;
    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.textContent = 'Traitement...';
    checkoutErrorEl.hidden = true;

    const formData = new FormData(checkoutForm);
    pendingCustomer = {
      fullName: formData.get('fullName').toString().trim(),
      address: formData.get('address').toString().trim(),
      city: formData.get('city').toString().trim(),
      phone: formData.get('phone').toString().trim(),
    };

    try {
      const result = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer: pendingCustomer,
          items: apiItems(),
          promoCode: appliedPromo ? appliedPromo.code : undefined,
          clientOrderId,
          metaContext: metaBrowserContext(),
        }),
      });

      successNameEl.textContent = pendingCustomer.fullName;
      successOrderNumberEl.textContent = result.orderNumber;
      const receiptLink = document.getElementById('successReceiptLink');
      if (receiptLink) receiptLink.href = `#receipt/${encodeURIComponent(result.orderNumber)}/${encodeURIComponent(pendingCustomer.phone)}`;
      successListEl.innerHTML = '';
      items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item.quantity > 1
          ? `${item.name} × ${item.quantity} — ${item.unitPrice * item.quantity} MAD`
          : `${item.name} — ${item.unitPrice} MAD`;
        successListEl.appendChild(li);
      });
      const totalLi = document.createElement('li');
      totalLi.style.fontWeight = '600';
      totalLi.textContent = `Total — ${result.total} MAD`;
      successListEl.appendChild(totalLi);

      trackPixelEvent('Purchase', {
        value: result.total, currency: 'MAD', num_items: itemCount(),
        content_ids: items.map((i) => i.productSlug || i.packId || i.bundleId).filter(Boolean),
      }, result.orderNumber);

      // Order is locked in server-side — now safe to wipe the local cart so
      // a page refresh or repeat visit can never resubmit the same order.
      clear();
      checkoutForm.reset();
      pendingCustomer = null;
      clientOrderId = null;
      showStep('success');
      Track.send('order_created');
      Track.send('confirmation_viewed');
    } catch (err) {
      checkoutErrorEl.textContent = err.message;
      checkoutErrorEl.hidden = false;
    } finally {
      isSubmittingOrder = false;
      checkoutSubmitBtn.disabled = false;
      checkoutSubmitBtn.textContent = 'PASSER MA COMMANDE';
    }
  });

  const orderHistoryBtn = document.getElementById('orderHistoryBtn');
  const orderHistoryResult = document.getElementById('orderHistoryResult');
  if (orderHistoryBtn) {
    orderHistoryBtn.addEventListener('click', async () => {
      const fullName = checkoutForm.fullName.value.trim();
      const phone = checkoutForm.phone.value.trim();
      if (!fullName || !phone) {
        orderHistoryResult.innerHTML = '<p class="checkout-form__error">Renseignez votre nom et téléphone ci-dessus d\'abord.</p>';
        return;
      }
      if (!isValidPhone(phone)) {
        orderHistoryResult.innerHTML = `<p class="checkout-form__error">${PHONE_ERROR_MSG}</p>`;
        return;
      }
      orderHistoryBtn.disabled = true;
      orderHistoryBtn.textContent = 'Recherche...';
      try {
        const data = await api('/orders/history', { method: 'POST', body: JSON.stringify({ fullName, phone }) });
        orderHistoryResult.innerHTML = data.orders.length
          ? data.orders.map((o) => `
            <div class="order-history-item">
              <div class="order-history-item__head"><span>${o.orderNumber}</span><span>${o.total} MAD</span></div>
              <div class="order-history-item__meta">${new Date(o.createdAt).toLocaleDateString('fr-FR')} · ${o.status} · ${o.items.length} article(s)</div>
            </div>`).join('')
          : '<p class="admin-field-help">Aucune commande trouvée avec ces informations.</p>';
      } catch (err) {
        orderHistoryResult.innerHTML = `<p class="checkout-form__error">${err.message}</p>`;
      } finally {
        orderHistoryBtn.disabled = false;
        orderHistoryBtn.textContent = 'Voir mes commandes précédentes';
      }
    });
  }

  document.getElementById('cartContinueShopping').addEventListener('click', close);
  const receiptLinkEl = document.getElementById('successReceiptLink');
  if (receiptLinkEl) receiptLinkEl.addEventListener('click', close);

  renderAll();

  return { addPack, addFreePack, addBundle, addProduct, open, close, openCheckout };
})();

// ===========================
// ADD TO CART — confirmation ("Continuer mes achats" / "Continuer")
// ===========================
function showAddToCartToast() {
  const toast = document.getElementById('atcToast');
  if (!toast) return;
  toast.hidden = false;
  document.body.style.overflow = 'hidden';
}
function hideAddToCartToast() {
  const toast = document.getElementById('atcToast');
  if (!toast) return;
  toast.hidden = true;
  document.body.style.overflow = '';
}
(() => {
  const toast = document.getElementById('atcToast');
  if (!toast) return;
  document.getElementById('atcToastBackdrop').addEventListener('click', hideAddToCartToast);
  document.getElementById('atcContinueShopping').addEventListener('click', hideAddToCartToast);
  document.getElementById('atcContinue').addEventListener('click', () => {
    hideAddToCartToast();
    if (Cart) Cart.openCheckout();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !toast.hidden) hideAddToCartToast(); });
})();

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-add-product');
  if (!btn || !Cart) return;
  const slug = btn.dataset.slug;
  try {
    const product = await getProductBySlug(slug);
    Cart.addProduct(product);
    showAddToCartToast();
  } catch (err) { /* product unavailable */ }
});

// "Ajouter au panier" on a pack-only perfume's detail page: there's no
// standalone cart to add it to (this collection sells only via packs), so
// instead it carries the perfume forward as a pre-selected pack choice —
// whichever pack the customer opens next starts with this one already
// picked, instead of making them find it again in the grid.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.js-add-to-pack');
  if (!btn) return;
  pendingPreselectSlug = btn.dataset.slug;
  location.hash = `#collection/${btn.dataset.collectionSlug}`;
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.js-add-bundle');
  if (!btn || !Cart) return;
  Cart.addBundle(btn.dataset.id, btn.dataset.name, btn.dataset.price, btn.dataset.detail);
  showAddToCartToast();
});

// ===========================
// HERO SLIDER
// ===========================
function renderHeroSlider(slides) {
  const mount = document.getElementById('heroSlider');
  if (!mount || !slides || slides.length === 0) return;

  let current = 0;
  let timer = null;

  mount.innerHTML = slides.map((slide, i) => {
    const mediaHTML = slide.videoUrl
      ? `<video class="hero-slide__media" autoplay muted loop playsinline src="${slide.videoUrl}"></video>`
      : slide.imageUrl
        ? `<div class="hero-slide__bg" style="background-image:url('${slide.imageUrl}')"></div>`
        : `<div class="hero-slide__bg" style="background:${slide.gradientFallback || '#0c0c0c'}"></div>`;

    const ctas = [];
    if (slide.ctaText1 && slide.ctaHref1) ctas.push({ text: slide.ctaText1, href: slide.ctaHref1, variant: 'gold' });
    if (slide.ctaText2 && slide.ctaHref2) ctas.push({ text: slide.ctaText2, href: slide.ctaHref2, variant: 'outline' });
    const ctasHTML = ctas.map((c) => `<a href="${c.href}" class="btn btn--${c.variant}">${c.text}</a>`).join('');
    const hasText = !!(slide.eyebrow || slide.title || slide.subtitle || ctas.length);

    const textHTML = hasText ? `
        <div class="hero-slide__overlay"></div>
        <div class="hero-slide__inner">
          <div class="hero-slide__content">
            ${slide.eyebrow ? `<p class="eyebrow">${slide.eyebrow}</p>` : ''}
            ${slide.title ? `<h1>${slide.title}</h1>` : ''}
            ${slide.subtitle ? `<p class="hero-slide__subtitle">${slide.subtitle}</p>` : ''}
            ${ctasHTML ? `<div class="hero-slide__actions">${ctasHTML}</div>` : ''}
          </div>
        </div>` : '';

    return `
      <div class="hero-slide${i === 0 ? ' is-active' : ''}${hasText ? '' : ' hero-slide--media-only'}" data-index="${i}">
        ${mediaHTML}
        ${textHTML}
      </div>`;
  }).join('') + `
    <button type="button" class="hero-slider__arrow hero-slider__arrow--prev" aria-label="Slide précédent">
      <svg viewBox="0 0 24 24"><path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" class="hero-slider__arrow hero-slider__arrow--next" aria-label="Slide suivant">
      <svg viewBox="0 0 24 24"><path d="M9 5 L16 12 L9 19" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="hero-slider__dots">
      ${slides.map((_, i) => `<button type="button" class="hero-slider__dot${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="Aller au slide ${i + 1}"></button>`).join('')}
    </div>`;

  if (slides.length <= 1) return;

  const slideEls = Array.from(mount.querySelectorAll('.hero-slide'));
  const dotEls = Array.from(mount.querySelectorAll('.hero-slider__dot'));
  const prevBtn = mount.querySelector('.hero-slider__arrow--prev');
  const nextBtn = mount.querySelector('.hero-slider__arrow--next');

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    slideEls.forEach((el, i) => el.classList.toggle('is-active', i === current));
    dotEls.forEach((el, i) => el.classList.toggle('is-active', i === current));
  }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }
  function startAutoplay() { stopAutoplay(); timer = setInterval(next, 6500); }
  function stopAutoplay() { if (timer) clearInterval(timer); }

  prevBtn.addEventListener('click', () => { prev(); startAutoplay(); });
  nextBtn.addEventListener('click', () => { next(); startAutoplay(); });
  dotEls.forEach((dot) => dot.addEventListener('click', () => { goTo(Number(dot.dataset.index)); startAutoplay(); }));
  mount.addEventListener('mouseenter', stopAutoplay);
  mount.addEventListener('mouseleave', startAutoplay);

  let touchStartX = null;
  mount.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  mount.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 40) { delta > 0 ? prev() : next(); startAutoplay(); }
    touchStartX = null;
  }, { passive: true });

  startAutoplay();
}

// ===========================
// HOMEPAGE SECTIONS (admin-managed, rendered in order)
// ===========================
// An admin-uploaded collection image always wins; only falls back to the
// per-slug gradient (defined in CSS) when no image has been set.
function collectionTileHTML(c) {
  // The tinted ::before backdrop is a CSS custom property so an uploaded
  // photo can replace the per-slug gradient without inline styles fighting
  // the pseudo-element (which can't read a plain inline background-image).
  const style = c.image ? ` style="--tile-image:url('${c.image}')"` : '';
  // Small round previews of a few of this collection's own products —
  // purely decorative, degrades to nothing if the API didn't provide any
  // (e.g. the homepage's own FEATURED_COLLECTIONS resolver).
  const previews = Array.isArray(c.previewImages) ? c.previewImages : [];
  const pastillesHTML = previews.length
    ? `<span class="collection-tile__pastilles">${previews.map((src) => `<span class="collection-tile__pastille"><img src="${src}" alt="" loading="lazy"></span>`).join('')}</span>`
    : '';
  return `
    <a href="#collection/${c.slug}" class="collection-tile collection-tile--${c.slug}${c.image ? ' has-image' : ''}"${style}>
      ${pastillesHTML}
      <span class="collection-tile__label">${c.name}</span>
      <span class="collection-tile__sub">${c.description || ''}</span>
    </a>`;
}

function collectionsSectionHTML(section) {
  const collections = section.config.collections || [];
  const tilesHTML = collections.map(collectionTileHTML).join('');
  return `
    <section class="collections-page">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'La Maison'}</p>
        <h2 class="section__title">${section.subtitle || 'Nos collections'}</h2>
        <div class="collections-page__grid">${tilesHTML}</div>
      </div>
    </section>`;
}

function productsSectionHTML(section) {
  const products = section.config.products || [];
  cacheProducts(products);
  return `
    <section class="products">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Sélection'}</p>
        <h2 class="section__title">${section.subtitle || ''}</h2>
        <div class="products__grid">${products.map(productCardHTML).join('')}</div>
      </div>
    </section>`;
}

let maisonSectionAssigned = false;
function textImageSectionHTML(section) {
  const id = !maisonSectionAssigned ? ' id="maison"' : '';
  maisonSectionAssigned = true;
  return `
    <section class="maison"${id}>
      <div class="container maison__inner">
        <p class="section__eyebrow">${section.title || ''}</p>
        <h2 class="section__title">${section.subtitle || ''}</h2>
        <p class="maison__text">${section.config.body || ''}</p>
      </div>
    </section>`;
}

function productShowcaseSectionHTML(section) {
  const p = section.config.product;
  if (!p) return '';
  const reversed = section.config.imagePosition === 'left';
  const bodyText = section.config.body || p.description || '';
  return `
    <section class="product-showcase${reversed ? ' product-showcase--reverse' : ''}">
      <div class="container product-showcase__grid">
        <div class="product-showcase__media">
          <img src="${p.images[0] || ''}" alt="${escapeHtmlText(p.name)}" loading="lazy">
        </div>
        <div class="product-showcase__content">
          <p class="section__eyebrow">${section.title || 'En vedette'}</p>
          <h2 class="section__title">${section.subtitle || escapeHtmlText(p.name)}</h2>
          ${bodyText ? `<p class="product-showcase__text">${escapeHtmlText(bodyText)}</p>` : ''}
          ${priceHTML(p)}
          <a href="#product/${p.slug}" class="btn btn--gold product-showcase__cta">Découvrir</a>
        </div>
      </div>
    </section>`;
}

function testimonialsSectionHTML(section) {
  const items = section.config.items || [];
  return `
    <section class="testimonials">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Avis'}</p>
        <h2 class="section__title">${section.subtitle || ''}</h2>
        <div class="testimonials__grid">
          ${items.map((t) => `
            <blockquote class="testimonial">
              <div class="stars">${'★'.repeat(t.rating || 5)}</div>
              <p>« ${t.quote} »</p>
              <cite>— ${t.author}</cite>
            </blockquote>`).join('')}
        </div>
      </div>
    </section>`;
}

function bundleCardHTML(b) {
  const content = b.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
  const hasPhoto = !!b.image;
  return `
    <article class="product-card reveal" data-href="#bundle/${b.slug}">
      <div class="product-card__media${hasPhoto ? ' product-card__media--photo' : ''}">
        <span class="product-card__tag product-card__tag--gold">Bundle</span>
        <a href="#bundle/${b.slug}" class="product-card__bottle">${hasPhoto ? `<img src="${b.image}" alt="${b.name}" loading="lazy">` : productVisual('bottle', '#C9A227')}</a>
      </div>
      <div class="product-card__footer">
        <div class="product-card__heading">
          <h3><a href="#bundle/${b.slug}">${cardTitleHTML(b.name)}</a></h3>
          <p class="product-card__price">${b.price} MAD</p>
        </div>
        <p class="product-card__notes">${content}</p>
        <button type="button" class="btn btn--outline product-card__cta js-add-bundle" data-id="${b.id}" data-name="${b.name}" data-price="${b.price}" data-detail="${content.replace(/"/g, '&quot;')}">Ajouter au panier →</button>
      </div>
    </article>`;
}

function bundlesSectionHTML(section) {
  const bundles = section.config.bundles || [];
  if (bundles.length === 0) return '';
  const items = bundles.map((b, i) => {
    const content = b.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
    return `
      <button type="button" class="bundle-order__item${i === 0 ? ' is-selected' : ''}" data-bundle-pick
        data-id="${b.id}" data-name="${escapeHtmlText(b.name)}" data-price="${b.price}" data-detail="${escapeHtmlText(content)}">
        ${b.image ? `<img src="${b.image}" alt="${escapeHtmlText(b.name)}" class="bundle-order__item-img" loading="lazy">` : ''}
        <span class="bundle-order__item-info">
          <strong>${escapeHtmlText(b.name)}</strong>
          <span class="bundle-order__item-detail">${escapeHtmlText(content)}</span>
          <span class="bundle-order__item-price">${b.price} MAD</span>
        </span>
        <span class="bundle-order__item-check" aria-hidden="true"></span>
      </button>`;
  }).join('');
  const first = bundles[0];
  const firstContent = first.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');

  return `
    <section class="bundle-order">
      <div class="container bundle-order__grid">
        <div class="bundle-order__intro">
          <p class="section__eyebrow">${section.title || 'Offres groupées'}</p>
          <h2 class="section__title">${section.subtitle || 'Commandez votre bundle en 3 étapes'}</h2>
          <ol class="bundle-order__steps">
            <li><span class="bundle-order__step-num">1</span><div><strong>Choisissez votre bundle</strong><p>Sélectionnez l'offre ci-contre et validez votre commande.</p></div></li>
            <li><span class="bundle-order__step-num">2</span><div><strong>Confirmation par WhatsApp</strong><p>Nous vous contactons rapidement pour confirmer votre commande.</p></div></li>
            <li><span class="bundle-order__step-num">3</span><div><strong>Réception & paiement à la livraison</strong><p>Vous recevez votre colis et payez à la livraison.</p></div></li>
          </ol>
        </div>
        <div class="bundle-order__card">
          <div class="bundle-order__list" id="bundleOrderList-${section.id}">${items}</div>
          <button type="button" class="btn btn--gold btn--full js-add-bundle" id="bundleOrderCta-${section.id}"
            data-id="${first.id}" data-name="${escapeHtmlText(first.name)}" data-price="${first.price}" data-detail="${escapeHtmlText(firstContent)}">
            Commander ce bundle →
          </button>
          <p class="bundle-order__cod">Paiement à la livraison</p>
        </div>
      </div>
    </section>`;
}

// Clicking a bundle in the ordering card re-points the single CTA button
// at that bundle (id/name/price/detail) instead of adding every click to
// the cart — only the final button press actually adds one.
document.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-bundle-pick]');
  if (!pick) return;
  const list = pick.closest('.bundle-order__list');
  list.querySelectorAll('.bundle-order__item').forEach((el) => el.classList.remove('is-selected'));
  pick.classList.add('is-selected');
  const cta = list.closest('.bundle-order__card').querySelector('.js-add-bundle');
  cta.dataset.id = pick.dataset.id;
  cta.dataset.name = pick.dataset.name;
  cta.dataset.price = pick.dataset.price;
  cta.dataset.detail = pick.dataset.detail;
});

// Shared pack card: used on the homepage packs section and on each
// collection's detail page. `image`/`tagline`/`blurb` are optional and
// admin-entered (Packs admin) — falls back to the plain size/price info
// whenever an admin hasn't customized a given pack yet.
// Reverted to the original plain card for now, at the user's request —
// the photo/pill version above is kept working (packCardHTML callers,
// the admin's per-pack image/tagline/blurb fields, and the CSS) in case
// it comes back later; this just isn't rendering it at the moment.
function packCardHTML(pack, i, featuredIndex, ctaText) {
  return `
    <div class="pack-card${i === featuredIndex ? ' pack-card--featured' : ''}">
      ${i === featuredIndex ? '<span class="pack-card__badge">Le plus choisi</span>' : ''}
      <h3>${pack.name}</h3>
      <p class="pack-card__count">${pack.size} produits</p>
      <p class="pack-card__price">${pack.price} <span>MAD</span></p>
      <ul><li>${pack.size} produits au choix</li><li>Livraison offerte</li><li>Paiement à la livraison</li></ul>
      <a href="#compose/pack/${pack.id}" class="btn btn--${i === featuredIndex ? 'gold' : 'outline'} btn--full">${ctaText}</a>
    </div>`;
}

// Optional rich banner at the top of a collection's detail page — entirely
// hidden (falling back to the plain title row) unless an admin has set a
// banner title or image for that collection (Collections admin > Bannière).
function renderCollectionBanner(collection) {
  const banner = document.getElementById('collectionBanner');
  const plainHeader = document.getElementById('collectionDetailPlainHeader');
  if (!banner) return;
  const hasBanner = !!(collection.bannerTitle || collection.bannerImage);
  banner.hidden = !hasBanner;
  if (plainHeader) plainHeader.hidden = hasBanner;
  if (!hasBanner) return;

  const image = collection.bannerImage || collection.image;
  document.getElementById('collectionBannerMedia').style.backgroundImage = image ? `url('${image}')` : '';
  document.getElementById('collectionBannerTitle').textContent = collection.bannerTitle || collection.name;
  document.getElementById('collectionBannerDesc').textContent = collection.description || '';
  document.getElementById('collectionBannerCtaText').textContent = collection.bannerCtaText || 'Voir tous les produits';
  const taglineEl = document.getElementById('collectionBannerTagline');
  if (collection.bannerTagline) { taglineEl.textContent = collection.bannerTagline; taglineEl.hidden = false; }
  else { taglineEl.hidden = true; }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#collectionBannerCta')) return;
  const target = document.getElementById('collectionDetailToolbar') || document.getElementById('collectionDetailGrid');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Rich banner at the top of a pack's composer page. Reuses the exact same
// .collection-banner visual language as the collection detail page (the
// extra .compose-banner class only adds the full-bleed breakout, since this
// page's container — unlike the collection page's — is width-constrained).
// Image falls back from the pack's own photo to its collection's banner/tile
// photo; the vertical tagline is the parent collection's (a brand-level
// phrase, not pack-specific), so a collection set once applies to every pack.
function composeBannerHTML(pack) {
  const collection = pack.collection || {};
  const image = pack.image || collection.bannerImage || collection.image || null;
  const tagline = collection.bannerTagline || '';
  const features = [
    { icon: 'leaf', label: 'Plusieurs parfums' },
    { icon: 'gift', label: 'Un seul pack' },
    { icon: 'star', label: 'Votre sélection unique' },
  ];
  const iconPaths = {
    leaf: '<path d="M5 19c7-1 12-6 13-13-7 1-12 6-13 13z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 18c2-4 5-7 9-9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    gift: '<rect x="4" y="9" width="16" height="11" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 13h16M12 9v11" stroke="currentColor" stroke-width="1.4"/><path d="M12 9c-1.8 0-3-1-3-2.5S10.2 4 12 4s3 1 3 2.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M12 9c1.8 0 3-1 3-2.5S13.8 4 12 4s-3 1-3 2.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    star: '<path d="M12 4l2.3 5.6 6 0.5-4.6 3.9 1.5 5.9L12 16.9 6.8 19.9l1.5-5.9-4.6-3.9 6-0.5z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  };
  return `
    <div class="compose-banner">
      <div class="compose-banner__content">
        <a href="#compose/size/${pack.size}" class="collection-detail__back">← Changer de collection</a>
        <p class="section__eyebrow">Composez votre ${pack.name}</p>
        <h1>${pack.name}</h1>
        <p class="compose-banner__desc">Vous pouvez sélectionner plusieurs fois le même parfum. Créez votre pack sur mesure selon vos envies.</p>
        <div class="compose-banner__features">
          ${features.map((f) => `
            <div class="compose-banner__feature">
              <span class="compose-banner__feature-icon"><svg viewBox="0 0 24 24">${iconPaths[f.icon]}</svg></span>
              <span>${f.label}</span>
            </div>`).join('')}
        </div>
      </div>
      ${image ? `
        <div class="compose-banner__media" style="background-image:url('${image}')">
          ${tagline ? `<p class="compose-banner__tagline">${tagline}</p>` : ''}
        </div>` : ''}
    </div>`;
}

function packsSectionHTML(section) {
  const packs = section.config.packs || [];
  if (!packs.length) return '';
  cachePacks(packs);
  const featuredIndex = packs.length === 3 ? 1 : -1;
  return `
    <section class="packs">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Formules'}</p>
        <h2 class="section__title">${section.subtitle || 'Composez votre pack'}</h2>
        <div class="packs__grid">
          ${packs.map((pack, i) => packCardHTML(pack, i, featuredIndex, 'Composer')).join('')}
        </div>
      </div>
    </section>`;
}

function clientReviewCardHTML(r) {
  return `
    <article class="client-review-card reveal">
      ${r.customerPhoto ? `<img class="client-review-card__photo" src="${r.customerPhoto}" alt="${r.customerName || 'Client'}">` : ''}
      <div class="client-review-card__stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      ${r.text ? `<p class="client-review-card__text">« ${r.text} »</p>` : ''}
      ${r.customerVideo ? `<a href="${r.customerVideo}" target="_blank" rel="noopener" class="client-review-card__video">▶ Voir la vidéo</a>` : ''}
      <p class="client-review-card__name">${r.customerName || 'Client VEINTUNO'}${r.product ? ` — ${r.product.name}` : ''}</p>
    </article>`;
}

function clientReviewsSectionHTML(section) {
  const reviews = (section.config.reviews || []).filter((r) => r.customerPhoto);
  if (!reviews.length) return '';
  const slides = reviews.map((r) => `
    <div class="center-carousel__slide">
      <article class="client-review-card">
        <img class="client-review-card__photo" src="${r.customerPhoto}" alt="${escapeHtmlText(r.customerName || 'Avis client')}" loading="lazy" decoding="async">
        ${r.rating ? `<div class="client-review-card__stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>` : ''}
        ${r.text ? `<p class="client-review-card__text">« ${escapeHtmlText(r.text)} »</p>` : ''}
        ${r.customerName ? `<p class="client-review-card__name">${escapeHtmlText(r.customerName)}${r.product ? ` — ${escapeHtmlText(r.product.name)}` : ''}</p>` : ''}
      </article>
    </div>`).join('');
  return `
    <section class="review-gallery">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Avis clients'}</p>
        <h2 class="section__title">${section.subtitle || 'Ce que nos clients disent'}</h2>
        ${centerCarouselHTML(`carousel-${section.id}`, slides)}
      </div>
    </section>`;
}

// Reusable full-screen image viewer. Any element with class .js-zoom-image
// inside a [data-zoom-group] opens the group's images in order.
const Lightbox = (() => {
  let images = [];
  let index = 0;
  let overlay = null;

  function render() {
    overlay.querySelector('img').src = images[index];
    const multiple = images.length > 1;
    overlay.querySelector('.lightbox__nav--prev').hidden = !multiple;
    overlay.querySelector('.lightbox__nav--next').hidden = !multiple;
  }
  function step(delta) {
    index = (index + delta + images.length) % images.length;
    render();
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.hidden = true;
    overlay.innerHTML = `
      <button type="button" class="lightbox__close" aria-label="Fermer">&times;</button>
      <button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="Image précédente">&#8249;</button>
      <img class="lightbox__img" alt="">
      <button type="button" class="lightbox__nav lightbox__nav--next" aria-label="Image suivante">&#8250;</button>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.lightbox__close')) close();
      else if (e.target.closest('.lightbox__nav--prev')) step(-1);
      else if (e.target.closest('.lightbox__nav--next')) step(1);
    });
    document.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
  }
  function open(list, start) {
    if (!overlay) build();
    images = list.filter(Boolean);
    if (!images.length) return;
    index = Math.min(Math.max(start || 0, 0), images.length - 1);
    render();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  return { open };
})();

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.js-zoom-image');
  if (!trigger) return;
  const group = trigger.closest('[data-zoom-group]') || trigger.parentElement;
  const items = Array.from(group.querySelectorAll('.js-zoom-image'));
  Lightbox.open(items.map((el) => el.dataset.src), items.indexOf(trigger));
});

function promoBannerSectionHTML(section) {
  return `
    <section class="promo-banner">
      <h2>${section.title || ''}</h2>
      <p>${section.config.body || section.subtitle || ''}</p>
      ${section.config.ctaText && section.config.ctaHref ? `<a href="${section.config.ctaHref}" class="btn btn--gold">${section.config.ctaText}</a>` : ''}
    </section>`;
}

const SECTION_RENDERERS = {
  FEATURED_COLLECTIONS: collectionsSectionHTML,
  FEATURED_PRODUCTS: productsSectionHTML,
  BEST_SELLERS: productsSectionHTML,
  NEW_ARRIVALS: productsSectionHTML,
  BUNDLES: bundlesSectionHTML,
  PRODUCT_SHOWCASE: productShowcaseSectionHTML,
  TEXT_IMAGE: textImageSectionHTML,
  TESTIMONIALS: testimonialsSectionHTML,
  PROMO_BANNER: promoBannerSectionHTML,
  PACKS: packsSectionHTML,
  CLIENT_REVIEWS: clientReviewsSectionHTML,
};

function videoShowcaseCardHTML(v) {
  return `
    <div class="center-carousel__slide">
      <div class="video-showcase__card">
        <video class="video-showcase__video" src="${v.videoUrl}" ${v.posterImage ? `poster="${v.posterImage}"` : ''} muted loop playsinline preload="metadata" controls></video>
        ${v.title ? `<p class="video-showcase__caption">${escapeHtmlText(v.title)}</p>` : ''}
      </div>
    </div>`;
}

// ===========================
// CENTER CAROUSEL — shared by the reviews and video-showcase sections.
// Renders every slide (so no extra network/DOM work vs. the old grid —
// same elements, just a different layout), slides the track so the
// current one sits centered and enlarged, side ones stay small. Swipe on
// touch, arrows on desktop, autoplay paused on hover/touch/interaction.
// Only a handful of homepage slides ever exist, so re-measuring on each
// move is cheap — no virtualization needed.
// ===========================
function centerCarouselHTML(id, slidesHTML) {
  return `
    <div class="center-carousel" id="${id}">
      <button type="button" class="center-carousel__arrow center-carousel__arrow--prev" aria-label="Précédent">
        <svg viewBox="0 0 24 24"><path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="center-carousel__viewport">
        <div class="center-carousel__track">${slidesHTML}</div>
      </div>
      <button type="button" class="center-carousel__arrow center-carousel__arrow--next" aria-label="Suivant">
        <svg viewBox="0 0 24 24"><path d="M9 5 L16 12 L9 19" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
}

function initCenterCarousel(id, { autoplayMs = 4500 } = {}) {
  const root = document.getElementById(id);
  if (!root) return;
  const viewport = root.querySelector('.center-carousel__viewport');
  const track = root.querySelector('.center-carousel__track');
  const slides = Array.from(track.children);
  if (slides.length < 2) { if (slides[0]) slides[0].classList.add('is-center'); return; }
  let current = 0;
  let timer = null;

  function position() {
    slides.forEach((s, i) => s.classList.toggle('is-center', i === current));
    const slide = slides[current];
    const targetCenter = viewport.clientWidth / 2;
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
    track.style.transform = `translateX(${targetCenter - slideCenter}px)`;
  }
  function goTo(i) { current = (i + slides.length) % slides.length; position(); }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }
  function stopAutoplay() { if (timer) clearInterval(timer); }
  function startAutoplay() { stopAutoplay(); timer = setInterval(next, autoplayMs); }

  // A playing video must not keep playing once it's no longer centered.
  function pauseOffCenterVideos() {
    slides.forEach((s, i) => { if (i !== current) s.querySelector('video')?.pause(); });
  }

  root.querySelector('.center-carousel__arrow--prev').addEventListener('click', () => { prev(); pauseOffCenterVideos(); startAutoplay(); });
  root.querySelector('.center-carousel__arrow--next').addEventListener('click', () => { next(); pauseOffCenterVideos(); startAutoplay(); });
  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);

  let touchStartX = null;
  viewport.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; stopAutoplay(); }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 40) { delta > 0 ? prev() : next(); pauseOffCenterVideos(); }
    touchStartX = null;
    startAutoplay();
  }, { passive: true });

  window.addEventListener('resize', position);
  position();
  startAutoplay();
}

async function initHomepage() {
  try {
    const data = await api('/homepage');
    renderHeroSlider(data.slides);

    const mount = document.getElementById('homepageSections');
    if (mount) {
      mount.innerHTML = data.sections
        .map((s) => (SECTION_RENDERERS[s.type] ? SECTION_RENDERERS[s.type](s) : ''))
        .join('');
    }

    const videoSection = document.getElementById('videoShowcaseSection');
    const videoGrid = document.getElementById('videoShowcaseGrid');
    if (videoSection && videoGrid && Array.isArray(data.videos) && data.videos.length) {
      videoGrid.innerHTML = centerCarouselHTML('videoShowcaseCarousel', data.videos.map(videoShowcaseCardHTML).join(''));
      videoSection.hidden = false;
      initCenterCarousel('videoShowcaseCarousel');
    }

    // Every reviews/testimonial carousel the sections above just rendered.
    document.querySelectorAll('#homepageSections .center-carousel').forEach((el) => initCenterCarousel(el.id));
  } catch (e) { /* homepage will just show hero-less shell */ }

  initRevealAnimations();
}

// ===========================
// FREE PACK
// ===========================
let freePackConfigCache = null;

async function getFreePackConfig() {
  if (freePackConfigCache) return freePackConfigCache;
  try {
    const config = await api('/free-pack');
    if (config) { freePackConfigCache = config; cacheProducts(config.eligibleProducts); }
    return config;
  } catch (e) { return null; }
}

// ===========================
// COMPOSE PACK — dedicated pages (no modals) for the whole
// "Composer mon pack" journey: formula → type → product selection.
// Rendered into #composeContainer by the router based on the hash.
// ===========================
function composeProgressHTML(count, total, unit) {
  const pct = total ? Math.min(100, (count / total) * 100) : 0;
  return `
    <div class="pack-modal__progress compose-progress">
      <div class="pack-modal__progress-text">
        <span>${count}</span> ${unit} sur <span>${total}</span> sélectionné(s)
      </div>
      <div class="pack-modal__progress-bar"><div class="pack-modal__progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// Plays once per browser session — a returning visitor jumping between pack
// sizes shouldn't have to sit through the intro every single time.
function playComposeIntro(container) {
  return new Promise((resolve) => {
    if (sessionStorage.getItem('veintuno_compose_intro_seen')) { resolve(); return; }
    const overlay = document.createElement('div');
    overlay.className = 'compose-intro';
    overlay.innerHTML = `<p class="compose-intro__line compose-intro__line--welcome">Bienvenue chez VEINTUNO HOUSE</p><p class="compose-intro__line compose-intro__line--mark" hidden>XXI</p>`;
    container.innerHTML = '';
    container.appendChild(overlay);
    const welcomeEl = overlay.querySelector('.compose-intro__line--welcome');
    const markEl = overlay.querySelector('.compose-intro__line--mark');
    requestAnimationFrame(() => welcomeEl.classList.add('is-visible'));
    setTimeout(() => {
      welcomeEl.classList.remove('is-visible');
      welcomeEl.classList.add('is-leaving');
    }, 1400);
    setTimeout(() => {
      welcomeEl.hidden = true;
      markEl.hidden = false;
      requestAnimationFrame(() => markEl.classList.add('is-visible'));
    }, 1750);
    setTimeout(() => {
      overlay.classList.add('is-fading');
    }, 2600);
    setTimeout(() => {
      sessionStorage.setItem('veintuno_compose_intro_seen', '1');
      overlay.remove();
      resolve();
    }, 3050);
  });
}

async function renderComposeFormula(container) {
  await playComposeIntro(container);
  container.innerHTML = `
    <a href="#accueil" class="collection-detail__back">← Retour à l'accueil</a>
    <p class="section__eyebrow">Composer mon pack</p>
    <h2 class="section__title">Choisissez votre formule</h2>
    <div class="chooser-grid" id="composeFormulaGrid"><p class="admin-field-help">Chargement...</p></div>`;

  const grid = document.getElementById('composeFormulaGrid');
  const [allPacks, freePackConfig] = await Promise.all([api('/packs'), getFreePackConfig()]);
  cachePacks(allPacks);

  const bySize = new Map();
  allPacks.forEach((p) => {
    if (!bySize.has(p.size)) bySize.set(p.size, []);
    bySize.get(p.size).push(p);
  });
  const sizes = Array.from(bySize.keys()).sort((a, b) => a - b);

  const cardsHTML = sizes.map((size) => {
    const prices = bySize.get(size).map((p) => p.price);
    const priceLabel = Math.min(...prices) === Math.max(...prices) ? `${prices[0]} MAD` : `dès ${Math.min(...prices)} MAD`;
    return `
      <a href="#compose/size/${size}" class="chooser-card">
        <span class="chooser-card__title">Pack ${size}</span>
        <span class="chooser-card__sub">${size} produits au choix</span>
        <span class="chooser-card__price">${priceLabel}</span>
      </a>`;
  }).join('');

  const freePackCardHTML = freePackConfig && freePackConfig.eligibleProducts && freePackConfig.eligibleProducts.length >= freePackConfig.minItems
    ? `<a href="#compose/free" class="chooser-card chooser-card--gold">
        <span class="chooser-card__title">${freePackConfig.name}</span>
        <span class="chooser-card__sub">Composez 100% librement (min. ${freePackConfig.minItems} produits)</span>
        <span class="chooser-card__price">Pack sur-mesure</span>
      </a>`
    : '';

  grid.innerHTML = cardsHTML + freePackCardHTML || '<p class="admin-field-help">Aucune formule disponible pour le moment.</p>';
}

async function renderComposeType(container, size) {
  container.innerHTML = `
    <a href="#compose" class="collection-detail__back">← Changer de formule</a>
    <p class="section__eyebrow">Pack ${size}</p>
    <h2 class="section__title">Quel type de produit ?</h2>
    <div class="chooser-grid" id="composeTypeGrid"><p class="admin-field-help">Chargement...</p></div>`;

  const grid = document.getElementById('composeTypeGrid');
  const allPacks = await api('/packs');
  cachePacks(allPacks);
  const packsForSize = allPacks.filter((p) => p.size === size);

  grid.innerHTML = packsForSize.map((p) => `
    <a href="#compose/pack/${p.id}" class="chooser-card">
      <span class="chooser-card__title">${p.collection ? p.collection.name : p.name}</span>
      <span class="chooser-card__sub">${size} produits au choix</span>
      <span class="chooser-card__price">${p.price} MAD</span>
    </a>`).join('') || '<p class="admin-field-help">Aucun pack disponible pour cette taille.</p>';
}

async function renderComposePack(container, packId) {
  container.innerHTML = '<p class="admin-field-help">Chargement...</p>';
  const pack = await getPackById(packId);
  if (!pack) { container.innerHTML = '<p class="admin-field-help">Pack introuvable.</p>'; return; }
  cacheProducts(pack.eligibleProducts);
  Track.send('pack_selected', pack.name);
  let perfumeSelectionStarted = false;

  // Quantities per slug — a customer can pick the same perfume several times
  // (e.g. Atlas Noir ×2, Minuit Cuir ×1) as long as the total equals pack.size.
  // Stored at module scope (composeDraftState) keyed by packId so leaving this
  // pack (quick view, gender filter, going back and returning) never resets it.
  if (!composeDraftState.packs.has(packId)) composeDraftState.packs.set(packId, new Map());
  const quantities = composeDraftState.packs.get(packId);
  if (pendingPreselectSlug && quantities.size === 0 && pack.eligibleProducts.some((p) => p.slug === pendingPreselectSlug)) {
    quantities.set(pendingPreselectSlug, 1);
  }
  pendingPreselectSlug = null;
  const totalSelected = () => Array.from(quantities.values()).reduce((s, n) => s + n, 0);

  function cardsGridHTML() {
    return pack.eligibleProducts.map((p) => {
      const hasPhoto = Array.isArray(p.images) && !!p.images[0];
      return `
      <div class="fragrance-card fragrance-card--stepper js-fragrance-add" data-slug="${p.slug}" data-name="${p.name}" data-genders="${(p.genders || []).join(',')}" role="button" tabindex="0" aria-label="Ajouter ${p.name} au pack">
        <div class="fragrance-card__media${hasPhoto ? ' fragrance-card__media--photo' : ''}">
          ${p.isBestSeller ? '<span class="product-card__tag product-card__tag--gold">Best Seller</span>' : p.isLimitedEdition ? '<span class="product-card__tag">Édition limitée</span>' : ''}
          <span class="fragrance-card__qty-badge" hidden>0</span>
          <div class="product-card__bottle">${productMediaHTML(p)}</div>
        </div>
        <div class="fragrance-card__footer">
          <h3>${cardTitleHTML(p.name)}</h3>
          <p class="product-card__notes">${p.notes || ''}</p>
          <button type="button" class="fragrance-card__details js-quick-view" data-slug="${p.slug}">Voir les détails</button>
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML = `
    <div id="composePackProgress"></div>
    ${fragranceToolbarHTML('composePack')}
    <button type="button" class="compose-find-scent-banner js-find-scent-open">
      <span class="compose-find-scent-banner__icon">✦</span>
      <span class="compose-find-scent-banner__text"><strong>Indécis(e) ?</strong> Laissez Find Your Scent vous recommander un parfum — entièrement facultatif, vous pouvez aussi choisir vous-même ci-dessous.</span>
      <span class="compose-find-scent-banner__cta">FIND YOUR SCENT →</span>
    </button>
    <div class="chooser-grid compose-fragrance-grid" id="composePackGrid">${cardsGridHTML()}</div>
    <div class="compose-sticky-bar" id="composePackBar">
      <div class="pack-modal__recap" id="composePackRecap"><span class="pack-modal__recap-empty">Aucun parfum sélectionné</span></div>
      <button type="button" class="btn btn--gold" id="composePackCta" disabled>Choisissez vos parfums</button>
    </div>`;

  const progressEl = document.getElementById('composePackProgress');
  const grid = document.getElementById('composePackGrid');
  const recap = document.getElementById('composePackRecap');
  const cta = document.getElementById('composePackCta');
  const cards = Array.from(grid.querySelectorAll('.fragrance-card'));

  initFragranceToolbar({
    searchInput: document.getElementById('composePackSearch'),
    genderFilter: document.getElementById('composePackGenderFilter'),
    emptyMsg: document.getElementById('composePackEmptyMsg'),
    cards,
  });

  function updateUI() {
    const total = totalSelected();
    progressEl.innerHTML = composeProgressHTML(total, pack.size, 'parfum(s)');
    const isFull = total >= pack.size;
    cards.forEach((card) => {
      const slug = card.dataset.slug;
      const qty = quantities.get(slug) || 0;
      card.classList.toggle('is-selected', qty > 0);
      card.classList.toggle('is-full', isFull && qty === 0);
      const badge = card.querySelector('.fragrance-card__qty-badge');
      // The "+" tells visitors they can click the card again to pick more
      // than one unit of the same fragrance — hidden once the pack is full
      // since clicking again wouldn't add anything at that point.
      badge.textContent = qty > 0 && !isFull ? `${qty}+` : qty;
      badge.hidden = qty === 0;
    });
    recap.innerHTML = '';
    if (total === 0) {
      recap.innerHTML = '<span class="pack-modal__recap-empty">Aucun parfum sélectionné</span>';
    } else {
      recap.insertAdjacentHTML('beforeend', `<span class="compose-summary__name">${pack.name} · ${total}/${pack.size} · ${pack.price} MAD</span>`);
      cards.forEach((card) => {
        const slug = card.dataset.slug;
        const qty = quantities.get(slug) || 0;
        if (qty === 0) return;
        const product = pack.eligibleProducts.find((p) => p.slug === slug);
        const chip = document.createElement('span'); chip.className = 'pack-modal__chip';
        const thumb = document.createElement('span'); thumb.className = 'pack-modal__chip-thumb';
        thumb.innerHTML = product ? productMediaHTML(product) : productVisual('bottle', '#C9A227');
        const label = document.createElement('span'); label.textContent = qty > 1 ? `${card.dataset.name} ×${qty}` : card.dataset.name;
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => setQty(slug, 0));
        chip.appendChild(thumb); chip.appendChild(label); chip.appendChild(removeBtn); recap.appendChild(chip);
      });
    }
    cta.disabled = total !== pack.size;
    cta.textContent = cta.disabled ? 'Choisissez vos parfums' : `Commander — ${pack.price} MAD`;
  }

  // Once the pack is complete, move straight to the order form — no extra
  // "Commander" click needed. `autoAdvanceTriggered` guards against firing
  // twice, and resets if the customer removes a perfume so completing again
  // (including via Find Your Scent, which drives selection through the same
  // setQty path) still advances automatically.
  let autoAdvanceTriggered = false;

  function finalizePackSelection() {
    const slugs = [];
    const names = [];
    const images = [];
    cards.forEach((card) => {
      const slug = card.dataset.slug;
      const qty = quantities.get(slug) || 0;
      if (qty === 0) return;
      const product = pack.eligibleProducts.find((p) => p.slug === slug);
      const image = product && Array.isArray(product.images) ? product.images[0] : null;
      for (let i = 0; i < qty; i += 1) { slugs.push(slug); names.push(card.dataset.name); images.push(image); }
    });
    Track.send('perfumes_selected', pack.name);
    cards.forEach((card) => {
      if ((quantities.get(card.dataset.slug) || 0) > 0) Track.send('perfume_selected', card.dataset.name);
    });
    Cart.addPack(pack.id, pack.name, pack.price, slugs, names, images);
    composeDraftState.packs.delete(packId);
    Cart.openCheckout();
  }

  function setQty(slug, qty) {
    if (qty <= 0) quantities.delete(slug);
    else quantities.set(slug, qty);
    if (!perfumeSelectionStarted && quantities.size > 0) {
      perfumeSelectionStarted = true;
      Track.send('perfume_selection_started', pack.name);
    }
    updateUI();
    const complete = totalSelected() === pack.size;
    if (complete && !autoAdvanceTriggered) {
      autoAdvanceTriggered = true;
      // Brief pause so the customer visually sees their last pick register
      // (card highlight, recap update) before the order form slides in.
      setTimeout(finalizePackSelection, 450);
    } else if (!complete) {
      autoAdvanceTriggered = false;
    }
  }

  function changeQty(slug, delta) {
    const card = cards.find((c) => c.dataset.slug === slug);
    const current = quantities.get(slug) || 0;
    if (delta > 0 && totalSelected() >= pack.size) {
      card.classList.add('is-shaking');
      setTimeout(() => card.classList.remove('is-shaking'), 400);
      return false;
    }
    setQty(slug, Math.max(0, current + delta));
    return true;
  }

  // Briefly highlights a card so the customer clearly sees which fragrance
  // Find Your Scent just registered as one of their real pack choices.
  function highlightCard(slug) {
    const card = cards.find((c) => c.dataset.slug === slug);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-just-added');
    setTimeout(() => card.classList.remove('is-just-added'), 1400);
  }

  activePackComposer = { packId, pack, quantities, changeQty, highlightCard };

  // The whole card adds one unit — except "Voir les détails", which still
  // opens Quick View (handled by its own delegated listener elsewhere) and
  // must never also add to the selection.
  grid.addEventListener('click', (e) => {
    if (e.target.closest('.js-quick-view')) return;
    const card = e.target.closest('.js-fragrance-add');
    if (card) changeQty(card.dataset.slug, 1);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.js-quick-view')) return;
    const card = e.target.closest('.js-fragrance-add');
    if (card && e.target === card) { e.preventDefault(); changeQty(card.dataset.slug, 1); }
  });

  // Kept as a manual fallback — in the normal flow, finalizePackSelection
  // already runs automatically the instant the selection completes.
  cta.addEventListener('click', () => {
    if (cta.disabled) return;
    autoAdvanceTriggered = true;
    finalizePackSelection();
  });

  updateUI();
}

async function renderComposeFree(container) {
  container.innerHTML = '<p class="admin-field-help">Chargement...</p>';
  const config = await getFreePackConfig();
  if (!config) { container.innerHTML = '<p class="admin-field-help">Le Free Pack n\'est pas disponible pour le moment.</p>'; return; }
  cacheProducts(config.eligibleProducts);

  // Only one Free Pack config exists site-wide, so a fixed key is enough —
  // stored at module scope (composeDraftState) so leaving this page (quick
  // view, gender filter, going back and returning) never resets it.
  const draftKey = 'default';
  if (!composeDraftState.free.has(draftKey)) composeDraftState.free.set(draftKey, []);
  const selected = composeDraftState.free.get(draftKey); // {slug, name, price, collection}

  container.innerHTML = `
    <a href="#compose" class="collection-detail__back">← Changer de formule</a>
    <p class="section__eyebrow">${config.name}</p>
    <h2 class="section__title">Choisissez vos produits</h2>
    <p class="admin-field-help" id="composeFreePriceHint" style="margin-bottom:14px;">Chaque parfum coûte ${config.perfumePrice} MAD, chaque gel douche coûte ${config.gelDouchePrice} MAD — le prix s'additionne pour chaque produit choisi.</p>
    <div id="composeFreeProgress"></div>
    ${fragranceToolbarHTML('composeFree')}
    <div class="chooser-grid compose-fragrance-grid" id="composeFreeGrid">
      ${config.eligibleProducts.map((p) => {
        const hasPhoto = Array.isArray(p.images) && !!p.images[0];
        return `
        <div class="fragrance-card" data-slug="${p.slug}" data-name="${p.name}" data-price="${p.freePackPrice}" data-collection="${p.collectionId}" data-genders="${(p.genders || []).join(',')}" tabindex="0" role="button">
          <div class="fragrance-card__media${hasPhoto ? ' fragrance-card__media--photo' : ''}">
            <span class="fragrance-card__check"><svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <div class="product-card__bottle">${productMediaHTML(p)}</div>
          </div>
          <div class="fragrance-card__footer">
            <h3>${cardTitleHTML(p.name)}</h3>
            <p class="product-card__notes">${p.notes || ''}</p>
            <p class="product-card__price">${p.freePackPrice} MAD</p>
            <button type="button" class="fragrance-card__details js-quick-view" data-slug="${p.slug}">Voir les détails</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="compose-sticky-bar" id="composeFreeBar">
      <div class="pack-modal__recap" id="composeFreeRecap"><span class="pack-modal__recap-empty">Aucun produit sélectionné</span></div>
      <button type="button" class="btn btn--gold" id="composeFreeCta" disabled>Choisissez vos parfums</button>
    </div>`;

  const progressEl = document.getElementById('composeFreeProgress');
  const grid = document.getElementById('composeFreeGrid');
  const recap = document.getElementById('composeFreeRecap');
  const cta = document.getElementById('composeFreeCta');
  const priceHint = document.getElementById('composeFreePriceHint');
  const cards = Array.from(grid.querySelectorAll('.fragrance-card'));

  // Re-hydrate the DOM's is-selected state from any restored selections —
  // the cards themselves are freshly rendered HTML, so the class needs to
  // be re-applied even though the underlying `selected` array survived.
  const selectedSlugs = new Set(selected.map((s) => s.slug));
  cards.forEach((card) => card.classList.toggle('is-selected', selectedSlugs.has(card.dataset.slug)));

  initFragranceToolbar({
    searchInput: document.getElementById('composeFreeSearch'),
    genderFilter: document.getElementById('composeFreeGenderFilter'),
    emptyMsg: document.getElementById('composeFreeEmptyMsg'),
    cards,
  });

  function updateUI() {
    progressEl.innerHTML = composeProgressHTML(selected.length, config.minItems, 'produit(s)');
    if (!config.allowMixCategories && selected.length > 0) {
      const lockedCollection = selected[0].collection;
      cards.forEach((card) => {
        const isSelected = card.classList.contains('is-selected');
        card.classList.toggle('is-disabled', !isSelected && card.dataset.collection !== lockedCollection);
      });
    } else {
      cards.forEach((card) => card.classList.remove('is-disabled'));
    }
    recap.innerHTML = '';
    if (selected.length === 0) {
      recap.innerHTML = '<span class="pack-modal__recap-empty">Aucun produit sélectionné</span>';
    } else {
      selected.forEach((item) => {
        const chip = document.createElement('span'); chip.className = 'pack-modal__chip';
        const label = document.createElement('span'); label.textContent = item.name;
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => toggleCard(item.slug));
        chip.appendChild(label); chip.appendChild(removeBtn); recap.appendChild(chip);
      });
    }
    // Per-item pricing: each selected product already carries its own Free
    // Pack price (perfume vs gel douche) — the total is a plain sum, never a
    // flat price for the whole pack. Mirrors resolveItemsPricing (public.js).
    const price = selected.reduce((s, i) => s + i.price, 0);
    cta.disabled = selected.length < config.minItems;
    cta.textContent = cta.disabled ? 'Choisissez vos parfums' : `Commander — ${price.toFixed(2)} MAD`;
    if (priceHint && selected.length > 0) {
      priceHint.textContent = `${selected.length} produit(s) sélectionné(s) — total : ${price.toFixed(2)} MAD.`;
    }
  }

  function toggleCard(slug) {
    const card = cards.find((c) => c.dataset.slug === slug);
    if (!card) return;
    const isSelected = card.classList.contains('is-selected');
    if (isSelected) {
      card.classList.remove('is-selected');
      const idx = selected.findIndex((s) => s.slug === slug);
      if (idx > -1) selected.splice(idx, 1);
    } else {
      if (card.classList.contains('is-disabled')) return;
      card.classList.add('is-selected');
      selected.push({ slug, name: card.dataset.name, price: Number(card.dataset.price), collection: card.dataset.collection });
    }
    updateUI();
  }

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.js-quick-view')) return;
      toggleCard(card.dataset.slug);
    });
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault();
        toggleCard(card.dataset.slug);
      }
    });
  });

  cta.addEventListener('click', () => {
    if (cta.disabled) return;
    const price = selected.reduce((s, i) => s + i.price, 0);
    Cart.addFreePack(config.name, price, selected.map((s) => s.slug), selected.map((s) => s.name));
    composeDraftState.free.delete(draftKey);
    Cart.openCheckout();
  });

  updateUI();
}

// ===========================
// ORDER RECEIPT (phone-protected: order number + phone must match)
// ===========================
async function renderReceipt(container, orderNumber, phone) {
  if (!orderNumber || !phone) {
    container.innerHTML = `
      <p class="section__eyebrow">Reçu de commande</p>
      <h2 class="section__title">Retrouvez votre reçu</h2>
      <form class="admin-form" id="receiptGateForm" style="max-width:420px;">
        <div class="admin-field"><label>Numéro de commande</label><input name="orderNumber" required value="${orderNumber || ''}"></div>
        <div class="admin-field"><label>Téléphone utilisé lors de la commande</label><input name="phone" required></div>
        <button type="submit" class="btn btn--gold">Afficher le reçu</button>
      </form>`;
    document.getElementById('receiptGateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      window.location.hash = `#receipt/${encodeURIComponent(fd.get('orderNumber').trim())}/${encodeURIComponent(fd.get('phone').trim())}`;
    });
    return;
  }

  container.innerHTML = '<p class="admin-field-help">Chargement du reçu...</p>';
  let receipt;
  try {
    receipt = await api(`/orders/${encodeURIComponent(orderNumber)}/receipt?phone=${encodeURIComponent(phone)}`);
  } catch (e) {
    container.innerHTML = `<p class="admin-field-help">Reçu introuvable pour ces informations.</p><a href="#receipt" class="btn btn--outline">Réessayer</a>`;
    return;
  }

  container.innerHTML = `
    <div class="receipt-doc" id="receiptDoc">
      <div class="receipt-doc__header">
        <div class="logo">XXI<span>VEINTUNO</span> HOUSE</div>
        <p>Reçu de commande</p>
      </div>
      <div class="receipt-doc__meta">
        <p><strong>Commande</strong> ${receipt.orderNumber}</p>
        <p><strong>Date</strong> ${new Date(receipt.createdAt).toLocaleDateString('fr-FR')}</p>
        <p><strong>Statut</strong> ${receipt.status}</p>
      </div>
      <div class="receipt-doc__meta">
        <p><strong>${receipt.fullName}</strong></p>
        <p>${receipt.address}, ${receipt.city}</p>
        <p>${receipt.phone}</p>
      </div>
      <table class="receipt-doc__table">
        <thead><tr><th>Article</th><th>Détail</th><th>Qté</th><th>Prix</th></tr></thead>
        <tbody>
          ${receipt.items.map((it) => `
            <tr><td>${it.name}</td><td>${it.detail || ''}</td><td>${it.quantity}</td><td>${it.unitPrice * it.quantity} MAD</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="receipt-doc__totals">
        <p><span>Sous-total</span><span>${receipt.subtotal} MAD</span></p>
        ${receipt.discountAmount > 0 ? `<p><span>Réduction${receipt.promoCode ? ` (${receipt.promoCode})` : ''}</span><span>-${receipt.discountAmount} MAD</span></p>` : ''}
        ${receipt.deliveryFee > 0 ? `<p><span>Livraison</span><span>${receipt.deliveryFee} MAD</span></p>` : ''}
        ${receipt.pointsEarned > 0 ? `<p><span>Points fidélité gagnés</span><span>+${receipt.pointsEarned}</span></p>` : ''}
        ${receipt.pointsRedeemed > 0 ? `<p><span>Points fidélité utilisés</span><span>-${receipt.pointsRedeemed}</span></p>` : ''}
        <p class="receipt-doc__total"><span>Total</span><span>${receipt.total} MAD</span></p>
      </div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <button type="button" class="btn btn--gold" id="receiptPrintBtn">Imprimer / Télécharger (PDF)</button>
      <button type="button" class="btn btn--outline" id="receiptPngBtn">Télécharger le reçu (PNG)</button>
    </div>
    ${receipt.status === 'DELIVERED' ? receiptReviewInviteHTML(receipt) : ''}`;

  document.getElementById('receiptPrintBtn').addEventListener('click', () => window.print());
  document.getElementById('receiptPngBtn').addEventListener('click', () => downloadReceiptAsPNG(receipt));
}

// Invite the customer to leave a review right on their receipt once the
// order is delivered, instead of only surfacing the (already-gated) review
// form later on a product page — reuses the same eligibility rule server-side.
function receiptReviewInviteHTML(receipt) {
  const slugs = new Set();
  receipt.items.forEach((it) => {
    if (it.productSlug) slugs.add(it.productSlug);
    (it.componentSlugs || []).forEach((s) => slugs.add(s));
  });
  if (!slugs.size) return '';
  const firstSlug = Array.from(slugs)[0];
  return `
    <div class="receipt-review-invite">
      <h3>Votre avis compte pour nous</h3>
      <p>Votre commande a été livrée — dites-nous ce que vous en avez pensé.</p>
      <a href="#product/${firstSlug}" class="btn btn--gold">Laisser un avis</a>
    </div>`;
}

// Draws the receipt onto an offscreen canvas and downloads it as a PNG —
// a self-contained image a customer can save/share, independent of print/PDF.
async function downloadReceiptAsPNG(receipt) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }

  const width = 900;
  const padX = 60;
  const lineH = 30;
  const itemsH = receipt.items.length * (lineH * 2 + 10);
  const height = 620 + itemsH;

  const canvas = document.createElement('canvas');
  const scale = 2; // render at 2x for a crisp, high-resolution download
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y = 70;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0c0c0c';
  ctx.font = '600 30px "Cormorant Garamond", Georgia, serif';
  ctx.fillText('XXI VEINTUNO HOUSE', width / 2, y);
  y += 28;
  ctx.font = '400 11px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#8a8578';
  ctx.letterSpacing = '2px';
  ctx.fillText('REÇU DE COMMANDE', width / 2, y);
  ctx.letterSpacing = '0px';

  y += 24;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(width - padX, y); ctx.stroke();

  y += 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0c0c0c';
  ctx.font = '600 14px "Inter", Arial, sans-serif';
  ctx.fillText(`Commande ${receipt.orderNumber}`, padX, y);
  ctx.textAlign = 'right';
  ctx.font = '400 13px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText(new Date(receipt.createdAt).toLocaleDateString('fr-FR'), width - padX, y);

  y += 26;
  ctx.textAlign = 'left';
  ctx.font = '400 13px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText(`Statut : ${receipt.status}`, padX, y);

  y += 34;
  ctx.font = '600 14px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText(receipt.fullName, padX, y);
  y += 20;
  ctx.font = '400 13px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText(`${receipt.address}, ${receipt.city}`, padX, y);
  y += 20;
  ctx.fillText(receipt.phone, padX, y);

  y += 34;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(width - padX, y); ctx.stroke();

  y += 30;
  receipt.items.forEach((item) => {
    ctx.textAlign = 'left';
    ctx.font = '600 14px "Inter", Arial, sans-serif';
    ctx.fillStyle = '#0c0c0c';
    ctx.fillText(item.name, padX, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${(item.unitPrice * item.quantity).toFixed(2)} MAD`, width - padX, y);
    y += 20;
    ctx.textAlign = 'left';
    ctx.font = '400 12px "Inter", Arial, sans-serif';
    ctx.fillStyle = '#8a8578';
    const detail = (item.detail || (item.components || []).join(', ') || '').slice(0, 90);
    ctx.fillText(`${detail}${detail ? ' — ' : ''}Qté ${item.quantity}`, padX, y);
    y += lineH;
  });

  y += 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(width - padX, y); ctx.stroke();
  y += 30;

  const totalsLineWidth = 320;
  const totalsX = width - padX - totalsLineWidth;
  function totalsLine(label, value, bold) {
    ctx.textAlign = 'left';
    ctx.font = `${bold ? '600' : '400'} 13px "Inter", Arial, sans-serif`;
    ctx.fillStyle = bold ? '#0c0c0c' : '#555';
    ctx.fillText(label, totalsX, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, width - padX, y);
    y += 24;
  }
  totalsLine('Sous-total', `${receipt.subtotal} MAD`);
  if (receipt.discountAmount > 0) totalsLine(`Réduction${receipt.promoCode ? ` (${receipt.promoCode})` : ''}`, `-${receipt.discountAmount} MAD`);
  if (receipt.deliveryFee > 0) totalsLine('Livraison', `${receipt.deliveryFee} MAD`);
  if (receipt.pointsEarned > 0) totalsLine('Points fidélité gagnés', `+${receipt.pointsEarned}`);
  if (receipt.pointsRedeemed > 0) totalsLine('Points fidélité utilisés', `-${receipt.pointsRedeemed}`);
  y += 6;
  ctx.textAlign = 'left';
  ctx.font = '600 18px "Cormorant Garamond", Georgia, serif';
  ctx.fillStyle = '#0c0c0c';
  ctx.fillText('Total', totalsX, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${receipt.total} MAD`, width - padX, y);

  ctx.textAlign = 'center';
  ctx.font = '400 11px "Inter", Arial, sans-serif';
  ctx.fillStyle = '#8a8578';
  ctx.fillText('Merci pour votre confiance — VEINTUNO HOUSE', width / 2, height - 30);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recu-${receipt.orderNumber}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

// ===========================
// QUICK VIEW
// ===========================
function initQuickView() {
  const modal = document.getElementById('quickViewModal');
  const backdrop = document.getElementById('quickViewBackdrop');
  const closeBtn = document.getElementById('quickViewClose');
  const nameEl = document.getElementById('quickViewName');
  const body = document.getElementById('quickViewBody');
  if (!modal) return;

  function close() {
    modal.classList.remove('pack-modal--open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function open(slug, hidePackCta) {
    let product;
    try { product = await getProductBySlug(slug); } catch (e) { return; }
    trackPixelEvent('ViewContent', {
      content_ids: [product.slug], content_name: product.name, content_type: 'product',
      value: product.onSale ? product.displayPrice : product.price, currency: 'MAD',
    });
    nameEl.textContent = product.name;
    body.innerHTML = productDetailBodyHTML(product, true);
    // Opened from a Find Your Scent match: this is only a peek at the
    // fragrance while staying on the quiz results, not a real navigation
    // point — the "Choisir mon pack"/add-to-cart action doesn't belong
    // here, only the × to go back to the other matches. Every other Quick
    // View (from a product card, a fragrance card, etc.) keeps it.
    if (hidePackCta) {
      const ctaBlock = body.querySelector('.product-detail__pack-only, .product-detail__actions');
      if (ctaBlock) ctaBlock.hidden = true;
    }
    wireProductDetailActions(body, product);
    startFlashCountdown(body.querySelector('.js-flash-countdown'));

    modal.classList.add('pack-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-quick-view');
    if (!btn) return;
    e.preventDefault();
    open(btn.dataset.slug, btn.dataset.hidePackCta === '1');
  });

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('pack-modal--open')) close();
  });
}

// ===========================
// PRODUCT DETAIL (shared between the full page view and Quick View)
// ===========================
// Olfactory pyramid: prefers the structured {name, image} notes an admin has
// entered (Produits > Pyramide olfactive); falls back to splitting the plain
// notesTop/notesHeart/notesBase text (name only, elegant placeholder instead
// of a broken image) so products that predate this feature keep working.
function olfactoryPlaceholderSVG() {
  return '<svg viewBox="0 0 24 24" class="olfactory-note__placeholder" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.1" fill="none"/><path d="M8 13c1-3 3-5 4-7 1 2 3 4 4 7a4 4 0 1 1-8 0z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round"/></svg>';
}

function olfactoryPyramidHTML(p) {
  const sections = [
    { title: 'Notes de tête', data: p.notesTopData, legacy: p.notesTop },
    { title: 'Notes de cœur', data: p.notesHeartData, legacy: p.notesHeart },
    { title: 'Notes de fond', data: p.notesBaseData, legacy: p.notesBase },
  ];
  const blocks = sections.map((s) => {
    let notes = Array.isArray(s.data) ? s.data.filter((n) => n && n.name) : [];
    if (!notes.length && s.legacy) {
      notes = s.legacy.split(',').map((name) => ({ name: name.trim(), image: null })).filter((n) => n.name);
    }
    if (!notes.length) return '';
    return `
      <div class="olfactory-block">
        <p class="olfactory-block__title">${s.title}</p>
        <div class="olfactory-grid">
          ${notes.map((n) => `
            <div class="olfactory-note">
              <span class="olfactory-note__img">${n.image ? `<img src="${n.image}" alt="${n.name} — note olfactive" loading="lazy" decoding="async">` : olfactoryPlaceholderSVG()}</span>
              <span class="olfactory-note__name">${n.name}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).filter(Boolean);
  if (!blocks.length) return '';
  return `<div class="product-detail__notes olfactory-pyramid">${blocks.join('')}</div>`;
}

function productDetailBodyHTML(p, compact) {
  const col = p.collection ? p.collection.name : '';
  const isPerfume = p.collection && p.collection.slug === 'parfums';
  const notesHTML = olfactoryPyramidHTML(p);

  return `
    ${productGalleryHTML(p)}
    <div class="product-detail__info">
      ${!compact ? `<a href="#collection/${p.collection ? p.collection.slug : ''}" class="collection-detail__back">← Retour à la collection</a>` : ''}
      ${col ? `<p class="section__eyebrow">${col}</p>` : ''}
      <h1 style="${compact ? 'font-size:26px;' : ''}">${p.name}</h1>
      ${!compact ? `<div class="product-rating" data-rating-slug="${p.slug}"></div>` : ''}
      <div class="product-detail__meta-row">
        ${priceHTML(p, 'detail')}
        ${p.volume ? `<span class="product-detail__volume">${p.volume}</span>` : ''}
      </div>
      ${p.onSale && p.countdownEnd ? `<div class="flash-countdown js-flash-countdown" data-end="${p.countdownEnd}"></div>` : ''}
      <p class="product-detail__availability ${p.stock > 0 ? 'is-available' : 'is-unavailable'}">${p.stock > 0 ? 'En stock' : 'Rupture de stock'}</p>
      ${p.collection && p.collection.slug === 'gels-douche' ? '<p class="product-detail__delivery-note">Livraison : 30 MAD si le panier contient un seul gel douche (hors pack). Offerte dès 2 gels douche ou avec un pack.</p>' : ''}
      ${p.description ? `<p class="product-detail__description">${p.description}</p>` : ''}
      ${notesHTML}
      ${isPerfume ? `<p class="product-detail__disclaimer">${(siteSettingsCache && siteSettingsCache.perfumeDisclaimer) || 'Inspiré des plus grands parfums — non affilié aux marques citées.'}</p>` : ''}
      ${p.collection && p.collection.packOnly ? `
      <div class="product-detail__pack-only">
        <p>Disponible uniquement en pack.</p>
        <button type="button" class="btn btn--gold btn--full js-add-to-pack" data-slug="${p.slug}" data-collection-slug="${p.collection.slug}">Ajouter au panier</button>
      </div>` : `
      <div class="product-detail__actions">
        <div class="qty-selector">
          <button type="button" class="qty-minus" aria-label="Diminuer">−</button>
          <input type="number" class="qty-input" value="1" min="1">
          <button type="button" class="qty-plus" aria-label="Augmenter">+</button>
        </div>
        <button type="button" class="btn btn--gold js-detail-add" data-slug="${p.slug}" ${p.stock <= 0 ? 'disabled' : ''}>Ajouter au panier</button>
      </div>
      ${trustListHTML()}`}
      ${!compact ? productBenefitsHTML(p) + productAccordionsHTML(p) : ''}
      ${!compact ? `<div class="product-reviews" id="productReviews-${p.slug}"><p class="admin-field-help">Chargement des avis...</p></div>` : ''}
    </div>`;
}

function parseList(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch (e) { return []; }
}

function trustListHTML() {
  const items = parseList(siteSettingsCache && siteSettingsCache.trustSignals);
  if (!items.length) return '';
  return `<ul class="product-trust">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

// Written from the delivery rules the server actually applies (see computeGelDoucheDeliveryFee).
const GENERAL_DELIVERY_TEXT = 'Livraison partout au Maroc. Paiement à la livraison. Offerte sur les packs. Un seul gel douche commandé hors pack : 30 MAD.';

function productAccordionsHTML(p) {
  const sections = [];
  if (p.ingredients) sections.push(['Ingrédients', p.ingredients]);
  if (p.usage) sections.push(["Conseils d'utilisation", p.usage]);
  sections.push(['Livraison', p.deliveryInfo || GENERAL_DELIVERY_TEXT]);
  return `<div class="product-accordions">${sections.map(([title, body]) => `
    <details class="product-accordion">
      <summary>${title}</summary>
      <p>${body}</p>
    </details>`).join('')}</div>`;
}

function productBenefitsHTML(p) {
  const items = parseList(p.benefits);
  if (!items.length) return '';
  return `<div class="product-benefits">
    <p class="product-benefits__title">Pourquoi vous allez l'aimer</p>
    <ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>
  </div>`;
}

function productGalleryHTML(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  if (!images.length) return `<div class="product-detail__visual">${productVisual(p.shape, p.color)}</div>`;
  const thumbs = images.length > 1
    ? `<div class="product-gallery__thumbs">${images.map((src, i) => `
        <button type="button" class="product-gallery__thumb${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="Photo ${i + 1}">
          <img src="${src}" alt="" loading="lazy" decoding="async">
        </button>`).join('')}</div>`
    : '';
  return `
    <div class="product-detail__visual product-gallery" data-current="0" data-images="${JSON.stringify(images).replace(/"/g, '&quot;')}">
      <button type="button" class="product-gallery__main" aria-label="Agrandir la photo">
        <img src="${images[0]}" alt="${p.name}">
      </button>
      ${thumbs}
    </div>`;
}

function setGalleryIndex(gallery, index) {
  const images = JSON.parse(gallery.dataset.images);
  const next = Math.min(Math.max(index, 0), images.length - 1);
  gallery.dataset.current = next;
  gallery.querySelector('.product-gallery__main img').src = images[next];
  gallery.querySelectorAll('.product-gallery__thumb').forEach((t, i) => t.classList.toggle('is-active', i === next));
}

let gallerySwipeX = null;
let gallerySwipedAt = 0;
document.addEventListener('click', (e) => {
  const thumb = e.target.closest('.product-gallery__thumb');
  if (thumb) { setGalleryIndex(thumb.closest('.product-gallery'), Number(thumb.dataset.index)); return; }
  const main = e.target.closest('.product-gallery__main');
  if (!main || Date.now() - gallerySwipedAt < 400) return;
  const gallery = main.closest('.product-gallery');
  Lightbox.open(JSON.parse(gallery.dataset.images), Number(gallery.dataset.current) || 0);
});
document.addEventListener('touchstart', (e) => {
  gallerySwipeX = e.target.closest('.product-gallery') ? e.touches[0].clientX : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (gallerySwipeX === null) return;
  const gallery = e.target.closest('.product-gallery');
  const dx = e.changedTouches[0].clientX - gallerySwipeX;
  gallerySwipeX = null;
  if (!gallery || Math.abs(dx) < 40) return;
  gallerySwipedAt = Date.now();
  setGalleryIndex(gallery, Number(gallery.dataset.current || 0) + (dx < 0 ? 1 : -1));
});

// ===========================
// REVIEWS (customer-facing: display approved + submission form)
// ===========================
function starsHTML(rating) {
  return `<span class="review-stars">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

async function loadProductReviews(container, slug) {
  if (!container) return;
  let data;
  try { data = await api(`/products/${slug}/reviews`); } catch (e) { data = { reviews: [], avgRating: 0, count: 0, enabled: true }; }
  const ratingEl = document.querySelector(`[data-rating-slug="${slug}"]`);
  if (ratingEl && data.count > 0) {
    ratingEl.innerHTML = `${starsHTML(Math.round(data.avgRating))} <span>${Number(data.avgRating).toFixed(1)}/5 · ${data.count} avis clients</span>`;
  }

  if (data.enabled === false) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="product-reviews__header">
      <h3>Avis clients</h3>
      ${data.count > 0 ? `<p>${starsHTML(Math.round(data.avgRating))} <span>${data.avgRating.toFixed(1)}/5 — ${data.count} avis</span></p>` : '<p class="admin-field-help">Aucun avis pour le moment.</p>'}
    </div>
    <div class="product-reviews__list">
      ${data.reviews.map((r) => `
        <div class="review-item${r.featured ? ' review-item--featured' : ''}">
          ${starsHTML(r.rating)}
          <p class="review-customer">${r.customerName || 'Client VEINTUNO'} — ${new Date(r.date).toLocaleDateString('fr-FR')}</p>
          ${r.text ? `<p>${r.text}</p>` : ''}
        </div>`).join('')}
    </div>
    <details class="product-reviews__submit">
      <summary>Laisser un avis (commande livrée requise)</summary>
      <form class="admin-form review-form">
        <div class="admin-form__row">
          <div class="admin-field"><label>Numéro de commande</label><input name="orderNumber" required></div>
          <div class="admin-field"><label>Téléphone</label><input name="phone" required maxlength="10" inputmode="numeric" pattern="[0-9]{10}"></div>
        </div>
        <div class="admin-field">
          <label>Note</label>
          <select name="rating" required>
            <option value="5">★★★★★</option>
            <option value="4">★★★★☆</option>
            <option value="3">★★★☆☆</option>
            <option value="2">★★☆☆☆</option>
            <option value="1">★☆☆☆☆</option>
          </select>
        </div>
        <div class="admin-field"><label>Votre avis (optionnel)</label><textarea name="text" rows="3"></textarea></div>
        <div class="review-form__msg" hidden></div>
        <button type="submit" class="btn btn--gold">Envoyer mon avis</button>
      </form>
    </details>`;

  const form = container.querySelector('.review-form');
  const msg = container.querySelector('.review-form__msg');
  attachPhoneValidation(form.phone);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const phone = fd.get('phone').toString().trim();
    msg.hidden = true;
    if (!isValidPhone(phone)) {
      msg.textContent = PHONE_ERROR_MSG;
      msg.hidden = false;
      msg.className = 'review-form__msg review-form__msg--error';
      return;
    }
    try {
      const result = await api('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productSlug: slug,
          orderNumber: fd.get('orderNumber').toString().trim(),
          phone,
          rating: fd.get('rating'),
          text: fd.get('text').toString().trim() || undefined,
        }),
      });
      msg.textContent = result.message;
      msg.hidden = false;
      msg.className = 'review-form__msg review-form__msg--ok';
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.hidden = false;
      msg.className = 'review-form__msg review-form__msg--error';
    }
  });
}

// Renders a live "HH : MM : SS" countdown for a timed Flash Sale, and hides
// itself once the promotion's end date has passed.
function startFlashCountdown(el) {
  if (!el) return;
  const end = new Date(el.dataset.end).getTime();
  function tick() {
    const diff = end - Date.now();
    if (diff <= 0) { el.remove(); return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    el.innerHTML = `<span>${pad(h)}</span> : <span>${pad(m)}</span> : <span>${pad(s)}</span>`;
  }
  tick();
  const interval = setInterval(tick, 1000);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) { clearInterval(interval); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function wireProductDetailActions(scope, product) {
  const qtyInput = scope.querySelector('.qty-input');
  const minusBtn = scope.querySelector('.qty-minus');
  const plusBtn = scope.querySelector('.qty-plus');
  // A pack-only product's detail view has no qty selector — it only shows a
  // "Choisir mon pack" link, so there is nothing to wire here.
  if (!qtyInput || !minusBtn || !plusBtn) return;
  minusBtn.addEventListener('click', () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  plusBtn.addEventListener('click', () => {
    qtyInput.value = Number(qtyInput.value) + 1;
  });
  const addBtn = scope.querySelector('.js-detail-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      for (let i = 0; i < qty; i += 1) Cart.addProduct(product);
      showAddToCartToast();
    });
  }
}

// ===========================
// BUNDLE DETAIL PAGE — reuses the exact same .product-detail__* markup and
// styling as a normal product page (per spec: same information, same
// design), just with a "produits inclus" list instead of fragrance notes
// and no stock/volume/reviews (bundles don't carry that data).
// ===========================
function bundleDetailBodyHTML(b) {
  const included = b.items.map((it) => {
    const images = Array.isArray(it.product.images) ? it.product.images.filter(Boolean) : [];
    return { name: it.product.name, quantity: it.quantity, unitPrice: it.product.price, image: images[0] || null };
  });
  const individualValue = included.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const savings = individualValue - b.price;
  const bundleImages = b.image ? [b.image] : [];
  const includedHTML = included.map((it) => `
    <li class="bundle-included__item">
      <span class="bundle-included__thumb">${it.image ? `<img src="${it.image}" alt="" loading="lazy">` : ''}</span>
      <span class="bundle-included__name">${it.name}${it.quantity > 1 ? ` <em>× ${it.quantity}</em>` : ''}</span>
      <span class="bundle-included__price">${it.unitPrice * it.quantity} MAD</span>
    </li>`).join('');
  return `
    <div class="product-detail__visual product-gallery" data-current="0" data-images="${JSON.stringify(bundleImages).replace(/"/g, '&quot;')}">
      ${b.image
        ? `<button type="button" class="product-gallery__main" aria-label="Agrandir la photo"><img src="${b.image}" alt="${b.name}" loading="lazy"></button>`
        : productVisual('bottle', '#C9A227')}
    </div>
    <div class="product-detail__info">
      <a href="#collections" class="collection-detail__back">← Retour aux collections</a>
      <p class="section__eyebrow">Bundle</p>
      <h1>${b.name}</h1>
      <div class="product-detail__meta-row">
        <p class="product-detail__price">${b.price} MAD</p>
        ${savings > 0 ? `<span class="bundle-savings">Vous économisez ${savings} MAD</span>` : ''}
      </div>
      ${savings > 0 ? `<p class="bundle-value">Valeur des produits pris séparément : ${individualValue} MAD</p>` : ''}
      ${b.description ? `<p class="product-detail__description">${b.description}</p>` : ''}
      <div class="bundle-included">
        <p class="bundle-included__title">Ce que contient ce bundle</p>
        <ul>${includedHTML}</ul>
      </div>
      <div class="product-detail__actions">
        <div class="qty-selector">
          <button type="button" class="qty-minus" aria-label="Diminuer">−</button>
          <input type="number" class="qty-input" value="1" min="1">
          <button type="button" class="qty-plus" aria-label="Augmenter">+</button>
        </div>
        <button type="button" class="btn btn--gold js-bundle-detail-add">Ajouter au panier</button>
      </div>
      ${trustListHTML()}
    </div>`;
}

function wireBundleDetailActions(scope, bundle) {
  const qtyInput = scope.querySelector('.qty-input');
  const minusBtn = scope.querySelector('.qty-minus');
  const plusBtn = scope.querySelector('.qty-plus');
  if (!qtyInput || !minusBtn || !plusBtn) return;
  minusBtn.addEventListener('click', () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  plusBtn.addEventListener('click', () => {
    qtyInput.value = Number(qtyInput.value) + 1;
  });
  const addBtn = scope.querySelector('.js-bundle-detail-add');
  if (addBtn) {
    const detail = bundle.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      for (let i = 0; i < qty; i += 1) Cart.addBundle(bundle.id, bundle.name, bundle.price, detail);
      showAddToCartToast();
    });
  }
}

// ===========================
// SEARCH
// ===========================
function initSearch() {
  const toggle = document.getElementById('searchToggle');
  const overlay = document.getElementById('searchOverlay');
  const closeBtn = document.getElementById('searchClose');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if (!toggle || !overlay) return;

  function open() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    input.value = '';
    results.innerHTML = '';
  }

  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const data = await api(`/search?q=${encodeURIComponent(q)}`);
        cacheProducts(data.products);
        const productsHTML = data.products.map((p) => `
          <a href="#product/${p.slug}" class="search-result">
            <span class="search-result__thumb">${productMediaHTML(p)}</span>
            <span><strong>${p.name}</strong><br><span style="color:var(--gray, #8a8578);font-size:12px;">${p.notes || ''} — ${p.price} MAD</span></span>
          </a>`).join('');
        const collectionsHTML = data.collections.map((c) => `
          <a href="#collection/${c.slug}" class="search-result search-result--collection">
            <strong>${c.name}</strong><span style="color:var(--gray, #8a8578);font-size:12px;">Collection</span>
          </a>`).join('');
        results.innerHTML = productsHTML + collectionsHTML || '<p class="admin-field-help" style="padding:20px;">Aucun résultat.</p>';
        results.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
      } catch (e) { /* ignore */ }
    }, 250);
  });
}

// ===========================
// NAV: dynamic Collections dropdown + admin-managed menu items
// ===========================
async function initNavExtras() {
  const dropdown = document.getElementById('collectionsDropdown');
  const panel = document.getElementById('collectionsDropdownPanel');
  const menuMount = document.getElementById('navMenuItems');

  if (dropdown && panel) {
    try {
      // Hiding a collection from the navbar (showInNav=false) must never hide
      // it from the site — it stays fully reachable via /collections.
      const collections = await api('/collections?nav=true');
      const cardsHTML = collections.map((c) => `
        <a href="#collection/${c.slug}" class="nav-megamenu__item">
          <span class="nav-megamenu__img" style="${c.image ? `background-image:url('${c.image}')` : ''}"></span>
          <span class="nav-megamenu__body">
            <span class="nav-megamenu__name">${c.name}</span>
            ${c.description ? `<span class="nav-megamenu__desc">${c.description}</span>` : ''}
          </span>
        </a>`).join('');
      panel.innerHTML = `<div class="nav-megamenu">${cardsHTML}</div>`;
    } catch (e) { /* ignore */ }

    const trigger = dropdown.querySelector('.nav-dropdown__trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) dropdown.classList.remove('is-open');
    });
  }

  if (menuMount) {
    try {
      const items = await api('/nav-menu');
      menuMount.innerHTML = items.map((i) => `<a href="${i.href}">${i.label}</a>`).join('');
    } catch (e) { /* ignore */ }
  }
}

// ===========================
// SITE SETTINGS (WhatsApp / Instagram / perfume disclaimer)
// ===========================
let siteSettingsCache = null;
async function getSiteSettings() {
  if (siteSettingsCache) return siteSettingsCache;
  try {
    siteSettingsCache = await api('/settings');
    return siteSettingsCache;
  } catch (e) { return null; }
}

async function initAnnouncementBar() {
  const bar = document.getElementById('announcementBar');
  if (!bar) return;
  const settings = await getSiteSettings();
  if (!settings) return;

  let extra = [];
  try { extra = JSON.parse(settings.announcementMessages || '[]'); } catch (e) { extra = []; }
  const messages = [settings.announcementText, ...extra].filter(Boolean);
  if (!messages.length) return;

  const icon = '<svg class="topbar__icon" viewBox="0 0 24 24" width="14" height="14"><path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><circle cx="7" cy="18" r="1.6" fill="currentColor"/><circle cx="17" cy="18" r="1.6" fill="currentColor"/></svg>';
  // Same seamless-marquee trick as the original static markup: the whole
  // message sequence rendered twice (second copy aria-hidden) so a -50%
  // slide loops invisibly, now just driven by however many messages the
  // admin configured instead of a hardcoded single one.
  const itemHTML = (hidden) => messages.map((text) => `
    <div class="topbar__item"${hidden ? ' aria-hidden="true"' : ''}>
      ${icon}
      <span class="topbar__text">${escapeHtmlText(text)}</span>
      <a href="#collections" class="topbar__cta"${hidden ? ' tabindex="-1"' : ''}>Achetez maintenant →</a>
    </div>`).join('');

  const track = bar.querySelector('.topbar__track');
  if (track) track.innerHTML = itemHTML(false) + itemHTML(true);
}

// Floating WhatsApp button — visible on both desktop and mobile once a
// WhatsApp number/link is configured in the admin dashboard (Réglages >
// Contact, the existing whatsappNumber field). Stays hidden otherwise —
// never a hardcoded number, never an invalid link.
async function initWhatsappFloat() {
  const btn = document.getElementById('whatsappFloat');
  if (!btn) return;
  const settings = await getSiteSettings();
  const href = settings && whatsappHref(settings.whatsappNumber);
  if (!href) return;
  btn.href = href;
  btn.hidden = false;
}

// ===========================
// SUPPORT CHAT — rules-based FAQ browser beside the WhatsApp button.
// No AI/generation: it only ever shows admin-entered FAQ answers (reusing
// the same Faq data as renderFaqSection), with a WhatsApp fallback for
// anything not covered. One fetch on boot, cached — no polling.
// ===========================
async function initSupportChat() {
  const floatBtn = document.getElementById('supportChatFloat');
  const panel = document.getElementById('supportChatPanel');
  const body = document.getElementById('supportChatBody');
  const closeBtn = document.getElementById('supportChatClose');
  if (!floatBtn || !panel || !body) return;

  let faqs = [];
  try { faqs = await api('/faq'); } catch (e) { return; }
  if (!Array.isArray(faqs) || faqs.length === 0) return;

  const settings = await getSiteSettings();
  const waHref = settings && whatsappHref(settings.whatsappNumber);
  const waFooterHTML = waHref
    ? `<a href="${waHref}" target="_blank" rel="noopener" class="support-chat-panel__wa">Pas trouvé votre réponse ? Discuter sur WhatsApp →</a>`
    : '';

  function listHTML() {
    const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];
    const grouped = categories.length > 1;
    const faqBtn = (f) => `<button type="button" class="support-chat-item" data-id="${f.id}">${escapeHtmlText(f.question)}</button>`;
    const listBody = grouped
      ? categories.map((cat) => `
          <p class="support-chat-category">${escapeHtmlText(cat)}</p>
          ${faqs.filter((f) => f.category === cat).map(faqBtn).join('')}`).join('')
        + faqs.filter((f) => !f.category).map(faqBtn).join('')
      : faqs.map(faqBtn).join('');
    return `
      <p class="support-chat-intro">Bonjour ! Choisissez une question ci-dessous :</p>
      <div class="support-chat-list">${listBody}</div>
      ${waFooterHTML}`;
  }

  function answerHTML(faq) {
    return `
      <button type="button" class="support-chat-back" id="supportChatBack">← Autres questions</button>
      <div class="support-chat-qa">
        <p class="support-chat-qa__q">${escapeHtmlText(faq.question)}</p>
        <p class="support-chat-qa__a">${escapeHtmlText(faq.answer)}</p>
      </div>
      ${waFooterHTML}`;
  }

  function showList() {
    body.innerHTML = listHTML();
    body.querySelectorAll('.support-chat-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const faq = faqs.find((f) => f.id === btn.dataset.id);
        if (faq) showAnswer(faq);
      });
    });
  }

  function showAnswer(faq) {
    body.innerHTML = answerHTML(faq);
    document.getElementById('supportChatBack').addEventListener('click', showList);
  }

  function togglePanel(open) {
    panel.hidden = !open;
    floatBtn.setAttribute('aria-expanded', String(open));
    if (open) showList();
  }

  floatBtn.addEventListener('click', () => togglePanel(panel.hidden));
  closeBtn.addEventListener('click', () => togglePanel(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) togglePanel(false);
  });
  document.addEventListener('click', (e) => {
    // composedPath() is captured at dispatch time, so it still reflects
    // where the click happened even if the handler for that click (e.g.
    // showAnswer) has already replaced body.innerHTML by the time this
    // document-level listener runs — checking e.target here would see a
    // detached node and wrongly treat the click as "outside".
    const path = e.composedPath();
    if (!panel.hidden && !path.includes(panel) && !path.includes(floatBtn)) {
      togglePanel(false);
    }
  });
  floatBtn.hidden = false;
}

// ===========================
// META PIXEL — only loaded when an admin configures a Pixel ID
// (SiteSettings.metaPixelId); silently disabled otherwise.
// ===========================
async function initMetaPixel() {
  const settings = await getSiteSettings();
  const pixelId = settings && settings.metaPixelId;
  if (!pixelId) return;
  if (window.fbq) return; // already loaded (e.g. hot route re-entry)

  /* eslint-disable */
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

// Fire-and-forget: no-op if the Pixel was never loaded (no Pixel ID configured).
function trackPixelEvent(eventName, params, eventId) {
  if (typeof window.fbq !== 'function') return;
  if (eventId) window.fbq('track', eventName, params || {}, { eventID: eventId });
  else window.fbq('track', eventName, params || {});
}

function metaBrowserContext() {
  const cookie = (name) => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : undefined;
  };
  return {
    fbp: cookie('_fbp'),
    fbc: cookie('_fbc'),
    userAgent: navigator.userAgent,
    sourceUrl: location.href,
  };
}

function whatsappHref(numberOrLink) {
  if (!numberOrLink) return null;
  if (numberOrLink.startsWith('http')) return numberOrLink;
  const digits = numberOrLink.replace(/[^0-9+]/g, '');
  return `https://wa.me/${digits.replace(/^\+/, '')}`;
}

// ===========================
// CONTACT PAGE
// ===========================
async function initContactPage() {
  const grid = document.getElementById('contactGrid');
  const footerInstagram = document.getElementById('footerInstagram');
  const footerWhatsapp = document.getElementById('footerWhatsapp');
  if (!grid) return;

  const settings = await getSiteSettings();
  if (!settings) { grid.innerHTML = '<p class="admin-field-help">Informations de contact à venir.</p>'; return; }

  const waHref = whatsappHref(settings.whatsappNumber);
  const cards = [];

  if (waHref) {
    cards.push(`
      <a href="${waHref}" target="_blank" rel="noopener" class="contact-card contact-card--whatsapp">
        <div class="contact-card__icon"><svg viewBox="0 0 24 24"><path d="M20.5 3.5A11 11 0 0 0 3.7 17.4L2 22l4.8-1.6A11 11 0 1 0 20.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 8.7c-.3.6-.5 1.4-.3 2.4.4 2 2.6 4.4 4.7 4.9 1 .2 1.8 0 2.4-.3.5-.2 1-.7 1.1-1.2l.1-.6-2-1c-.2-.1-.4-.1-.5.1l-.5.7c-.1.2-.3.2-.5.1-.7-.3-1.9-1.2-2.5-2.4-.1-.2 0-.4.1-.5l.6-.6c.1-.1.1-.3.1-.5l-.9-2c0-.1-.2-.2-.4-.2h-.7c-.2 0-.5.1-.7.1Z" fill="currentColor"/></svg></div>
        <h3>WhatsApp</h3>
        <p>Contactez-nous directement pour toute question, commande ou échange de points fidélité.</p>
        <span class="contact-card__cta">Ouvrir WhatsApp →</span>
      </a>`);
    footerWhatsapp.href = waHref; footerWhatsapp.hidden = false;
  }

  if (settings.instagramLink || settings.instagramQrImage) {
    cards.push(`
      <div class="contact-card contact-card--instagram">
        <div class="contact-card__icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/></svg></div>
        <h3>Instagram</h3>
        <p>Suivez-nous pour les nouveautés, les coulisses et les offres exclusives.</p>
        ${settings.instagramQrImage ? `
        <div class="contact-card__qr-wrap">
          <p class="contact-card__qr-label">Scannez pour nous suivre</p>
          <img class="contact-card__qr" src="${settings.instagramQrImage}" alt="QR Code Instagram">
        </div>` : ''}
        ${settings.instagramLink ? `<a href="${settings.instagramLink}" target="_blank" rel="noopener" class="contact-card__cta">Voir le profil →</a>` : ''}
      </div>`);
    if (settings.instagramLink) { footerInstagram.href = settings.instagramLink; footerInstagram.hidden = false; }
  }

  grid.innerHTML = cards.join('') || '<p class="admin-field-help">Informations de contact à venir.</p>';
}

// ===========================
// LOYALTY PAGE
// ===========================
async function initLoyaltyPage() {
  const howEl = document.getElementById('loyaltyHowItWorks');
  const form = document.getElementById('loyaltyForm');
  const errorEl = document.getElementById('loyaltyError');
  const submitBtn = document.getElementById('loyaltySubmitBtn');
  const resultEl = document.getElementById('loyaltyResult');
  if (!form) return;

  if (form.phone) attachPhoneValidation(form.phone);

  // "How it works" blurb — an admin-entered explanation (Dashboard >
  // Fidélité) always wins; the original generic wording is only a fallback
  // for as long as nothing's been entered, so nothing ever goes blank.
  if (howEl) {
    howEl.innerHTML = `
      <p><strong>Comment gagner des points ?</strong> Chaque commande livrée vous rapporte des points, proportionnellement au montant dépensé.</p>
      <p><strong>Comment les utiliser ?</strong> Contactez-nous sur WhatsApp avec votre solde pour échanger vos points contre une récompense.</p>`;
    try {
      const info = await api('/loyalty-info');
      if (info && info.pointsExplanation) {
        howEl.innerHTML = info.pointsExplanation.split('\n').filter((line) => line.trim()).map((line) => `<p>${line}</p>`).join('');
      }
    } catch (e) { /* keep the default wording above */ }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    resultEl.hidden = true;
    const fd = new FormData(form);
    const fullName = fd.get('fullName').toString().trim();
    const phone = fd.get('phone').toString().trim();

    if (!isValidPhone(phone)) {
      errorEl.textContent = PHONE_ERROR_MSG;
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Vérification...';
    try {
      const data = await api('/loyalty/lookup', { method: 'POST', body: JSON.stringify({ fullName, phone }) });
      resultEl.hidden = false;

      const hasCelebration = data.availableRewards && data.availableRewards.length > 0;
      const progressPct = data.nextReward ? Math.min(100, (data.balance / data.nextReward.pointsRequired) * 100) : 100;

      const progressHTML = data.nextReward ? `
        <div class="loyalty-progress">
          <div class="loyalty-progress__labels"><span>0</span><span>${data.nextReward.pointsRequired} points</span></div>
          <div class="loyalty-progress__bar"><div class="loyalty-progress__fill" id="loyaltyProgressFill" data-target="${progressPct}"></div></div>
          <p class="loyalty-result__next">Encore ${(data.nextReward.pointsRequired - data.balance).toFixed(2)} point(s) pour débloquer : ${data.nextReward.name}</p>
        </div>` : '';

      const celebrationHTML = hasCelebration ? `
        <div class="loyalty-celebration">
          <div class="loyalty-celebration__emoji">🎉</div>
          <h3>FÉLICITATIONS</h3>
          <p>Vous avez atteint votre récompense !</p>
          ${data.availableRewards.length > 1 ? `<div class="admin-field" style="max-width:320px;margin:0 auto 16px;"><select id="claimRewardSelect">${data.availableRewards.map((r) => `<option value="${r.id}">${r.name} (${r.pointsRequired} pts)</option>`).join('')}</select></div>` : `<input type="hidden" id="claimRewardSelect" value="${data.availableRewards[0].id}">`}
          <button type="button" class="btn btn--gold" id="claimPointsBtn">Réclamer mes points</button>
          <p id="claimPointsMsg" style="margin-top:12px;color:#e4dfd2;font-size:13px;" hidden></p>
        </div>` : '';

      resultEl.innerHTML = `
        <div class="loyalty-digital-card">
          <div class="loyalty-digital-card__top">
            <span class="loyalty-digital-card__brand">VEINTUNO HOUSE</span>
            <span class="loyalty-digital-card__chip" aria-hidden="true"></span>
          </div>
          <div class="loyalty-result__balance">
            <p class="section__eyebrow">Bonjour ${escapeHtmlText(data.fullName.split(' ')[0])}</p>
            <p class="loyalty-result__points">${data.balance} <span>points</span></p>
          </div>
          ${progressHTML}
          <p class="loyalty-digital-card__member">Membre fidélité</p>
        </div>
        ${celebrationHTML}
        ${!hasCelebration ? `
        <div class="loyalty-result__rewards">
          <h4>Récompenses à venir</h4>
          <ul>${data.nextReward ? `<li>${data.nextReward.name} — ${data.nextReward.pointsRequired} pts</li>` : '<li>Toutes les récompenses configurées sont déjà débloquées.</li>'}</ul>
        </div>` : ''}
        <div class="loyalty-result__history">
          <h4>Historique</h4>
          <ul>${data.history.slice(0, 8).map((h) => `<li><span>${new Date(h.date).toLocaleDateString('fr-FR')}</span><span>${h.points > 0 ? '+' : ''}${h.points} pts${h.note ? ` — ${h.note}` : ''}</span></li>`).join('') || '<li>Aucun mouvement pour le moment.</li>'}</ul>
        </div>`;

      // Animate the progress bar fill from 0 on the next frame, not instantly,
      // so the customer actually sees the "filling up" motion.
      const fillEl = document.getElementById('loyaltyProgressFill');
      if (fillEl) {
        requestAnimationFrame(() => { fillEl.style.width = `${fillEl.dataset.target}%`; });
      }

      const claimBtn = document.getElementById('claimPointsBtn');
      if (claimBtn) {
        const claimMsg = document.getElementById('claimPointsMsg');
        claimBtn.addEventListener('click', async () => {
          claimBtn.disabled = true;
          try {
            const rewardSelect = document.getElementById('claimRewardSelect');
            const result = await api('/loyalty/redeem-request', {
              method: 'POST',
              body: JSON.stringify({ fullName, phone, rewardId: rewardSelect ? rewardSelect.value : undefined }),
            });
            claimMsg.textContent = result.message;
            claimMsg.hidden = false;
            claimBtn.hidden = true;
          } catch (err) {
            claimMsg.textContent = err.message;
            claimMsg.hidden = false;
            claimBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Consulter mes points';
    }
  });
}

// ===========================
// Scroll-reveal (respects prefers-reduced-motion)
// ===========================
function initRevealAnimations() {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = document.querySelectorAll('#homepageSections > section, .products__grid .product-card, .client-reviews__grid .client-review-card');
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  targets.forEach((el) => { el.classList.add('reveal'); observer.observe(el); });
}

// ===========================
// ROUTER — Home / Collections / Collection detail
// ===========================
(() => {
  const viewHome = document.getElementById('view-home');
  const viewCollections = document.getElementById('view-collections');
  const viewDetail = document.getElementById('view-collection-detail');
  const viewProduct = document.getElementById('view-product-detail');
  const viewBundle = document.getElementById('view-bundle-detail');
  const collectionsGrid = document.getElementById('collectionsGrid');
  const detailTitle = document.getElementById('collectionDetailTitle');
  const detailEyebrow = document.getElementById('collectionDetailEyebrow');
  const detailGrid = document.getElementById('collectionDetailGrid');
  const detailPacks = document.getElementById('collectionDetailPacks');
  const genderFilter = document.getElementById('genderFilter');
  const findScentCta = document.getElementById('findScentCta');
  const packOnlyNotice = document.getElementById('packOnlyNotice');

  if (!viewHome || !viewCollections || !viewDetail) return;

  let currentCollectionProducts = [];
  // Bundles assigned to the current collection (from the admin dashboard) —
  // rendered inline in the same grid as products, not a separate section.
  // They aren't gender-tagged, so they only show under "Tous", not under a
  // specific Homme/Femme/Unisexe filter.
  let currentCollectionBundles = [];

  function applyGenderFilter(gender) {
    let filtered = gender
      ? currentCollectionProducts.filter((p) => Array.isArray(p.genders) && p.genders.includes(gender))
      : currentCollectionProducts;
    // Parfums also has its own search box (shown alongside the gender
    // chips, not instead of them) — combine both instead of one replacing
    // the other.
    const q = stripAccents((collectionDetailSearch ? collectionDetailSearch.value : '').trim().toLowerCase());
    if (q) filtered = filtered.filter((p) => matchesByWordPrefix(stripAccents(p.name.toLowerCase()), q));
    const bundlesHTML = gender ? '' : currentCollectionBundles.map(bundleCardHTML).join('');
    detailGrid.innerHTML = filtered.map(productCardHTML).join('') + bundlesHTML;
    if (collectionDetailEmptyMsg) collectionDetailEmptyMsg.hidden = filtered.length > 0;
    initRevealAnimations();
  }

  genderFilter.addEventListener('click', (e) => {
    const chip = e.target.closest('.gender-filter__chip');
    if (!chip) return;
    genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    applyGenderFilter(chip.dataset.gender);
  });

  // Non-perfume collection detail pages (Gels Douche, Supplements,
  // Cosmetics...) get a product-name search plus a "Bundles" filter chip,
  // mirroring the same toolbar already used on the /collections page.
  const collectionDetailToolbar = document.getElementById('collectionDetailToolbar');
  const collectionDetailSearchBox = document.getElementById('collectionDetailSearchBox');
  const collectionDetailSearch = document.getElementById('collectionDetailSearch');
  const collectionDetailCategoryFilter = document.getElementById('collectionDetailCategoryFilter');
  const collectionDetailEmptyMsg = document.getElementById('collectionDetailEmptyMsg');
  let collectionDetailCategory = '';
  // Parfums reuses this same search box alongside its own Homme/Femme/
  // Unisexe chips (gender-based filtering); every other collection uses it
  // alongside the admin-defined "Options du filtre" chips instead — the
  // search input itself is shared, so this just says which apply-function
  // it should drive.
  let collectionDetailMode = 'category';

  function applyCollectionDetailFilter() {
    const q = stripAccents((collectionDetailSearch ? collectionDetailSearch.value : '').trim().toLowerCase());
    let products = currentCollectionProducts;
    let bundles = currentCollectionBundles;
    if (collectionDetailCategory === 'bundles') {
      products = [];
    } else if (collectionDetailCategory) {
      // A custom, admin-defined filter option (Collection > Options du filtre) —
      // products opt in via their own "Filtre de la collection" checkboxes.
      products = products.filter((p) => Array.isArray(p.filterOptionIds) && p.filterOptionIds.includes(collectionDetailCategory));
      bundles = [];
    }
    if (q) {
      products = products.filter((p) => matchesByWordPrefix(stripAccents(p.name.toLowerCase()), q));
      bundles = bundles.filter((b) => matchesByWordPrefix(stripAccents(b.name.toLowerCase()), q));
    }
    const sortEl = document.getElementById('collectionDetailSort');
    const sortBy = sortEl && collectionDetailMode === 'category' ? sortEl.value : '';
    const effectivePrice = (p) => (p.onSale ? p.displayPrice : p.price);
    if (sortBy === 'price-asc') products = [...products].sort((a, b) => effectivePrice(a) - effectivePrice(b));
    if (sortBy === 'price-desc') products = [...products].sort((a, b) => effectivePrice(b) - effectivePrice(a));
    if (sortBy === 'name-asc') products = [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (sortBy === 'price-asc') bundles = [...bundles].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') bundles = [...bundles].sort((a, b) => b.price - a.price);
    if (sortBy === 'name-asc') bundles = [...bundles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    detailGrid.innerHTML = products.map(productCardHTML).join('') + bundles.map(bundleCardHTML).join('');
    if (collectionDetailEmptyMsg) collectionDetailEmptyMsg.hidden = (products.length + bundles.length) > 0;
    initRevealAnimations();
  }

  const collectionDetailSortEl = document.getElementById('collectionDetailSort');
  if (collectionDetailSortEl) collectionDetailSortEl.addEventListener('change', applyCollectionDetailFilter);

  if (collectionDetailSearch) {
    collectionDetailSearch.addEventListener('input', () => {
      if (collectionDetailMode === 'gender') {
        const activeChip = genderFilter.querySelector('.gender-filter__chip.is-active');
        applyGenderFilter(activeChip ? activeChip.dataset.gender : '');
      } else {
        applyCollectionDetailFilter();
      }
    });
  }
  if (collectionDetailCategoryFilter) {
    collectionDetailCategoryFilter.addEventListener('click', (e) => {
      const chip = e.target.closest('.gender-filter__chip');
      if (!chip) return;
      collectionDetailCategoryFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      collectionDetailCategory = chip.dataset.category;
      applyCollectionDetailFilter();
    });
  }

  // Collections page — category filter (Tous + one chip per real collection,
  // plus a "Bundles" chip) and a live name search. Both act on data already
  // fetched for the page, so switching chips/typing never re-hits the API.
  const collectionsSearch = document.getElementById('collectionsSearch');
  const collectionsCategoryFilter = document.getElementById('collectionsCategoryFilter');
  const collectionsEmptyMsg = document.getElementById('collectionsEmptyMsg');
  let allCollectionsData = [];
  let allBundlesData = [];
  let collectionsCategory = '';

  function bundleTileHTML(b) {
    const style = b.image ? ` style="--tile-image:url('${b.image}')"` : '';
    return `
      <a href="#bundle/${b.slug}" class="collection-tile has-image"${style}>
        <span class="collection-tile__label">${b.name}</span>
        <span class="collection-tile__sub">${b.price} MAD</span>
      </a>`;
  }

  function applyCollectionsFilter() {
    if (!collectionsGrid) return;
    const q = stripAccents((collectionsSearch ? collectionsSearch.value : '').trim().toLowerCase());
    let list;
    let tileFn;
    if (collectionsCategory === 'bundles') {
      list = allBundlesData;
      tileFn = bundleTileHTML;
    } else if (collectionsCategory) {
      list = allCollectionsData.filter((c) => c.slug === collectionsCategory);
      tileFn = collectionTileHTML;
    } else {
      list = allCollectionsData;
      tileFn = collectionTileHTML;
    }
    const filtered = q ? list.filter((item) => matchesByWordPrefix(stripAccents(item.name.toLowerCase()), q)) : list;
    collectionsGrid.innerHTML = filtered.map(tileFn).join('');
    if (collectionsEmptyMsg) collectionsEmptyMsg.hidden = filtered.length > 0;
  }

  if (collectionsSearch) {
    collectionsSearch.addEventListener('input', applyCollectionsFilter);
  }
  if (collectionsCategoryFilter) {
    collectionsCategoryFilter.addEventListener('click', (e) => {
      const chip = e.target.closest('.gender-filter__chip');
      if (!chip) return;
      collectionsCategoryFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      collectionsCategory = chip.dataset.category;
      applyCollectionsFilter();
    });
  }

  let collectionsLoaded = false;
  async function renderCollectionsGrid() {
    if (collectionsLoaded) return;
    const [collections, bundles] = await Promise.all([
      api('/collections'),
      api('/bundles').catch(() => []),
    ]);
    allCollectionsData = collections;
    allBundlesData = bundles;
    if (collectionsCategoryFilter) {
      collectionsCategoryFilter.innerHTML = `
        <div class="gender-filter__chip is-active" data-category="">Tous</div>
        ${collections.map((c) => `<div class="gender-filter__chip" data-category="${c.slug}">${c.name}</div>`).join('')}
        ${bundles.length ? '<div class="gender-filter__chip" data-category="bundles">Bundles</div>' : ''}`;
    }
    applyCollectionsFilter();
    collectionsLoaded = true;
  }

  async function renderCollectionDetail(slug) {
    detailGrid.innerHTML = '';
    detailPacks.hidden = true;
    detailPacks.innerHTML = '';

    let data;
    try {
      data = await api(`/collections/${slug}`);
    } catch (e) {
      detailTitle.textContent = 'Collection introuvable';
      detailEyebrow.textContent = '';
      return;
    }

    detailTitle.textContent = data.collection.name;
    detailEyebrow.textContent = data.collection.description || '';
    cacheProducts(data.products);
    cachePacks(data.packs);

    // The rich photo banner added an extra "scroll past the image" step
    // before reaching the packs — removed so packs/products show immediately
    // under the simple title. (Kept as a function or re-enabling.)

    const packOnly = !!data.collection.packOnly;

    if (data.packs && data.packs.length) {
      const featuredIndex = data.packs.length === 3 ? 1 : -1;
      const ctaText = packOnly ? 'Choisir ce pack' : 'Découvrir';
      detailPacks.innerHTML = `
        <p class="section__eyebrow">${packOnly ? 'Sélection exclusive' : 'Nos packs'}</p>
        <div class="packs-heading-row">
          <h3 class="section__title" style="font-size:26px;">${packOnly ? 'Choose Your Pack' : 'Sélection Exclusive'}</h3>
          <a href="#collections" class="packs-heading-row__all">Voir tout <span>→</span></a>
        </div>
        <div class="packs__grid">
          ${data.packs.map((pack, i) => packCardHTML(pack, i, featuredIndex, ctaText)).join('')}
        </div>`;
      detailPacks.hidden = false;
    }

    currentCollectionProducts = data.products;
    currentCollectionBundles = data.bundles || [];
    if (packOnly || slug === 'parfums') {
      // Perfumes in a pack-only collection can never be bought individually
      // (each card below still shows "En pack uniquement", never an add-to-
      // cart button — productCardHTML already handles that), but the
      // customer can still browse AND search them without picking a pack
      // first: the notice + pack CTAs above stay exactly as they were, the
      // gender chips and the search box are both shown side by side, and
      // typing narrows down whichever gender is currently selected.
      collectionDetailMode = 'gender';
      if (findScentCta) findScentCta.hidden = !packOnly;
      if (packOnlyNotice) packOnlyNotice.hidden = !packOnly;
      if (collectionDetailSearch) collectionDetailSearch.value = '';
      if (collectionDetailSearchBox) collectionDetailSearchBox.hidden = false;
      if (collectionDetailCategoryFilter) collectionDetailCategoryFilter.hidden = true;
      if (collectionDetailToolbar) collectionDetailToolbar.hidden = false;
      const sortBoxGender = document.getElementById('collectionDetailSortBox');
      if (sortBoxGender) sortBoxGender.hidden = true;
      genderFilter.hidden = false;
      genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.toggle('is-active', c.dataset.gender === ''));
      applyGenderFilter('');
    } else {
      collectionDetailMode = 'category';
      if (findScentCta) findScentCta.hidden = true;
      if (packOnlyNotice) packOnlyNotice.hidden = true;
      genderFilter.hidden = true;
      collectionDetailCategory = '';
      if (collectionDetailSearch) collectionDetailSearch.value = '';

      // Both toggles default to today's behavior for every collection that
      // predates this feature: search always on, no custom filter (Bundles
      // still shows whenever the collection has one — that's a separate,
      // always-on capability, not gated by this admin toggle).
      const showSearch = data.collection.showSearch !== false;
      const showFilter = !!data.collection.showFilter;
      const filterOptions = showFilter ? (data.collection.filterOptions || []) : [];
      const hasBundles = currentCollectionBundles.length > 0;

      if (collectionDetailSearchBox) collectionDetailSearchBox.hidden = !showSearch;
      if (collectionDetailCategoryFilter) {
        const showChips = filterOptions.length > 0 || hasBundles;
        collectionDetailCategoryFilter.hidden = !showChips;
        if (showChips) {
          collectionDetailCategoryFilter.innerHTML = `
            <div class="gender-filter__chip is-active" data-category="">Tous</div>
            ${filterOptions.map((o) => `<div class="gender-filter__chip" data-category="${o.id}">${o.label}</div>`).join('')}
            ${hasBundles ? '<div class="gender-filter__chip" data-category="bundles">Bundles</div>' : ''}`;
        }
      }
      if (collectionDetailToolbar) collectionDetailToolbar.hidden = !(showSearch || filterOptions.length > 0 || hasBundles);
      const sortBox = document.getElementById('collectionDetailSortBox');
      const sortSelect = document.getElementById('collectionDetailSort');
      if (sortSelect) sortSelect.value = '';
      if (sortBox) sortBox.hidden = data.products.length < 2;
      applyCollectionDetailFilter();
    }
  }

  // Bumped on every call so a slow-resolving fetch for a product the
  // customer already navigated away from can never overwrite the page with
  // stale content once a newer navigation has started.
  let productDetailRenderSeq = 0;

  async function renderProductDetail(slug) {
    const mySeq = ++productDetailRenderSeq;
    // Resolved by its own stable id — NOT by finding the child
    // #productDetailVisual and walking up, which broke on the second visit
    // ever: productDetailBodyHTML() below renders a fresh .product-detail__visual
    // div without that id, so it only ever existed in the original static
    // markup. The next render's getElementById('productDetailVisual') then
    // returned null, and calling .closest() on it threw — before the mount
    // was ever cleared, leaving the previous product on screen.
    const mount = document.getElementById('productDetailLayout');
    let product;
    try {
      product = await getProductBySlug(slug);
    } catch (e) {
      if (mySeq !== productDetailRenderSeq) return;
      mount.innerHTML = '<p style="padding:60px;text-align:center;">Produit introuvable.</p>';
      return;
    }
    if (mySeq !== productDetailRenderSeq) return;
    trackPixelEvent('ViewContent', {
      content_ids: [product.slug], content_name: product.name, content_type: 'product',
      value: product.onSale ? product.displayPrice : product.price, currency: 'MAD',
    });
    mount.innerHTML = productDetailBodyHTML(product);
    wireProductDetailActions(mount, product);
    startFlashCountdown(mount.querySelector('.js-flash-countdown'));
    loadProductReviews(mount.querySelector(`#productReviews-${product.slug}`), product.slug);
  }

  // Same render-sequence guard pattern as renderProductDetail, for the same
  // reason: a slow fetch for a bundle the customer already navigated away
  // from must never overwrite a newer page.
  let bundleDetailRenderSeq = 0;

  async function renderBundleDetail(slug) {
    const mySeq = ++bundleDetailRenderSeq;
    const mount = document.getElementById('bundleDetailLayout');
    let bundle;
    try {
      bundle = await api(`/bundles/${slug}`);
    } catch (e) {
      if (mySeq !== bundleDetailRenderSeq) return;
      mount.innerHTML = '<p style="padding:60px;text-align:center;">Bundle introuvable.</p>';
      return;
    }
    if (mySeq !== bundleDetailRenderSeq) return;
    trackPixelEvent('ViewContent', {
      content_ids: [bundle.slug], content_name: bundle.name, content_type: 'product_group', value: bundle.price, currency: 'MAD',
    });
    mount.innerHTML = bundleDetailBodyHTML(bundle);
    wireBundleDetailActions(mount, bundle);
  }

  const viewCompose = document.getElementById('view-compose');
  const composeContainer = document.getElementById('composeContainer');
  const viewLoyalty = document.getElementById('view-loyalty');
  const viewContact = document.getElementById('view-contact');
  const viewReceipt = document.getElementById('view-receipt');
  const receiptContainer = document.getElementById('receiptContainer');
  const allViews = [viewHome, viewCollections, viewDetail, viewProduct, viewBundle, viewCompose, viewLoyalty, viewContact, viewReceipt];

  async function route() {
    let hash = window.location.hash.replace('#', '');
    // Defense-in-depth: any stale link still pointing at the old modal-based
    // pack chooser (renamed to the dedicated "compose" pages) is redirected
    // rather than left to render a blank/broken view.
    if (hash === 'pack-chooser' || hash.startsWith('pack-chooser/')) {
      hash = 'compose';
      window.location.hash = '#compose';
      return;
    }
    allViews.forEach((v) => { if (v) v.hidden = true; });

    // Find Your Scent can only ever add its match into a pack that is
    // actually on screen right now — dropped the instant the customer
    // navigates anywhere else, and set fresh again by renderComposePack.
    if (!hash.startsWith('compose/pack/')) activePackComposer = null;

    const [trackRoot, trackSlug] = hash.split('/');
    if (trackRoot === 'collection' && trackSlug) Track.send('view_collection', trackSlug);
    if (trackRoot === 'product' && trackSlug) Track.send('view_product', trackSlug);

    if (hash === 'collections') {
      viewCollections.hidden = false;
      window.scrollTo(0, 0);
      await renderCollectionsGrid();
    } else if (hash.startsWith('collection/')) {
      const slug = hash.split('/')[1];
      viewDetail.hidden = false;
      window.scrollTo(0, 0);
      await renderCollectionDetail(slug);
      renderFaqSection('collection');
    } else if (hash.startsWith('product/')) {
      const slug = hash.split('/')[1];
      viewProduct.hidden = false;
      window.scrollTo(0, 0);
      await renderProductDetail(slug);
      renderFaqSection('product');
    } else if (hash.startsWith('bundle/')) {
      const slug = hash.split('/')[1];
      viewBundle.hidden = false;
      window.scrollTo(0, 0);
      await renderBundleDetail(slug);
    } else if (hash === 'compose') {
      viewCompose.hidden = false;
      window.scrollTo(0, 0);
      await renderComposeFormula(composeContainer);
    } else if (hash.startsWith('compose/size/')) {
      const size = Number(hash.split('/')[2]);
      Track.send('view_pack', String(size));
      viewCompose.hidden = false;
      window.scrollTo(0, 0);
      await renderComposeType(composeContainer, size);
    } else if (hash === 'compose/free') {
      viewCompose.hidden = false;
      window.scrollTo(0, 0);
      await renderComposeFree(composeContainer);
    } else if (hash.startsWith('compose/pack/')) {
      const packId = hash.split('/')[2];
      viewCompose.hidden = false;
      window.scrollTo(0, 0);
      await renderComposePack(composeContainer, packId);
    } else if (hash === 'receipt' || hash.startsWith('receipt/')) {
      const parts = hash.split('/');
      const orderNumber = parts[1] ? decodeURIComponent(parts[1]) : null;
      const phone = parts[2] ? decodeURIComponent(parts[2]) : null;
      viewReceipt.hidden = false;
      window.scrollTo(0, 0);
      await renderReceipt(receiptContainer, orderNumber, phone);
    } else if (hash === 'loyalty') {
      viewLoyalty.hidden = false;
      window.scrollTo(0, 0);
      renderFaqSection('loyalty');
    } else if (hash === 'contact') {
      viewContact.hidden = false;
      window.scrollTo(0, 0);
      renderFaqSection('contact');
    } else {
      viewHome.hidden = false;
      renderFaqSection('home');
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('hashchange', () => trackPixelEvent('PageView'));
  try {
    if (!sessionStorage.getItem('veintuno_visit')) {
      sessionStorage.setItem('veintuno_visit', '1');
      Track.send('visit');
    }
  } catch (e) { Track.send('visit'); }
  route();
})();

// ===========================
// THEME SWITCH (Clair / Sombre) — persisted per-browser via localStorage
// ===========================
async function initThemeSwitch() {
  const switchEl = document.getElementById('themeSwitch');
  if (!switchEl) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    switchEl.querySelectorAll('.theme-switch__option').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.theme === theme);
    });
  }

  let current;
  const urlTheme = new URLSearchParams(location.search).get('theme');
  if (urlTheme === 'clair' || urlTheme === 'sombre') {
    current = urlTheme;
  } else {
    try { current = localStorage.getItem('veintuno_theme'); } catch (e) { current = null; }
  }
  if (current !== 'clair' && current !== 'sombre') {
    // No explicit visitor choice yet — fall back to the admin's configured default.
    const settings = await getSiteSettings();
    current = (settings && settings.defaultTheme) || 'clair';
  }
  applyTheme(current);

  switchEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-switch__option');
    if (!btn) return;
    const theme = btn.dataset.theme;
    applyTheme(theme);
    try { localStorage.setItem('veintuno_theme', theme); } catch (e) { /* ignore */ }
  });
}

// ===========================
// FIND YOUR SCENT — dashboard-configured fragrance-matching quiz.
// Never bypasses the pack system: results always end at "Choose your pack,"
// never a direct add-to-cart, since perfumes cannot be bought standalone.
// ===========================
function initFindYourScent() {
  const modal = document.getElementById('quizModal');
  const backdrop = document.getElementById('quizBackdrop');
  const closeBtn = document.getElementById('quizClose');
  const body = document.getElementById('quizBody');
  if (!modal) return;

  let questions = [];
  const chosen = new Map(); // questionId -> answerId
  let step = 0;

  function close() {
    modal.classList.remove('pack-modal--open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function progressDotsHTML() {
    return `<div class="quiz-progress">${questions.map((q, i) => `<span class="quiz-progress__dot${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}"></span>`).join('')}</div>`;
  }

  function renderQuestion() {
    const q = questions[step];
    body.innerHTML = `
      ${progressDotsHTML()}
      <p class="quiz-question-count">Question ${step + 1} / ${questions.length}</p>
      <h3 class="quiz-question-text">${q.text}</h3>
      <div class="quiz-answers-grid">
        ${q.answers.map((a) => `<button type="button" class="quiz-answer-card" data-answer-id="${a.id}">${a.label}</button>`).join('')}
      </div>
      ${step > 0 ? '<button type="button" class="quiz-back-btn" id="quizBackBtn">← Question précédente</button>' : ''}`;

    body.querySelectorAll('.quiz-answer-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        chosen.set(q.id, btn.dataset.answerId);
        if (step < questions.length - 1) { step += 1; renderQuestion(); }
        else submitQuiz();
      });
    });
    const backBtn = document.getElementById('quizBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => { step -= 1; renderQuestion(); });
  }

  async function submitQuiz() {
    body.innerHTML = '<p class="admin-field-help">Analyse de vos réponses...</p>';
    let data;
    try {
      data = await api('/quiz/results', { method: 'POST', body: JSON.stringify({ answerIds: Array.from(chosen.values()) }) });
    } catch (e) { data = { results: [] }; }
    renderResults(data.results || []);
  }

  function wireResultLink() {
    const link = document.getElementById('quizGoToPacks');
    if (link) link.addEventListener('click', () => close());
  }

  function renderResults(results) {
    if (!results.length) {
      body.innerHTML = `
        <div class="quiz-results">
          <h3>Aucune correspondance trouvée pour le moment</h3>
          <p class="admin-field-help">Composez directement votre pack — nos parfumeurs seront ravis de vous conseiller.</p>
          <a href="#collection/parfums" class="btn btn--gold" id="quizGoToPacks">Choisir mon pack</a>
        </div>`;
      wireResultLink();
      return;
    }
    // While a pack is actively being composed (Find Your Scent opened from
    // the "FIND YOUR SCENT" banner inside that composer), a matched perfume
    // that's actually eligible for that pack gets a direct "add to my pack"
    // action instead of the normal "go choose a pack" link — it's registered
    // as a real pack choice immediately, no extra navigation needed since
    // the composer is already open underneath this modal.
    body.innerHTML = `
      <div class="quiz-results">
        <p class="section__eyebrow">Your Scent Match</p>
        <h3>Vos parfums recommandés</h3>
        <div class="quiz-results__list">
          ${results.map((r, i) => {
            const eligibleForActivePack = activePackComposer
              && activePackComposer.pack.eligibleProducts.some((p) => p.slug === r.product.slug);
            const chooseActionHTML = eligibleForActivePack
              ? `<button type="button" class="btn btn--gold btn--small js-quiz-add-to-pack" data-slug="${r.product.slug}">Ajouter à mon pack →</button>`
              : `<a href="#collection/${r.product.collection ? r.product.collection.slug : 'parfums'}" class="btn btn--gold btn--small js-quiz-add-to-cart">Choisir mon pack</a>`;
            return `
            <div class="quiz-result-card">
              <span class="quiz-result-card__rank">${i + 1}</span>
              <div class="quiz-result-card__media">${productMediaHTML(r.product)}</div>
              <div class="quiz-result-card__body">
                <h4>${r.product.name}</h4>
                <p class="quiz-result-card__notes">${r.product.notes || ''}</p>
                <p class="quiz-result-card__match">${r.matchPercent}% Match</p>
                ${r.matchedCharacteristics.length ? `<p class="quiz-result-card__why">Basé sur vos réponses, vous préférez des senteurs ${r.matchedCharacteristics.join(', ').toLowerCase()}.</p>` : ''}
                <div class="quiz-result-card__actions">
                  <button type="button" class="btn btn--outline btn--small js-quick-view" data-slug="${r.product.slug}" data-hide-pack-cta="1">Aperçu rapide</button>
                  ${chooseActionHTML}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <p class="quiz-results__note">${activePackComposer
          ? 'Cliquez sur "Ajouter à mon pack" pour enregistrer directement ce parfum comme l\'un de vos choix — vous pourrez ensuite compléter le reste normalement.'
          : 'Ces parfums sont disponibles exclusivement au sein de nos packs — le bouton "Choisir mon pack" vous amène directement au choix de pack incluant ce parfum.'}</p>
      </div>`;
    wireResultLink();
    body.querySelectorAll('.js-quiz-add-to-cart, .quiz-result-card__actions a').forEach((link) => {
      link.addEventListener('click', () => close());
    });
    body.querySelectorAll('.js-quiz-add-to-pack').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.slug;
        const composer = activePackComposer;
        close();
        if (!composer) return;
        setTimeout(() => {
          const added = composer.changeQty(slug, 1);
          if (added) composer.highlightCard(slug);
        }, 200);
      });
    });
  }

  async function open() {
    body.innerHTML = '<p class="admin-field-help">Chargement...</p>';
    modal.classList.add('pack-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    step = 0;
    chosen.clear();
    try { questions = await api('/quiz'); } catch (e) { questions = []; }
    if (!questions.length) {
      body.innerHTML = '<p class="admin-field-help">Le quiz sera bientôt disponible.</p>';
      return;
    }
    renderQuestion();
  }

  // Delegated (not a direct listener on one static button) so the quiz also
  // opens from the "FIND YOUR SCENT" banner rendered dynamically inside the
  // pack composer, in addition to the original entry point on the Parfums
  // collection page — both share the same modal/flow, nothing duplicated.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#findScentBtn, .js-find-scent-open')) open();
  });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('pack-modal--open')) close();
  });
}

// Mobile bottom tab bar — navigation-only sugar, no cart/business logic.
// The "Panier" tab simply clicks the existing header cart icon so it reuses
// the exact same drawer/open('bag') logic instead of duplicating it.
(() => {
  const bar = document.getElementById('mobileTabbar');
  if (!bar) return;
  const cartTab = document.getElementById('mobileTabbarCart');
  const tabs = bar.querySelectorAll('.mobile-tabbar__item');
  if (cartTab) {
    cartTab.addEventListener('click', () => {
      document.getElementById('cartToggle')?.click();
    });
  }
  function syncActiveTab() {
    const hash = window.location.hash.replace('#', '');
    tabs.forEach((el) => {
      const tab = el.dataset.tab;
      const isActive =
        (tab === 'home' && (hash === '' || hash === 'accueil')) ||
        (tab === 'shop' && (hash === 'collections' || hash.startsWith('collection/') || hash.startsWith('product/') || hash.startsWith('compose'))) ||
        (tab === 'account' && hash === 'loyalty');
      el.classList.toggle('is-active', isActive);
    });
  }
  window.addEventListener('hashchange', syncActiveTab);
  syncActiveTab();
})();

(() => {
  const navLinks = Array.from(document.querySelectorAll("#nav > a"));
  if (!navLinks.length) return;
  function syncNavCurrent() {
    const hash = window.location.hash.replace("#", "");
    navLinks.forEach((a) => {
      const target = a.getAttribute("href").replace("#", "");
      const isCurrent = target === "accueil" ? (hash === "" || hash === "accueil") : (hash === target || hash.startsWith(target + "/"));
      a.classList.toggle("is-current", isCurrent);
    });
  }
  window.addEventListener("hashchange", syncNavCurrent);
  syncNavCurrent();
})();

// Boot
initHomepage();
initQuickView();
initNavExtras();
initSearch();
initLoyaltyPage();
initContactPage();
initThemeSwitch();
initAnnouncementBar();
initWhatsappFloat();
initSupportChat();
// Real recent orders only (product, quantity, time) — no customer names.
const PURCHASE_NOTICE = { firstDelayMs: 4000, intervalMs: 10000, visibleMs: 5000 };

function purchaseAgoLabel(iso) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

// Fisher-Yates — reshuffled after every full pass so the notice never
// replays the exact same sequence twice in a row, without ever inventing
// an order that didn't really happen.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function initPurchaseNotice() {
  let events = [];
  try { events = await api('/recent-purchases'); } catch (e) { return; }
  if (!events.length) return;
  events = shuffle(events);

  const host = document.createElement('div');
  host.className = 'purchase-notice';
  host.hidden = true;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = '<div class="purchase-notice__thumb"></div><div class="purchase-notice__body"><p></p><span></span></div>';
  document.body.appendChild(host);

  const thumb = host.querySelector('.purchase-notice__thumb');
  const text = host.querySelector('p');
  const when = host.querySelector('span');
  let index = 0;
  let hideTimer = null;

  function hide() {
    host.classList.remove('is-visible');
    setTimeout(() => { host.hidden = true; }, 400);
  }
  function show() {
    if (index >= events.length) { events = shuffle(events); index = 0; }
    const ev = events[index];
    index += 1;
    thumb.textContent = '';
    if (ev.image) {
      const img = document.createElement('img');
      img.src = ev.image;
      img.alt = '';
      img.loading = 'lazy';
      thumb.appendChild(img);
    }
    const count = ev.count || 1;
    const personLabel = count === 1 ? '1 personne a pris' : `${count} personnes ont pris`;
    text.textContent = `${personLabel} ${ev.name}${ev.quantity > 1 ? ` × ${ev.quantity}` : ''}`;
    when.textContent = purchaseAgoLabel(ev.createdAt);
    host.hidden = false;
    requestAnimationFrame(() => host.classList.add('is-visible'));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, PURCHASE_NOTICE.visibleMs);
  }

  // Jittered gap (±30%) instead of a fixed interval, so the rhythm itself
  // doesn't feel robotic — only the gap between appearances varies; what's
  // shown is still always pulled from real orders.
  function scheduleNext() {
    const jitter = PURCHASE_NOTICE.intervalMs * 0.3;
    const gap = PURCHASE_NOTICE.intervalMs + (Math.random() * jitter * 2 - jitter);
    setTimeout(() => { show(); scheduleNext(); }, gap);
  }
  setTimeout(() => { show(); scheduleNext(); }, PURCHASE_NOTICE.firstDelayMs);
}

// ===========================
// SIMULATED ACTIVITY NOTICE — marketing-only, replaces the real-orders
// notice above. Single switch to disable (SIMULATED_NOTICE_ENABLED). Never
// reads order/customer data, never uses a real customer's name, and always
// carries the small "Activité simulée" tag (SIMULATED_NOTICE_DISCLOSURE)
// so it's never presented as an actual, unqualified sale.
// ===========================
const SIMULATED_NOTICE_ENABLED = true;
const SIMULATED_NOTICE_INTERVAL_MS = 20 * 1000; // fixed gap between two popups
const SIMULATED_NOTICE_VISIBLE_MS = 5000;
const SIMULATED_NOTICE_DISCLOSURE = 'Activité simulée';

// The "il y a ..." text inside each popup — not the gap between popups —
// is what varies randomly, anywhere from a few seconds to 2 hours.
function randomSimulatedAgo() {
  const buckets = [
    () => `il y a ${10 + Math.floor(Math.random() * 50)} secondes`,
    () => `il y a ${1 + Math.floor(Math.random() * 59)} min`,
    () => { const h = Math.random() < 0.5 ? 1 : 2; return `il y a ${h} heure${h > 1 ? 's' : ''}`; },
  ];
  return buckets[Math.floor(Math.random() * buckets.length)]();
}
// One image per product, kept in sync by hand (not fetched live) — update
// the URL here if that product's photo changes in the admin.
const SIMULATED_NOTICE_PRODUCTS = [
  { name: 'Calm Nerves', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1789065635346-47ead225.jpeg' },
  { name: 'Deep Sleep', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1788992444740-b4917805.jpeg' },
  { name: 'Gel Douche God Of Fire', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1790619340448-07c514db.jpeg' },
  { name: 'Gel Douche Tom Ford Lost Cherry', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1790619393805-15044bc0.png' },
  { name: 'Pack Normal', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1791384438201-6de3a58f.webp' },
  { name: 'Pack Familiale', image: null },
  { name: 'Filer Pour Les Joues', image: 'https://winmmhiujf6k69wq.public.blob.vercel-storage.com/1789130472225-575eac4f.jpeg' },
];
const SIMULATED_NOTICE_MESSAGES = [
  (name) => `Une personne vient de choisir ${name}`,
  (name) => `Une personne vient de commander ${name} — ${randomSimulatedAgo()}`,
];

function initSimulatedActivityNotice() {
  if (!SIMULATED_NOTICE_ENABLED || !SIMULATED_NOTICE_PRODUCTS.length) return;

  const host = document.createElement('div');
  host.className = 'purchase-notice';
  host.hidden = true;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = '<div class="purchase-notice__thumb"></div><div class="purchase-notice__body"><p></p><span></span></div>';
  document.body.appendChild(host);

  const thumb = host.querySelector('.purchase-notice__thumb');
  const text = host.querySelector('p');
  const disclosure = host.querySelector('span');
  disclosure.textContent = SIMULATED_NOTICE_DISCLOSURE;
  disclosure.className = 'purchase-notice__disclosure';
  let hideTimer = null;

  function hide() {
    host.classList.remove('is-visible');
    setTimeout(() => { host.hidden = true; }, 400);
  }
  function show() {
    const item = SIMULATED_NOTICE_PRODUCTS[Math.floor(Math.random() * SIMULATED_NOTICE_PRODUCTS.length)];
    const template = SIMULATED_NOTICE_MESSAGES[Math.floor(Math.random() * SIMULATED_NOTICE_MESSAGES.length)];
    thumb.textContent = '';
    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = '';
      img.loading = 'lazy';
      thumb.appendChild(img);
    }
    text.textContent = template(item.name);
    host.hidden = false;
    requestAnimationFrame(() => host.classList.add('is-visible'));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, SIMULATED_NOTICE_VISIBLE_MS);
  }
  function scheduleNext() {
    setTimeout(() => { show(); scheduleNext(); }, SIMULATED_NOTICE_INTERVAL_MS);
  }
  scheduleNext();
}

initMetaPixel();
initFindYourScent();
initSimulatedActivityNotice();
