// ===========================
// API helper (admin)
// ===========================
async function adminApi(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    if (!location.pathname.endsWith('/admin/login.html') && !location.pathname.endsWith('/admin/')) {
      location.href = '/admin/login.html';
    }
    throw new Error('Non authentifié.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

async function requireAuth() {
  try {
    const me = await adminApi('/me');
    return me;
  } catch (e) {
    location.href = '/admin/login.html';
    return null;
  }
}

// ===========================
// Toast notifications
// ===========================
function toast(message, type = 'success') {
  let host = document.getElementById('adminToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'adminToastHost';
    host.className = 'admin-toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `admin-toast admin-toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ===========================
// Confirm dialog (promise-based)
// ===========================
function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-confirm-overlay';
    overlay.innerHTML = `
      <div class="admin-confirm">
        <p>${message}</p>
        <div class="admin-confirm__actions">
          <button type="button" class="admin-btn admin-btn--ghost" data-action="cancel">Annuler</button>
          <button type="button" class="admin-btn admin-btn--danger" data-action="confirm">Confirmer</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.dataset.action === 'cancel') { overlay.remove(); resolve(false); }
      if (e.target.dataset.action === 'confirm') { overlay.remove(); resolve(true); }
    });
  });
}

// ===========================
// Sidebar layout
// ===========================
const NAV_ITEMS = [
  { href: 'dashboard.html', label: 'Aperçu', icon: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z' },
  { href: 'products.html', label: 'Produits', icon: 'M3 7l2-4h14l2 4M3 7h18M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M9 11a3 3 0 0 0 6 0' },
  { href: 'collections.html', label: 'Collections', icon: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z' },
  { href: 'packs.html', label: 'Packs & Free Pack', icon: 'M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: 'bundles.html', label: 'Bundles', icon: 'M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4h-4Z' },
  { href: 'promo-codes.html', label: 'Codes promo', icon: 'M20.59 13.41 11 3.83a2 2 0 0 0-1.42-.58H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.59 9.59a2 2 0 0 0 2.82 0l4.59-4.59a2 2 0 0 0 0-2.82ZM7 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z' },
  { href: 'orders.html', label: 'Commandes', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0' },
  { href: 'customers.html', label: 'Clients', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { href: 'inventory.html', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: 'homepage-editor.html', label: 'Homepage', icon: 'M3 3h18v18H3V3Zm0 6h18M9 21V9' },
  { href: 'navbar.html', label: 'Navbar', icon: 'M4 6h16M4 12h16M4 18h16' },
  { href: 'loyalty.html', label: 'Fidélité', icon: 'M12 2 15 8.5 22 9.3 17 14 18.3 21 12 17.5 5.7 21 7 14 2 9.3 9 8.5 12 2Z' },
  { href: 'reviews.html', label: 'Avis clients', icon: 'M12 17.3 6.2 21l1.6-6.9L2 9.2l7-.6L12 2l3 6.6 7 .6-5.8 4.9 1.6 6.9z' },
  { href: 'characteristics.html', label: 'Caractéristiques', icon: 'M4 4h16v4H4V4Zm0 6h10v4H4v-4Zm0 6h16v4H4v-4Z' },
  { href: 'settings.html', label: 'Réglages', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 2h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6a7.4 7.4 0 0 0 .1-1.2Z' },
];

function renderAdminLayout(activeHref, admin) {
  const shell = document.getElementById('adminShell');
  if (!shell) return;

  const navHTML = NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="admin-nav__link${item.href === activeHref ? ' is-active' : ''}">
      <svg viewBox="0 0 24 24"><path d="${item.icon}" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>${item.label}</span>
    </a>`).join('');

  shell.insertAdjacentHTML('afterbegin', `
    <aside class="admin-sidebar">
      <a href="dashboard.html" class="admin-sidebar__brand">XXI<span>VEINTUNO</span> HOUSE</a>
      <p class="admin-sidebar__tag">Admin</p>
      <nav class="admin-nav">${navHTML}</nav>
      <div class="admin-sidebar__footer">
        <a href="/" target="_blank" class="admin-sidebar__view-store">Voir le site ↗</a>
        <p class="admin-sidebar__user">${admin ? admin.name : ''}</p>
        <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" id="adminLogoutBtn">Déconnexion</button>
      </div>
    </aside>`);

  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await adminApi('/logout', { method: 'POST' });
      location.href = '/admin/login.html';
    });
  }
}

async function initAdminPage(activeHref) {
  const admin = await requireAuth();
  if (!admin) return null;
  renderAdminLayout(activeHref, admin);
  return admin;
}

// ===========================
// Drag & drop reorder (native HTML5 DnD, no library)
// ===========================
function makeSortable(listEl, onReorder) {
  let draggedEl = null;

  listEl.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[data-sortable-id]');
    if (!row) return;
    draggedEl = row;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.classList.add('is-dragging'), 0);
  });

  listEl.addEventListener('dragend', (e) => {
    const row = e.target.closest('[data-sortable-id]');
    if (row) row.classList.remove('is-dragging');
    draggedEl = null;
  });

  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const row = e.target.closest('[data-sortable-id]');
    if (!row || row === draggedEl || !draggedEl) return;
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    listEl.insertBefore(draggedEl, before ? row : row.nextSibling);
  });

  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const orderedIds = Array.from(listEl.querySelectorAll('[data-sortable-id]')).map((el) => el.dataset.sortableId);
    onReorder(orderedIds);
  });
}

// ===========================
// Simple SVG line chart (no external lib)
// ===========================
function renderLineChart(container, points, opts = {}) {
  const width = opts.width || 640;
  const height = opts.height || 180;
  const pad = 24;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = (width - pad * 2) / Math.max(1, points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (p.value / max) * (height - pad * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0]},${height - pad} L${coords[0][0]},${height - pad} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="admin-chart">
      <path d="${areaPath}" fill="url(#chartGradient)" opacity="0.15"></path>
      <path d="${linePath}" fill="none" stroke="#C9A227" stroke-width="2"></path>
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#C9A227"></stop>
          <stop offset="100%" stop-color="#C9A227" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
    </svg>`;
}

function formatMoney(n) {
  return `${(Math.round(n * 100) / 100).toLocaleString('fr-FR')} MAD`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
