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
  return `
    <p class="${variant === 'card' ? 'product-card__price product-card__price--flash' : 'product-detail__price product-detail__price--flash'}">
      <span class="price-original">${p.originalPrice} MAD</span>
      <span class="price-sale">${p.displayPrice} MAD</span>
    </p>`;
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
        ${p.volume ? `<span class="product-card__volume">${p.volume}</span>` : ''}
        <a href="#product/${p.slug}" class="product-card__bottle">${productMediaHTML(p)}</a>
        ${!packOnly ? `<button type="button" class="product-card__quickview js-quick-view" data-slug="${p.slug}">Aperçu rapide</button>` : ''}
      </div>
      <div class="product-card__footer">
        <div class="product-card__heading">
          <h3><a href="#product/${p.slug}">${cardTitleHTML(p.name)}</a></h3>
          ${priceHTML(p, 'card')}
        </div>
        <p class="product-card__notes">${p.notes || ''}</p>
        ${packOnly
          ? `<a href="#collection/${p.collection.slug}" class="btn btn--outline product-card__cta">En pack uniquement →</a>`
          : `<button type="button" class="btn btn--outline product-card__cta js-add-product" data-slug="${p.slug}">Ajouter au panier →</button>`}
      </div>
    </article>`;
}

// The whole card navigates to the product page — except the two buttons
// (quick view / add to cart) and any inner <a>, which handle their own click.
document.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card[data-href]');
  if (!card) return;
  if (e.target.closest('.js-quick-view, .js-add-product, .js-add-bundle, a')) return;
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

  // Gel Douche individual-unit delivery fee (30 MAD) — this is only a
  // client-side preview so the customer sees it before submitting; the
  // server independently recomputes and enforces the real fee at checkout,
  // never trusting a value sent from here.
  let gelsDoucheCollectionId = null;
  (async () => {
    try {
      const cols = await api('/collections');
      const gd = cols.find((c) => c.slug === 'gels-douche');
      gelsDoucheCollectionId = gd ? gd.id : null;
      renderAll();
    } catch (e) { /* ignore — fee preview simply stays 0 until this resolves */ }
  })();

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
    if (totalEl) totalEl.textContent = `${total()} MAD`;
    if (checkoutBtn) checkoutBtn.disabled = items.length === 0;

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

  checkoutBtn.addEventListener('click', () => {
    if (items.length === 0) return;
    if (checkoutSubtotalEl) checkoutSubtotalEl.textContent = `${total()} MAD`;
    checkoutErrorEl.hidden = true;
    // A fresh checkout attempt gets a fresh idempotency key. Reused across
    // checkout↔review back-and-forth so a double-submit of the SAME attempt
    // is recognized server-side and never creates a second order.
    clientOrderId = newClientOrderId();
    showStep('checkout');
    trackPixelEvent('InitiateCheckout', {
      value: total(), currency: 'MAD', num_items: itemCount(),
      content_ids: items.map((i) => i.productSlug || i.packId || i.bundleId).filter(Boolean),
    });
  });

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
      });

      // Order is locked in server-side — now safe to wipe the local cart so
      // a page refresh or repeat visit can never resubmit the same order.
      clear();
      checkoutForm.reset();
      pendingCustomer = null;
      clientOrderId = null;
      showStep('success');
    } catch (err) {
      checkoutErrorEl.textContent = err.message;
      checkoutErrorEl.hidden = false;
    } finally {
      isSubmittingOrder = false;
      checkoutSubmitBtn.disabled = false;
      checkoutSubmitBtn.textContent = 'Finaliser ma commande';
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

  return { addPack, addFreePack, addBundle, addProduct, open, close };
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
    if (Cart) Cart.open('bag');
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

    return `
      <div class="hero-slide${i === 0 ? ' is-active' : ''}" data-index="${i}">
        ${mediaHTML}
        <div class="hero-slide__overlay"></div>
        <div class="hero-slide__inner">
          <div class="hero-slide__content">
            ${slide.eyebrow ? `<p class="eyebrow">${slide.eyebrow}</p>` : ''}
            <h1>${slide.title}</h1>
            ${slide.subtitle ? `<p class="hero-slide__subtitle">${slide.subtitle}</p>` : ''}
            <div class="hero-slide__actions">${ctasHTML}</div>
          </div>
        </div>
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
  return `
    <a href="#collection/${c.slug}" class="collection-tile collection-tile--${c.slug}${c.image ? ' has-image' : ''}"${style}>
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
  return `
    <section class="products">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Offres groupées'}</p>
        <h2 class="section__title">${section.subtitle || 'Nos Bundles'}</h2>
        <div class="products__grid">${bundles.map(bundleCardHTML).join('')}</div>
      </div>
    </section>`;
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
          ${packs.map((pack, i) => `
            <div class="pack-card${i === featuredIndex ? ' pack-card--featured' : ''}">
              ${i === featuredIndex ? '<span class="pack-card__badge">Le plus choisi</span>' : ''}
              <h3>${pack.name}</h3>
              <p class="pack-card__count">${pack.size} produits</p>
              <p class="pack-card__price">${pack.price} <span>MAD</span></p>
              <ul><li>${pack.size} produits au choix</li><li>Livraison offerte</li><li>Paiement à la livraison</li></ul>
              <a href="#compose/pack/${pack.id}" class="btn btn--${i === featuredIndex ? 'gold' : 'outline'} btn--full">Composer</a>
            </div>`).join('')}
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
  const reviews = section.config.reviews || [];
  if (!reviews.length) return '';
  return `
    <section class="client-reviews">
      <div class="container">
        <p class="section__eyebrow">${section.title || 'Témoignages'}</p>
        <h2 class="section__title">${section.subtitle || 'Ce que nos clientes en disent'}</h2>
        <div class="client-reviews__grid">${reviews.map(clientReviewCardHTML).join('')}</div>
      </div>
    </section>`;
}

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
  TEXT_IMAGE: textImageSectionHTML,
  TESTIMONIALS: testimonialsSectionHTML,
  PROMO_BANNER: promoBannerSectionHTML,
  PACKS: packsSectionHTML,
  CLIENT_REVIEWS: clientReviewsSectionHTML,
};

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

  // Quantities per slug — a customer can pick the same perfume several times
  // (e.g. Atlas Noir ×2, Minuit Cuir ×1) as long as the total equals pack.size.
  // Stored at module scope (composeDraftState) keyed by packId so leaving this
  // pack (quick view, gender filter, going back and returning) never resets it.
  if (!composeDraftState.packs.has(packId)) composeDraftState.packs.set(packId, new Map());
  const quantities = composeDraftState.packs.get(packId);
  const totalSelected = () => Array.from(quantities.values()).reduce((s, n) => s + n, 0);

  function cardsGridHTML() {
    return pack.eligibleProducts.map((p) => {
      const hasPhoto = Array.isArray(p.images) && !!p.images[0];
      return `
      <div class="fragrance-card fragrance-card--stepper" data-slug="${p.slug}" data-name="${p.name}" data-genders="${(p.genders || []).join(',')}">
        <div class="fragrance-card__media${hasPhoto ? ' fragrance-card__media--photo' : ''}">
          ${p.isBestSeller ? '<span class="product-card__tag product-card__tag--gold">Best Seller</span>' : p.isLimitedEdition ? '<span class="product-card__tag">Édition limitée</span>' : ''}
          <div class="product-card__bottle">${productMediaHTML(p)}</div>
        </div>
        <div class="fragrance-card__footer">
          <h3>${cardTitleHTML(p.name)}</h3>
          <p class="product-card__notes">${p.notes || ''}</p>
          <button type="button" class="fragrance-card__details js-quick-view" data-slug="${p.slug}">Voir les détails</button>
          <div class="fragrance-card__qty qty-selector">
            <button type="button" class="qty-minus" data-slug="${p.slug}" aria-label="Retirer">−</button>
            <span class="fragrance-card__qty-value" data-slug="${p.slug}">0</span>
            <button type="button" class="qty-plus" data-slug="${p.slug}" aria-label="Ajouter">+</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML = `
    <a href="#compose/size/${pack.size}" class="collection-detail__back">← Changer de collection</a>
    <p class="section__eyebrow">Composez votre ${pack.name}</p>
    <h2 class="section__title">${pack.name}</h2>
    <p class="admin-field-help" style="margin-top:-12px;margin-bottom:20px;">Vous pouvez sélectionner plusieurs fois le même parfum.</p>
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
      <button type="button" class="btn btn--gold" id="composePackCta" disabled>Ajouter au panier</button>
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
      card.querySelector('.fragrance-card__qty-value').textContent = qty;
      card.classList.toggle('is-selected', qty > 0);
      const plusBtn = card.querySelector('.qty-plus');
      plusBtn.disabled = isFull;
      const minusBtn = card.querySelector('.qty-minus');
      minusBtn.disabled = qty === 0;
    });
    recap.innerHTML = '';
    if (total === 0) {
      recap.innerHTML = '<span class="pack-modal__recap-empty">Aucun parfum sélectionné</span>';
    } else {
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
    cta.textContent = cta.disabled ? 'Ajouter au panier' : `Ajouter au panier — ${pack.price} MAD`;
  }

  function setQty(slug, qty) {
    if (qty <= 0) quantities.delete(slug);
    else quantities.set(slug, qty);
    updateUI();
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

  grid.addEventListener('click', (e) => {
    const plusBtn = e.target.closest('.qty-plus');
    const minusBtn = e.target.closest('.qty-minus');
    if (plusBtn) changeQty(plusBtn.dataset.slug, 1);
    if (minusBtn) changeQty(minusBtn.dataset.slug, -1);
  });

  cta.addEventListener('click', () => {
    if (cta.disabled) return;
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
    Cart.addPack(pack.id, pack.name, pack.price, slugs, names, images);
    composeDraftState.packs.delete(packId);
    lastComposeAddedSummary = { name: pack.name, itemNames: names };
    location.hash = '#compose/added';
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
      <button type="button" class="btn btn--gold" id="composeFreeCta" disabled>Ajouter au panier</button>
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
    cta.textContent = cta.disabled ? 'Ajouter au panier' : `Ajouter au panier — ${price.toFixed(2)} MAD`;
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
    lastComposeAddedSummary = { name: config.name, itemNames: selected.map((s) => s.name) };
    location.hash = '#compose/added';
  });

  updateUI();
}

// Set right before `location.hash = '#compose/added'` by the composer CTA
// handlers — a plain transient variable is enough since the dedicated view is
// only ever reached immediately after adding a pack, never by direct link.
let lastComposeAddedSummary = null;

function renderComposeAdded(container) {
  const summary = lastComposeAddedSummary;
  const name = summary ? summary.name : 'Votre pack';
  const itemNames = summary ? summary.itemNames : [];
  container.innerHTML = `
    <div class="compose-success compose-success--page">
      <div class="pack-modal__success-icon">
        <svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h2 class="section__title">${name} ajouté au panier</h2>
      ${itemNames.length ? `<ul class="pack-modal__success-list">${itemNames.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      <div class="compose-success__actions">
        <button type="button" class="btn btn--gold" id="composeAddedViewCart">Voir mon panier</button>
        <a href="#compose" class="btn btn--outline">Composer un autre pack</a>
      </div>
    </div>`;
  const viewCartBtn = document.getElementById('composeAddedViewCart');
  if (viewCartBtn) viewCartBtn.addEventListener('click', () => Cart.open('bag'));
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
    startVisitorCounter(body.querySelector('.js-visitor-counter'));
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
let visitorCounterSeq = 0;

function productDetailBodyHTML(p, compact) {
  const col = p.collection ? p.collection.name : '';
  const isPerfume = p.collection && p.collection.slug === 'parfums';
  const notesHTML = (p.notesTop || p.notesHeart || p.notesBase) ? `
    <div class="product-detail__notes">
      ${p.notesTop ? `<p><strong>Notes de tête</strong> — ${p.notesTop}</p>` : ''}
      ${p.notesHeart ? `<p><strong>Notes de cœur</strong> — ${p.notesHeart}</p>` : ''}
      ${p.notesBase ? `<p><strong>Notes de fond</strong> — ${p.notesBase}</p>` : ''}
    </div>` : '';

  visitorCounterSeq += 1;
  const counterId = `visitorCounter${visitorCounterSeq}`;

  return `
    <div class="product-detail__visual">${productMediaHTML(p)}</div>
    <div class="product-detail__info">
      ${!compact ? `<a href="#collection/${p.collection ? p.collection.slug : ''}" class="collection-detail__back">← Retour à la collection</a>` : ''}
      ${col ? `<p class="section__eyebrow">${col}</p>` : ''}
      <h1 style="${compact ? 'font-size:26px;' : ''}">${p.name}</h1>
      <div class="product-detail__meta-row">
        ${priceHTML(p, 'detail')}
        ${p.volume ? `<span class="product-detail__volume">${p.volume}</span>` : ''}
      </div>
      ${p.onSale && p.flashSaleEnd ? `<div class="flash-countdown js-flash-countdown" data-end="${p.flashSaleEnd}"></div>` : ''}
      <p class="product-detail__availability ${p.stock > 0 ? 'is-available' : 'is-unavailable'}">${p.stock > 0 ? 'En stock' : 'Rupture de stock'}</p>
      <p class="visitor-counter js-visitor-counter" id="${counterId}" data-count="0"></p>
      ${p.description ? `<p class="product-detail__description">${p.description}</p>` : ''}
      ${notesHTML}
      ${isPerfume ? `<p class="product-detail__disclaimer">${(siteSettingsCache && siteSettingsCache.perfumeDisclaimer) || 'Inspiré des plus grands parfums — non affilié aux marques citées.'}</p>` : ''}
      ${p.collection && p.collection.packOnly ? `
      <div class="product-detail__pack-only">
        <p>Disponible uniquement en pack.</p>
        <a href="#collection/${p.collection.slug}" class="btn btn--gold btn--full">Choisir mon pack</a>
      </div>` : `
      <div class="product-detail__actions">
        <div class="qty-selector">
          <button type="button" class="qty-minus" aria-label="Diminuer">−</button>
          <input type="number" class="qty-input" value="1" min="1">
          <button type="button" class="qty-plus" aria-label="Augmenter">+</button>
        </div>
        <button type="button" class="btn btn--gold js-detail-add" data-slug="${p.slug}" ${p.stock <= 0 ? 'disabled' : ''}>Ajouter au panier</button>
      </div>`}
      ${!compact ? `<div class="product-reviews" id="productReviews-${p.slug}"><p class="admin-field-help">Chargement des avis...</p></div>` : ''}
    </div>`;
}

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

// Discreet, elegant "social proof" indicator — purely cosmetic, randomized
// client-side, never backed by real visitor tracking.
function startVisitorCounter(el) {
  if (!el) return;
  function tick() {
    const n = Math.floor(Math.random() * 31); // 0–30 inclusive
    el.textContent = n <= 1
      ? `${n} personne regarde ce produit maintenant`
      : `${n} personnes regardent ce produit maintenant`;
    el.hidden = n === 0 && Math.random() > 0.5; // occasionally go quiet, feels more organic
  }
  tick();
  const interval = setInterval(tick, 4000 + Math.random() * 3000);
  // Stop the ticker once this element leaves the DOM (route change) to avoid leaks.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) { clearInterval(interval); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
  const content = b.items.map((it) => `${it.product.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
  return `
    <div class="product-detail__visual">${b.image ? `<img src="${b.image}" alt="${b.name}" loading="lazy">` : productVisual('bottle', '#C9A227')}</div>
    <div class="product-detail__info">
      <a href="#collections" class="collection-detail__back">← Retour aux collections</a>
      <p class="section__eyebrow">Bundle</p>
      <h1>${b.name}</h1>
      <div class="product-detail__meta-row">
        <p class="product-detail__price">${b.price} MAD</p>
      </div>
      ${b.description ? `<p class="product-detail__description">${b.description}</p>` : ''}
      <div class="product-detail__notes">
        <p><strong>Produits inclus</strong> — ${content}</p>
      </div>
      <div class="product-detail__actions">
        <div class="qty-selector">
          <button type="button" class="qty-minus" aria-label="Diminuer">−</button>
          <input type="number" class="qty-input" value="1" min="1">
          <button type="button" class="qty-plus" aria-label="Augmenter">+</button>
        </div>
        <button type="button" class="btn btn--gold js-bundle-detail-add">Ajouter au panier</button>
      </div>
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
  if (settings && settings.announcementText) {
    bar.querySelectorAll('.topbar__text').forEach((el) => { el.textContent = settings.announcementText; });
  }
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
function trackPixelEvent(eventName, params) {
  if (typeof window.fbq === 'function') window.fbq('track', eventName, params || {});
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

  // Public, generic "how it works" blurb (the customer's actual balance and
  // available rewards are shown after verification, below).
  if (howEl) {
    howEl.innerHTML = `
      <p><strong>Comment gagner des points ?</strong> Chaque commande livrée vous rapporte des points, proportionnellement au montant dépensé.</p>
      <p><strong>Comment les utiliser ?</strong> Contactez-nous sur WhatsApp avec votre solde pour échanger vos points contre une récompense.</p>`;
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
          <div class="loyalty-progress__labels"><span>${data.balance} points</span><span>${data.nextReward.pointsRequired} points</span></div>
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
        <div class="loyalty-result__balance">
          <p class="section__eyebrow">Bonjour ${data.fullName.split(' ')[0]}</p>
          <p class="loyalty-result__points">${data.balance} <span>points</span></p>
        </div>
        ${progressHTML}
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

  if (!viewHome || !viewCollections || !viewDetail) return;

  let currentCollectionProducts = [];
  // Bundles assigned to the current collection (from the admin dashboard) —
  // rendered inline in the same grid as products, not a separate section.
  // They aren't gender-tagged, so they only show under "Tous", not under a
  // specific Homme/Femme/Unisexe filter.
  let currentCollectionBundles = [];

  function applyGenderFilter(gender) {
    const filtered = gender
      ? currentCollectionProducts.filter((p) => Array.isArray(p.genders) && p.genders.includes(gender))
      : currentCollectionProducts;
    const bundlesHTML = gender ? '' : currentCollectionBundles.map(bundleCardHTML).join('');
    detailGrid.innerHTML = filtered.map(productCardHTML).join('') + bundlesHTML;
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
    detailGrid.innerHTML = products.map(productCardHTML).join('') + bundles.map(bundleCardHTML).join('');
    if (collectionDetailEmptyMsg) collectionDetailEmptyMsg.hidden = (products.length + bundles.length) > 0;
    initRevealAnimations();
  }

  if (collectionDetailSearch) {
    collectionDetailSearch.addEventListener('input', applyCollectionDetailFilter);
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

    const packOnly = !!data.collection.packOnly;

    if (data.packs && data.packs.length) {
      const featuredIndex = data.packs.length === 3 ? 1 : -1;
      detailPacks.innerHTML = `
        <p class="section__eyebrow">${packOnly ? 'Sélection exclusive' : 'Formules'}</p>
        <h3 class="section__title" style="margin-bottom:28px;font-size:26px;">${packOnly ? 'Choose Your Pack' : 'Composez votre pack'}</h3>
        <div class="packs__grid">
          ${data.packs.map((pack, i) => `
            <div class="pack-card${i === featuredIndex ? ' pack-card--featured' : ''}">
              ${i === featuredIndex ? '<span class="pack-card__badge">Le plus choisi</span>' : ''}
              <h3>${pack.name}</h3>
              <p class="pack-card__count">${pack.size} produits</p>
              <p class="pack-card__price">${pack.price} <span>MAD</span></p>
              <ul><li>${pack.size} produits au choix</li><li>Livraison offerte</li><li>Paiement à la livraison</li></ul>
              <a href="#compose/pack/${pack.id}" class="btn btn--${i === featuredIndex ? 'gold' : 'outline'} btn--full">${packOnly ? 'Choisir ce pack' : 'Composer'}</a>
            </div>`).join('')}
        </div>`;
      detailPacks.hidden = false;
    }

    currentCollectionProducts = data.products;
    currentCollectionBundles = data.bundles || [];
    if (packOnly) {
      // Perfumes in a pack-only collection are never individually addable —
      // browsing lands on the pack list above; picking a pack is what reveals
      // "Now Choose Your Scents" (the existing composer flow) below.
      genderFilter.hidden = true;
      if (collectionDetailToolbar) collectionDetailToolbar.hidden = true;
      if (findScentCta) findScentCta.hidden = false;
      detailGrid.innerHTML = `
        <div class="pack-only-notice">
          <p>Ces parfums sont disponibles exclusivement au sein de nos packs.</p>
          <p>Choisissez votre pack ci-dessus, puis composez votre sélection de parfums.</p>
        </div>`;
    } else if (slug === 'parfums') {
      if (findScentCta) findScentCta.hidden = true;
      if (collectionDetailToolbar) collectionDetailToolbar.hidden = true;
      genderFilter.hidden = false;
      genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.toggle('is-active', c.dataset.gender === ''));
      applyGenderFilter('');
    } else {
      if (findScentCta) findScentCta.hidden = true;
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
    startVisitorCounter(mount.querySelector('.js-visitor-counter'));
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

    if (hash === 'collections') {
      viewCollections.hidden = false;
      window.scrollTo(0, 0);
      await renderCollectionsGrid();
    } else if (hash.startsWith('collection/')) {
      const slug = hash.split('/')[1];
      viewDetail.hidden = false;
      window.scrollTo(0, 0);
      await renderCollectionDetail(slug);
    } else if (hash.startsWith('product/')) {
      const slug = hash.split('/')[1];
      viewProduct.hidden = false;
      window.scrollTo(0, 0);
      await renderProductDetail(slug);
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
    } else if (hash === 'compose/added') {
      viewCompose.hidden = false;
      window.scrollTo(0, 0);
      renderComposeAdded(composeContainer);
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
    } else if (hash === 'contact') {
      viewContact.hidden = false;
      window.scrollTo(0, 0);
    } else {
      viewHome.hidden = false;
    }
  }

  window.addEventListener('hashchange', route);
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
initMetaPixel();
initFindYourScent();
