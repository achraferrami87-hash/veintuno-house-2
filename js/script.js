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

function productCardHTML(p) {
  const tag = p.isBestSeller ? 'Best Seller' : p.isLimitedEdition ? 'Édition limitée' : p.isNew ? 'Nouveauté' : null;
  const packOnly = p.collection && p.collection.packOnly;
  return `
    <article class="product-card reveal" data-href="#product/${p.slug}">
      ${p.onSale ? `<span class="flash-badge">${p.flashSaleLabel || 'Flash Sale'}</span>` : tag ? `<span class="product-card__tag${tag === 'Best Seller' ? ' product-card__tag--gold' : ''}">${tag}</span>` : ''}
      <a href="#product/${p.slug}" class="product-card__bottle">${productMediaHTML(p)}</a>
      ${!packOnly ? `<button type="button" class="product-card__quickview js-quick-view" data-slug="${p.slug}">Aperçu rapide</button>` : ''}
      <h3><a href="#product/${p.slug}">${p.name}</a></h3>
      <p class="product-card__notes">${p.notes || ''}</p>
      ${priceHTML(p, 'card')}
      ${packOnly
        ? `<a href="#collection/${p.collection.slug}" class="btn btn--outline product-card__cta">En pack uniquement</a>`
        : `<button type="button" class="btn btn--outline product-card__cta js-add-product" data-slug="${p.slug}">Ajouter au panier</button>`}
    </article>`;
}

// The whole card navigates to the product page — except the two buttons
// (quick view / add to cart) and any inner <a>, which handle their own click.
document.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card[data-href]');
  if (!card) return;
  if (e.target.closest('.js-quick-view, .js-add-product, a')) return;
  window.location.hash = card.dataset.href;
});

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
  const stepReview = document.getElementById('cartStepReview');
  const stepSuccess = document.getElementById('cartStepSuccess');

  const itemsEl = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountRowEl = document.getElementById('cartDiscountRow');
  const discountEl = document.getElementById('cartDiscount');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  const checkoutSubtotalEl = document.getElementById('checkoutSubtotal');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutErrorEl = document.getElementById('checkoutError');
  if (checkoutForm.phone) attachPhoneValidation(checkoutForm.phone);

  const reviewItemsEl = document.getElementById('reviewItems');
  const reviewCustomerEl = document.getElementById('reviewCustomer');
  const reviewTotalEl = document.getElementById('reviewTotal');
  const reviewErrorEl = document.getElementById('reviewError');
  const reviewFinalizeBtn = document.getElementById('reviewFinalizeBtn');
  const reviewBackBtn = document.getElementById('reviewBackBtn');

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
  function total() {
    return Math.max(0, subtotal() - discount());
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

  function addPack(packId, packName, packPrice, componentSlugs, componentNames) {
    items.push({
      uid: 'pack-' + Date.now(), kind: 'PACK', packId, name: packName,
      unitPrice: Number(packPrice), quantity: 1, componentSlugs,
      detail: `${componentSlugs.length} produits — ${summarizeNames(componentNames)}`,
    });
    clearPromo(); persist(); renderAll();
  }

  function addFreePack(freePackName, unitPrice, componentSlugs, componentNames) {
    items.push({
      uid: 'freepack-' + Date.now(), kind: 'FREE_PACK', name: freePackName,
      unitPrice, quantity: 1, componentSlugs,
      detail: summarizeNames(componentNames),
    });
    clearPromo(); persist(); renderAll();
  }

  function addBundle(bundleId, bundleName, bundlePrice, detail) {
    items.push({
      uid: 'bundle-' + Date.now(), kind: 'BUNDLE', bundleId, name: bundleName,
      unitPrice: Number(bundlePrice), quantity: 1, detail,
    });
    clearPromo(); persist(); renderAll();
    pulseBadge();
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
      });
    }
    clearPromo(); persist(); renderAll();
    pulseBadge();
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
      thumb.innerHTML = (item.images && item.images[0]) ? `<img src="${item.images[0]}" alt="${item.name}">` : productVisual(item.shape || 'bottle', item.color || '#C9A227');
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
    stepReview.hidden = step !== 'review';
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
  document.getElementById('cartCloseFromReview').addEventListener('click', close);
  document.getElementById('cartCloseFromSuccess').addEventListener('click', close);
  document.getElementById('cartBackToBag').addEventListener('click', () => showStep('bag'));
  document.getElementById('cartBackToCheckout').addEventListener('click', () => showStep('checkout'));
  reviewBackBtn.addEventListener('click', () => showStep('checkout'));
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
  });

  checkoutForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkoutForm.reportValidity()) return;
    if (!isValidPhone(checkoutForm.phone.value)) {
      checkoutErrorEl.textContent = PHONE_ERROR_MSG;
      checkoutErrorEl.hidden = false;
      return;
    }

    const formData = new FormData(checkoutForm);
    pendingCustomer = {
      fullName: formData.get('fullName').toString().trim(),
      address: formData.get('address').toString().trim(),
      city: formData.get('city').toString().trim(),
      phone: formData.get('phone').toString().trim(),
    };

    reviewErrorEl.hidden = true;
    reviewTotalEl.textContent = `${total()} MAD`;
    reviewCustomerEl.innerHTML = `
      <p><strong>${pendingCustomer.fullName}</strong></p>
      <p>${pendingCustomer.address}, ${pendingCustomer.city}</p>
      <p>${pendingCustomer.phone}</p>`;
    reviewItemsEl.innerHTML = items.map((item) => `
      <div class="cart-item">
        <div class="cart-item__info">
          <h4>${item.name}</h4>
          <p>${item.detail}</p>
          <div class="cart-item__meta"><span class="cart-item__price">${item.quantity > 1 ? `${item.quantity} × ${item.unitPrice} MAD` : `${item.unitPrice} MAD`}</span></div>
        </div>
      </div>`).join('');

    showStep('review');
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

  reviewFinalizeBtn.addEventListener('click', async () => {
    // Belt-and-suspenders against double submission: a synchronous flag
    // (immune to a second click landing before disabled= takes visual
    // effect) plus the disabled attribute plus a server-side idempotency key.
    if (isSubmittingOrder || !pendingCustomer) return;
    isSubmittingOrder = true;
    reviewFinalizeBtn.disabled = true;
    reviewBackBtn.disabled = true;
    reviewFinalizeBtn.textContent = 'Traitement...';
    reviewErrorEl.hidden = true;

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

      // Order is locked in server-side — now safe to wipe the local cart so
      // a page refresh or repeat visit can never resubmit the same order.
      clear();
      checkoutForm.reset();
      pendingCustomer = null;
      clientOrderId = null;
      showStep('success');
    } catch (err) {
      reviewErrorEl.textContent = err.message;
      reviewErrorEl.hidden = false;
    } finally {
      isSubmittingOrder = false;
      reviewFinalizeBtn.disabled = false;
      reviewBackBtn.disabled = false;
      reviewFinalizeBtn.textContent = 'Finaliser la commande';
    }
  });

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
  return `
    <article class="product-card reveal">
      <span class="product-card__tag product-card__tag--gold">Bundle</span>
      <div class="product-card__bottle">${b.image ? `<img src="${b.image}" alt="${b.name}" loading="lazy">` : productVisual('bottle', '#C9A227')}</div>
      <h3>${b.name}</h3>
      <p class="product-card__notes">${content}</p>
      <p class="product-card__price">${b.price} MAD</p>
      <button type="button" class="btn btn--outline product-card__cta js-add-bundle" data-id="${b.id}" data-name="${b.name}" data-price="${b.price}" data-detail="${content.replace(/"/g, '&quot;')}">Ajouter au panier</button>
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
  const quantities = new Map(); // slug -> count
  const totalSelected = () => Array.from(quantities.values()).reduce((s, n) => s + n, 0);

  function cardsGridHTML() {
    return pack.eligibleProducts.map((p) => `
      <div class="fragrance-card fragrance-card--stepper" data-slug="${p.slug}" data-name="${p.name}">
        ${p.isBestSeller ? '<span class="product-card__tag product-card__tag--gold">Best Seller</span>' : p.isLimitedEdition ? '<span class="product-card__tag">Édition limitée</span>' : ''}
        <div class="product-card__bottle">${productMediaHTML(p)}</div>
        <h3>${p.name}</h3>
        <p class="product-card__notes">${p.notes || ''}</p>
        <div class="fragrance-card__qty qty-selector">
          <button type="button" class="qty-minus" data-slug="${p.slug}" aria-label="Retirer">−</button>
          <span class="fragrance-card__qty-value" data-slug="${p.slug}">0</span>
          <button type="button" class="qty-plus" data-slug="${p.slug}" aria-label="Ajouter">+</button>
        </div>
      </div>`).join('');
  }

  container.innerHTML = `
    <a href="#compose/size/${pack.size}" class="collection-detail__back">← Changer de collection</a>
    <p class="section__eyebrow">Composez votre ${pack.name}</p>
    <h2 class="section__title">${pack.name}</h2>
    <p class="admin-field-help" style="margin-top:-12px;margin-bottom:20px;">Vous pouvez sélectionner plusieurs fois le même parfum.</p>
    <div id="composePackProgress"></div>
    <div class="chooser-grid compose-fragrance-grid" id="composePackGrid">${cardsGridHTML()}</div>
    <div class="compose-success" id="composePackSuccess" hidden></div>
    <div class="compose-sticky-bar" id="composePackBar">
      <div class="pack-modal__recap" id="composePackRecap"><span class="pack-modal__recap-empty">Aucun parfum sélectionné</span></div>
      <button type="button" class="btn btn--gold" id="composePackCta" disabled>Ajouter au panier</button>
    </div>`;

  const progressEl = document.getElementById('composePackProgress');
  const grid = document.getElementById('composePackGrid');
  const recap = document.getElementById('composePackRecap');
  const cta = document.getElementById('composePackCta');
  const successPane = document.getElementById('composePackSuccess');
  const bar = document.getElementById('composePackBar');
  const cards = Array.from(grid.querySelectorAll('.fragrance-card'));

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
        const chip = document.createElement('span'); chip.className = 'pack-modal__chip';
        const label = document.createElement('span'); label.textContent = qty > 1 ? `${card.dataset.name} ×${qty}` : card.dataset.name;
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => setQty(slug, 0));
        chip.appendChild(label); chip.appendChild(removeBtn); recap.appendChild(chip);
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
      return;
    }
    setQty(slug, Math.max(0, current + delta));
  }

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
    cards.forEach((card) => {
      const slug = card.dataset.slug;
      const qty = quantities.get(slug) || 0;
      for (let i = 0; i < qty; i += 1) { slugs.push(slug); names.push(card.dataset.name); }
    });
    Cart.addPack(pack.id, pack.name, pack.price, slugs, names);
    grid.hidden = true;
    bar.hidden = true;
    successPane.hidden = false;
    successPane.innerHTML = composeSuccessHTML(pack.name, names);
    wireComposeSuccessActions(successPane);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  updateUI();
}

async function renderComposeFree(container) {
  container.innerHTML = '<p class="admin-field-help">Chargement...</p>';
  const config = await getFreePackConfig();
  if (!config) { container.innerHTML = '<p class="admin-field-help">Le Free Pack n\'est pas disponible pour le moment.</p>'; return; }
  cacheProducts(config.eligibleProducts);

  const selected = []; // {slug, name, price, collection}

  container.innerHTML = `
    <a href="#compose" class="collection-detail__back">← Changer de formule</a>
    <p class="section__eyebrow">${config.name}</p>
    <h2 class="section__title">Choisissez vos produits</h2>
    <p class="admin-field-help" id="composeFreePriceHint" style="margin-bottom:14px;">Chaque parfum coûte ${config.perfumePrice} MAD, chaque gel douche coûte ${config.gelDouchePrice} MAD — le prix s'additionne pour chaque produit choisi.</p>
    <div id="composeFreeProgress"></div>
    <div class="chooser-grid compose-fragrance-grid" id="composeFreeGrid">
      ${config.eligibleProducts.map((p) => `
        <button type="button" class="fragrance-card" data-slug="${p.slug}" data-name="${p.name}" data-price="${p.freePackPrice}" data-collection="${p.collectionId}">
          <span class="fragrance-card__check"><svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <div class="product-card__bottle">${productMediaHTML(p)}</div>
          <h3>${p.name}</h3>
          <p class="product-card__notes">${p.notes || ''}</p>
          <p class="product-card__price">${p.freePackPrice} MAD</p>
        </button>`).join('')}
    </div>
    <div class="compose-success" id="composeFreeSuccess" hidden></div>
    <div class="compose-sticky-bar" id="composeFreeBar">
      <div class="pack-modal__recap" id="composeFreeRecap"><span class="pack-modal__recap-empty">Aucun produit sélectionné</span></div>
      <button type="button" class="btn btn--gold" id="composeFreeCta" disabled>Ajouter au panier</button>
    </div>`;

  const progressEl = document.getElementById('composeFreeProgress');
  const grid = document.getElementById('composeFreeGrid');
  const recap = document.getElementById('composeFreeRecap');
  const cta = document.getElementById('composeFreeCta');
  const successPane = document.getElementById('composeFreeSuccess');
  const bar = document.getElementById('composeFreeBar');
  const priceHint = document.getElementById('composeFreePriceHint');
  const cards = Array.from(grid.querySelectorAll('.fragrance-card'));

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

  cards.forEach((card) => card.addEventListener('click', () => toggleCard(card.dataset.slug)));

  cta.addEventListener('click', () => {
    if (cta.disabled) return;
    const price = selected.reduce((s, i) => s + i.price, 0);
    Cart.addFreePack(config.name, price, selected.map((s) => s.slug), selected.map((s) => s.name));
    grid.hidden = true;
    bar.hidden = true;
    successPane.hidden = false;
    successPane.innerHTML = composeSuccessHTML(config.name, selected.map((s) => s.name));
    wireComposeSuccessActions(successPane);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  updateUI();
}

function composeSuccessHTML(name, itemNames) {
  return `
    <div class="pack-modal__success-icon">
      <svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <h3>${name} ajouté au panier</h3>
    <p>Vous pouvez continuer votre sélection ou passer votre commande.</p>
    <ul class="pack-modal__success-list">${itemNames.map((n) => `<li>${n}</li>`).join('')}</ul>
    <div class="compose-success__actions">
      <button type="button" class="btn btn--gold js-compose-view-cart">Voir mon panier</button>
      <a href="#compose" class="btn btn--outline">Composer un autre pack</a>
    </div>`;
}

function wireComposeSuccessActions(scope) {
  const btn = scope.querySelector('.js-compose-view-cart');
  if (btn) btn.addEventListener('click', () => Cart.open('bag'));
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
    </div>`;

  document.getElementById('receiptPrintBtn').addEventListener('click', () => window.print());
  document.getElementById('receiptPngBtn').addEventListener('click', () => downloadReceiptAsPNG(receipt));
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

  async function open(slug) {
    let product;
    try { product = await getProductBySlug(slug); } catch (e) { return; }
    nameEl.textContent = product.name;
    body.innerHTML = productDetailBodyHTML(product, true);
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
    open(btn.dataset.slug);
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
  if (settings && settings.announcementText) bar.textContent = settings.announcementText;
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
        ${settings.instagramQrImage ? `<img class="contact-card__qr" src="${settings.instagramQrImage}" alt="QR Code Instagram">` : ''}
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
  const targets = document.querySelectorAll('#homepageSections > section, .products__grid .product-card');
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
  const collectionsGrid = document.getElementById('collectionsGrid');
  const detailTitle = document.getElementById('collectionDetailTitle');
  const detailEyebrow = document.getElementById('collectionDetailEyebrow');
  const detailGrid = document.getElementById('collectionDetailGrid');
  const detailPacks = document.getElementById('collectionDetailPacks');
  const genderFilter = document.getElementById('genderFilter');

  if (!viewHome || !viewCollections || !viewDetail) return;

  let currentCollectionProducts = [];

  function applyGenderFilter(gender) {
    const filtered = gender
      ? currentCollectionProducts.filter((p) => Array.isArray(p.genders) && p.genders.includes(gender))
      : currentCollectionProducts;
    detailGrid.innerHTML = filtered.map(productCardHTML).join('');
    initRevealAnimations();
  }

  genderFilter.addEventListener('click', (e) => {
    const chip = e.target.closest('.gender-filter__chip');
    if (!chip) return;
    genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    applyGenderFilter(chip.dataset.gender);
  });

  let collectionsLoaded = false;
  async function renderCollectionsGrid() {
    if (collectionsLoaded) return;
    const collections = await api('/collections');
    collectionsGrid.innerHTML = collections.map(collectionTileHTML).join('');
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
    if (packOnly) {
      // Perfumes in a pack-only collection are never individually addable —
      // browsing lands on the pack list above; picking a pack is what reveals
      // "Now Choose Your Scents" (the existing composer flow) below.
      genderFilter.hidden = true;
      detailGrid.innerHTML = `
        <div class="pack-only-notice">
          <p>Ces parfums sont disponibles exclusivement au sein de nos packs.</p>
          <p>Choisissez votre pack ci-dessus, puis composez votre sélection de parfums.</p>
        </div>`;
    } else if (slug === 'parfums') {
      genderFilter.hidden = false;
      genderFilter.querySelectorAll('.gender-filter__chip').forEach((c) => c.classList.toggle('is-active', c.dataset.gender === ''));
      applyGenderFilter('');
    } else {
      genderFilter.hidden = true;
      detailGrid.innerHTML = data.products.map(productCardHTML).join('');
      initRevealAnimations();
    }
  }

  async function renderProductDetail(slug) {
    const mount = document.getElementById('productDetailVisual').closest('.product-detail__layout');
    let product;
    try {
      product = await getProductBySlug(slug);
    } catch (e) {
      mount.innerHTML = '<p style="padding:60px;text-align:center;">Produit introuvable.</p>';
      return;
    }
    mount.innerHTML = productDetailBodyHTML(product);
    wireProductDetailActions(mount, product);
    startVisitorCounter(mount.querySelector('.js-visitor-counter'));
    startFlashCountdown(mount.querySelector('.js-flash-countdown'));
    loadProductReviews(mount.querySelector(`#productReviews-${product.slug}`), product.slug);
  }

  const viewCompose = document.getElementById('view-compose');
  const composeContainer = document.getElementById('composeContainer');
  const viewLoyalty = document.getElementById('view-loyalty');
  const viewContact = document.getElementById('view-contact');
  const viewReceipt = document.getElementById('view-receipt');
  const receiptContainer = document.getElementById('receiptContainer');
  const allViews = [viewHome, viewCollections, viewDetail, viewProduct, viewCompose, viewLoyalty, viewContact, viewReceipt];

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

// Boot
initHomepage();
initQuickView();
initNavExtras();
initSearch();
initLoyaltyPage();
initContactPage();
initThemeSwitch();
initAnnouncementBar();
