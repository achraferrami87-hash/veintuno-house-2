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

function productCardHTML(p) {
  const tag = p.isBestSeller ? 'Best Seller' : p.isLimitedEdition ? 'Édition limitée' : p.isNew ? 'Nouveauté' : null;
  return `
    <article class="product-card reveal">
      ${tag ? `<span class="product-card__tag${tag === 'Best Seller' ? ' product-card__tag--gold' : ''}">${tag}</span>` : ''}
      <a href="#product/${p.slug}" class="product-card__bottle">${productMediaHTML(p)}</a>
      <button type="button" class="product-card__quickview js-quick-view" data-slug="${p.slug}">Aperçu rapide</button>
      <h3><a href="#product/${p.slug}">${p.name}</a></h3>
      <p class="product-card__notes">${p.notes || ''}</p>
      <p class="product-card__price">${p.price} MAD</p>
      <button type="button" class="btn btn--outline product-card__cta js-add-product" data-slug="${p.slug}">Ajouter au panier</button>
    </article>`;
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
      return { kind: 'FREE_PACK', componentSlugs: i.componentSlugs, quantity: i.quantity };
    });
  }

  function addPack(packId, packName, packPrice, componentSlugs, componentNames) {
    items.push({
      uid: 'pack-' + Date.now(), kind: 'PACK', packId, name: packName,
      unitPrice: Number(packPrice), quantity: 1, componentSlugs,
      detail: `${componentSlugs.length} produits — ${componentNames.join(', ')}`,
    });
    clearPromo(); persist(); renderAll();
  }

  function addFreePack(freePackName, unitPrice, componentSlugs, componentNames) {
    items.push({
      uid: 'freepack-' + Date.now(), kind: 'FREE_PACK', name: freePackName,
      unitPrice, quantity: 1, componentSlugs,
      detail: componentNames.join(', '),
    });
    clearPromo(); persist(); renderAll();
  }

  function addProduct(product) {
    const existing = items.find((i) => i.kind === 'PRODUCT' && i.productSlug === product.slug);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({
        uid: 'product-' + product.slug, kind: 'PRODUCT', productSlug: product.slug,
        name: product.name, unitPrice: product.price, quantity: 1,
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

  renderAll();

  return { addPack, addFreePack, addProduct, open, close };
})();

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-add-product');
  if (!btn || !Cart) return;
  const slug = btn.dataset.slug;
  try {
    const product = await getProductBySlug(slug);
    Cart.addProduct(product);
    const original = btn.textContent;
    btn.textContent = 'Ajouté ✓';
    setTimeout(() => { btn.textContent = original; }, 1400);
  } catch (err) { /* product unavailable */ }
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

async function renderComposeFormula(container) {
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
      <span class="chooser-card__title">${p.collection.name}</span>
      <span class="chooser-card__sub">${size} produits au choix</span>
      <span class="chooser-card__price">${p.price} MAD</span>
    </a>`).join('') || '<p class="admin-field-help">Aucun pack disponible pour cette taille.</p>';
}

async function renderComposePack(container, packId) {
  container.innerHTML = '<p class="admin-field-help">Chargement...</p>';
  const pack = await getPackById(packId);
  if (!pack) { container.innerHTML = '<p class="admin-field-help">Pack introuvable.</p>'; return; }
  cacheProducts(pack.eligibleProducts);

  const selected = []; // {slug, name}

  function cardsGridHTML() {
    return pack.eligibleProducts.map((p) => `
      <button type="button" class="fragrance-card" data-slug="${p.slug}" data-name="${p.name}">
        <span class="fragrance-card__check"><svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        ${p.isBestSeller ? '<span class="product-card__tag product-card__tag--gold">Best Seller</span>' : p.isLimitedEdition ? '<span class="product-card__tag">Édition limitée</span>' : ''}
        <div class="product-card__bottle">${productMediaHTML(p)}</div>
        <h3>${p.name}</h3>
        <p class="product-card__notes">${p.notes || ''}</p>
      </button>`).join('');
  }

  container.innerHTML = `
    <a href="#compose/size/${pack.size}" class="collection-detail__back">← Changer de collection</a>
    <p class="section__eyebrow">Composez votre ${pack.name}</p>
    <h2 class="section__title">${pack.name}</h2>
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
    progressEl.innerHTML = composeProgressHTML(selected.length, pack.size, 'parfum(s)');
    const isFull = selected.length >= pack.size;
    cards.forEach((card) => {
      const isSelected = card.classList.contains('is-selected');
      card.classList.toggle('is-disabled', isFull && !isSelected);
    });
    recap.innerHTML = '';
    if (selected.length === 0) {
      recap.innerHTML = '<span class="pack-modal__recap-empty">Aucun parfum sélectionné</span>';
    } else {
      selected.forEach((item) => {
        const chip = document.createElement('span'); chip.className = 'pack-modal__chip';
        const label = document.createElement('span'); label.textContent = item.name;
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => toggleCard(item.slug));
        chip.appendChild(label); chip.appendChild(removeBtn); recap.appendChild(chip);
      });
    }
    cta.disabled = selected.length !== pack.size;
    cta.textContent = cta.disabled ? 'Ajouter au panier' : `Ajouter au panier — ${pack.price} MAD`;
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
      if (selected.length >= pack.size) {
        card.classList.add('is-shaking');
        setTimeout(() => card.classList.remove('is-shaking'), 400);
        return;
      }
      card.classList.add('is-selected');
      selected.push({ slug, name: card.dataset.name });
    }
    updateUI();
  }

  cards.forEach((card) => card.addEventListener('click', () => toggleCard(card.dataset.slug)));

  cta.addEventListener('click', () => {
    if (cta.disabled) return;
    Cart.addPack(pack.id, pack.name, pack.price, selected.map((s) => s.slug), selected.map((s) => s.name));
    grid.hidden = true;
    bar.hidden = true;
    successPane.hidden = false;
    successPane.innerHTML = composeSuccessHTML(pack.name, selected.map((s) => s.name));
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
    <div id="composeFreeProgress"></div>
    <div class="chooser-grid compose-fragrance-grid" id="composeFreeGrid">
      ${config.eligibleProducts.map((p) => `
        <button type="button" class="fragrance-card" data-slug="${p.slug}" data-name="${p.name}" data-price="${p.price}" data-collection="${p.collectionId}">
          <span class="fragrance-card__check"><svg viewBox="0 0 24 24"><path d="M5 13 l5 5 L20 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <div class="product-card__bottle">${productMediaHTML(p)}</div>
          <h3>${p.name}</h3>
          <p class="product-card__notes">${p.notes || ''}</p>
          <p class="product-card__price">${p.price} MAD</p>
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
    const total = selected.reduce((s, i) => s + i.price, 0);
    cta.disabled = selected.length < config.minItems;
    cta.textContent = cta.disabled ? 'Ajouter au panier' : `Ajouter au panier — ${total} MAD`;
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
    const total = selected.reduce((s, i) => s + i.price, 0);
    Cart.addFreePack(config.name, total, selected.map((s) => s.slug), selected.map((s) => s.name));
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
        <p class="product-detail__price">${p.price} MAD</p>
        ${p.volume ? `<span class="product-detail__volume">${p.volume}</span>` : ''}
      </div>
      <p class="product-detail__availability ${p.stock > 0 ? 'is-available' : 'is-unavailable'}">${p.stock > 0 ? 'En stock' : 'Rupture de stock'}</p>
      <p class="visitor-counter js-visitor-counter" id="${counterId}" data-count="0"></p>
      ${p.description ? `<p class="product-detail__description">${p.description}</p>` : ''}
      ${notesHTML}
      ${isPerfume ? `<p class="product-detail__disclaimer">${(siteSettingsCache && siteSettingsCache.perfumeDisclaimer) || 'Inspiré des plus grands parfums — non affilié aux marques citées.'}</p>` : ''}
      <div class="product-detail__actions">
        <div class="qty-selector">
          <button type="button" class="qty-minus" aria-label="Diminuer">−</button>
          <input type="number" class="qty-input" value="1" min="1">
          <button type="button" class="qty-plus" aria-label="Augmenter">+</button>
        </div>
        <button type="button" class="btn btn--gold js-detail-add" data-slug="${p.slug}" ${p.stock <= 0 ? 'disabled' : ''}>Ajouter au panier</button>
      </div>
    </div>`;
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

function wireProductDetailActions(scope, product) {
  const qtyInput = scope.querySelector('.qty-input');
  scope.querySelector('.qty-minus').addEventListener('click', () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  scope.querySelector('.qty-plus').addEventListener('click', () => {
    qtyInput.value = Number(qtyInput.value) + 1;
  });
  const addBtn = scope.querySelector('.js-detail-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      for (let i = 0; i < qty; i += 1) Cart.addProduct(product);
      const original = addBtn.textContent;
      addBtn.textContent = 'Ajouté ✓';
      setTimeout(() => { addBtn.textContent = original; }, 1400);
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
      panel.innerHTML = collections.map((c) => `<a href="#collection/${c.slug}">${c.name}</a>`).join('');
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Vérification...';
    try {
      const data = await api('/loyalty/lookup', { method: 'POST', body: JSON.stringify({ fullName, phone }) });
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div class="loyalty-result__balance">
          <p class="section__eyebrow">Bonjour ${data.fullName.split(' ')[0]}</p>
          <p class="loyalty-result__points">${data.balance} <span>points</span></p>
          ${data.nextReward ? `<p class="loyalty-result__next">Encore ${(data.nextReward.pointsRequired - data.balance).toFixed(2)} point(s) pour : ${data.nextReward.name}</p>` : ''}
        </div>
        ${data.availableRewards.length ? `
          <div class="loyalty-result__rewards">
            <h4>Récompenses accessibles</h4>
            <ul>${data.availableRewards.map((r) => `<li>${r.name} — ${r.pointsRequired} pts</li>`).join('')}</ul>
          </div>` : ''}
        <div class="loyalty-result__history">
          <h4>Historique</h4>
          <ul>${data.history.slice(0, 8).map((h) => `<li><span>${new Date(h.date).toLocaleDateString('fr-FR')}</span><span>${h.points > 0 ? '+' : ''}${h.points} pts${h.note ? ` — ${h.note}` : ''}</span></li>`).join('') || '<li>Aucun mouvement pour le moment.</li>'}</ul>
        </div>`;
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
    const filtered = gender ? currentCollectionProducts.filter((p) => p.gender === gender) : currentCollectionProducts;
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

    if (data.packs && data.packs.length) {
      const featuredIndex = data.packs.length === 3 ? 1 : -1;
      detailPacks.innerHTML = `
        <p class="section__eyebrow">Formules</p>
        <h3 class="section__title" style="margin-bottom:28px;font-size:26px;">Composez votre pack</h3>
        <div class="packs__grid">
          ${data.packs.map((pack, i) => `
            <div class="pack-card${i === featuredIndex ? ' pack-card--featured' : ''}">
              ${i === featuredIndex ? '<span class="pack-card__badge">Le plus choisi</span>' : ''}
              <h3>${pack.name}</h3>
              <p class="pack-card__count">${pack.size} produits</p>
              <p class="pack-card__price">${pack.price} <span>MAD</span></p>
              <ul><li>${pack.size} produits au choix</li><li>Livraison offerte</li><li>Paiement à la livraison</li></ul>
              <a href="#compose/pack/${pack.id}" class="btn btn--${i === featuredIndex ? 'gold' : 'outline'} btn--full">Composer</a>
            </div>`).join('')}
        </div>`;
      detailPacks.hidden = false;
    }

    currentCollectionProducts = data.products;
    if (slug === 'parfums') {
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
  }

  const viewCompose = document.getElementById('view-compose');
  const composeContainer = document.getElementById('composeContainer');
  const viewLoyalty = document.getElementById('view-loyalty');
  const viewContact = document.getElementById('view-contact');
  const allViews = [viewHome, viewCollections, viewDetail, viewProduct, viewCompose, viewLoyalty, viewContact];

  async function route() {
    const hash = window.location.hash.replace('#', '');
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

// Boot
initHomepage();
initQuickView();
initNavExtras();
initSearch();
initLoyaltyPage();
initContactPage();
