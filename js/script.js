/* ============================================================
   ConnectKart — Main JavaScript
   js/script.js
   All shared functionality, data loading, cart, utilities.
   ============================================================ */

'use strict';

/* ============================================================
   1. GLOBAL STATE
   ============================================================ */
const CK = {
  products: [],
  restaurants: [],
  discounts: [],
  resale: [],
  deliveryConfig: null,
  cart: [],        // loaded from localStorage
  resaleListings: [], // user-submitted resale items
  currentPage: '',
};

/* ============================================================
   2. INITIALISATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Detect current page
  const path = location.pathname;
  if (path.includes('order-confirmation')) CK.currentPage = 'confirmation';
  else if (path.includes('products'))    CK.currentPage = 'products';
  else if (path.includes('discounts'))   CK.currentPage = 'discounts';
  else if (path.includes('resale'))      CK.currentPage = 'resale';
  else if (path.includes('donations'))   CK.currentPage = 'donations';
  else if (path.includes('account'))     CK.currentPage = 'account';
  else if (path.includes('login'))       CK.currentPage = 'login';
  else if (path.includes('cart'))        CK.currentPage = 'cart';
  else if (path.includes('checkout'))    CK.currentPage = 'checkout';
  else if (path.includes('about'))       CK.currentPage = 'about';
  else if (path.includes('contact'))     CK.currentPage = 'contact';
  else                                   CK.currentPage = 'home';

  // Load cart & resale from localStorage
  CK.cart           = loadFromStorage('ck_cart', []);
  CK.resaleListings = loadFromStorage('ck_resale_listings', []);

  // Load data from embedded CK_DATA (works with file:// and http://)
  CK.products       = CK_DATA.products;
  CK.restaurants    = CK_DATA.restaurants;
  CK.discounts      = CK_DATA.discounts;
  CK.resale         = CK_DATA.resale;
  CK.deliveryConfig = CK_DATA.delivery;

  // Init global UI
  initNavbar();
  updateCartBadge();
  initToastContainer();

  // Run page-specific init
  const pageInits = {
    home:         initHomePage,
    products:     initProductsPage,
    discounts:    initDiscountsPage,
    resale:       initResalePage,
    donations:    initDonationsPage,
    cart:         initCartPage,
    checkout:     initCheckoutPage,
    confirmation: initConfirmationPage,
    about:        initAboutPage,
    contact:      initContactPage,
    login:        initLoginPage,
    account:      initAccountPage,
  };
  const fn = pageInits[CK.currentPage];
  if (fn) fn();

  // Update navbar auth state on every page
  updateNavAuth();
});

/* ============================================================
   3. DATA LOADING HELPERS
   ============================================================ */
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
function loadFromStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ============================================================
   4. NAVBAR
   ============================================================ */
function initNavbar() {
  // Hamburger toggle
  const ham = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  if (ham && links) {
    ham.addEventListener('click', () => {
      links.classList.toggle('open');
    });
  }
  // Mark active link
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === current || (current === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}

/* ============================================================
   5. CART FUNCTIONS
   ============================================================ */
function addToCart(product) {
  const existing = CK.cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    CK.cart.push({ ...product, qty: 1 });
  }
  saveToStorage('ck_cart', CK.cart);
  updateCartBadge();
  showToast(`"${product.name}" added to cart!`, 'success');
}

function removeFromCart(productId) {
  CK.cart = CK.cart.filter(i => i.id !== productId);
  saveToStorage('ck_cart', CK.cart);
  updateCartBadge();
}

function updateCartQty(productId, qty) {
  const item = CK.cart.find(i => i.id === productId);
  if (!item) return;
  if (qty <= 0) { removeFromCart(productId); return; }
  item.qty = qty;
  saveToStorage('ck_cart', CK.cart);
  updateCartBadge();
}

function getCartTotal() {
  return CK.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function getCartCount() {
  return CK.cart.reduce((sum, i) => sum + i.qty, 0);
}

function updateCartBadge() {
  const badges = document.querySelectorAll('.cart-count');
  const count  = getCartCount();
  badges.forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

/* ============================================================
   6. DELIVERY & FEE CALCULATIONS (configurable)
   ============================================================ */
function calcDeliveryCharge(subtotal) {
  if (!CK.deliveryConfig) return 0;
  const tier = CK.deliveryConfig.deliveryTiers.find(
    t => subtotal >= t.minOrderValue && subtotal <= t.maxOrderValue
  );
  return tier ? tier.deliveryCharge : 0;
}

function calcPlatformFee(subtotal) {
  if (!CK.deliveryConfig) return 5;
  const cfg = CK.deliveryConfig.platformFee;
  if (cfg.type === 'percentage') {
    const fee = (subtotal * cfg.value) / 100;
    return Math.min(Math.max(fee, cfg.minFee), cfg.maxFee);
  }
  return cfg.value;
}

function calcCouponDiscount(subtotal, code) {
  if (!code || !CK.discounts.length) return { discount: 0, message: '' };
  const coupon = CK.discounts.find(d => d.code === code.toUpperCase().trim());
  if (!coupon) return { discount: 0, message: 'Invalid coupon code.' };
  if (subtotal < coupon.minOrder)
    return { discount: 0, message: `Minimum order ₹${coupon.minOrder} required.` };
  let disc = 0;
  if (coupon.discountType === 'percentage') {
    disc = Math.min((subtotal * coupon.discountValue) / 100, coupon.maxDiscount);
  } else if (coupon.discountType === 'flat') {
    disc = Math.min(coupon.discountValue, coupon.maxDiscount);
  }
  return { discount: disc, coupon, message: `✓ Coupon applied! You save ₹${disc.toFixed(0)}` };
}

function calcOrderSummary(subtotal, couponCode) {
  const couponResult  = calcCouponDiscount(subtotal, couponCode);
  const afterDiscount = subtotal - couponResult.discount;
  const delivery      = calcDeliveryCharge(afterDiscount);
  const platformFee   = calcPlatformFee(afterDiscount);
  const total         = afterDiscount + delivery + platformFee;
  return {
    subtotal,
    couponDiscount: couponResult.discount,
    coupon:         couponResult.coupon,
    couponMessage:  couponResult.message,
    afterDiscount,
    delivery,
    platformFee,
    total,
  };
}

/* ============================================================
   7. UTILITY FUNCTIONS
   ============================================================ */
function formatCurrency(n) { return `₹${Number(n).toLocaleString('en-IN')}`; }

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Returns a coloured SVG data URI placeholder for any image that comes from
 * an external image CDN (picsum, unsplash). If the URL is already a data:
 * URI (user-uploaded photo) it is returned unchanged.
 * This guarantees every card renders an image even with no internet.
 */
const PLACEHOLDER_PALETTES = [
  ['#FF6B35','#fff'], ['#3B82F6','#fff'], ['#10B981','#fff'],
  ['#8B5CF6','#fff'], ['#F59E0B','#fff'], ['#EC4899','#fff'],
  ['#14B8A6','#fff'], ['#F97316','#fff'], ['#6366F1','#fff'],
];
function makePlaceholder(label, w, h) {
  const idx   = Math.abs([...label].reduce((a,c) => a + c.charCodeAt(0), 0)) % PLACEHOLDER_PALETTES.length;
  const [bg, fg] = PLACEHOLDER_PALETTES[idx];
  const words = label.split(/\s+/).slice(0, 2).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ` +
    `font-family="system-ui,sans-serif" font-size="${Math.round(h * 0.1)}" fill="${fg}" font-weight="700">${sanitize(words)}</text>` +
    `</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function getImgSrc(url, label, w = 400, h = 300) {
  if (!url || url.startsWith('data:')) return url || makePlaceholder(label, w, h);
  return url;
}
/** Returns an onerror attribute string that swaps in a placeholder on load failure */
function imgFallback(label, w = 400, h = 300) {
  return `onerror="this.onerror=null;this.src='${makePlaceholder(label, w, h)}'"`;
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   8. TOAST NOTIFICATIONS
   ============================================================ */
function initToastContainer() {
  if (!document.querySelector('.toast-container')) {
    const tc = document.createElement('div');
    tc.className = 'toast-container';
    document.body.appendChild(tc);
  }
}

function showToast(message, type = 'default', duration = 3000) {
  const tc = document.querySelector('.toast-container');
  if (!tc) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', default: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${sanitize(message)}</span>`;
  tc.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ============================================================
   9. PRODUCT CARD BUILDER
   ============================================================ */
function buildProductCard(p) {
  const inCart = CK.cart.find(i => i.id === p.id);
  const qty    = inCart ? inCart.qty : 0;
  const tagsHtml = (p.tags || []).map(t => `<span class="tag">${sanitize(t)}</span>`).join('');
  return `
  <div class="product-card" data-id="${p.id}">
    <div class="product-img">
      <img src="${getImgSrc(p.image, p.name, 400, 300)}" alt="${sanitize(p.name)}" loading="lazy" ${imgFallback(p.name, 400, 300)}>
      ${p.offer ? `<span class="product-offer">${sanitize(p.offer)}</span>` : ''}
      <div class="product-tags">
        ${(p.tags || []).includes('veg') ? '<span class="badge badge-green" title="Vegetarian">VEG</span>' : ''}
        ${(p.tags || []).includes('non-veg') ? '<span class="badge badge-primary" title="Non-Vegetarian">NON-VEG</span>' : ''}
        ${(p.tags || []).includes('bestseller') ? '<span class="badge badge-yellow">⭐</span>' : ''}
      </div>
    </div>
    <div class="product-body">
      <div class="product-name">${sanitize(p.name)}</div>
      <div class="product-seller">🏪 ${sanitize(p.restaurantName || '')}</div>
      <div class="product-description">${sanitize(p.description || '')}</div>
      <div class="product-price-row">
        <span class="price-current">${formatCurrency(p.price)}</span>
        ${p.originalPrice > p.price ? `<span class="price-original">${formatCurrency(p.originalPrice)}</span>` : ''}
        ${p.discount > 0 ? `<span class="price-discount">${p.discount}% OFF</span>` : ''}
      </div>
      <div class="product-footer">
        <span class="delivery-info">🚚 ${sanitize(p.deliveryTime || 'Check delivery')}</span>
        ${qty === 0
          ? `<button class="add-btn" onclick="handleAddToCart('${p.id}')">+ Add</button>`
          : `<div class="qty-control">
               <button onclick="handleQtyChange('${p.id}', -1)">−</button>
               <span>${qty}</span>
               <button onclick="handleQtyChange('${p.id}', 1)">+</button>
             </div>`
        }
      </div>
      <div class="rating-row mt-1">
        <span class="stars">${renderStars(p.rating)}</span>
        <span>${p.rating}</span>
        <span class="count">(${p.reviews} reviews)</span>
        ${!p.available ? '<span class="badge badge-surface">Unavailable</span>' : ''}
      </div>
    </div>
  </div>`;
}

function handleAddToCart(productId) {
  const product = CK.products.find(p => p.id === productId);
  if (!product) return;
  if (!product.available) { showToast('Product is currently unavailable', 'error'); return; }
  addToCart(product);
  // Re-render product card in place
  rerenderProductCard(productId);
}

function handleQtyChange(productId, delta) {
  const item = CK.cart.find(i => i.id === productId);
  const newQty = item ? item.qty + delta : delta;
  updateCartQty(productId, newQty);
  rerenderProductCard(productId);
}

function rerenderProductCard(productId) {
  const cards = document.querySelectorAll(`[data-id="${productId}"]`);
  cards.forEach(card => {
    const product = CK.products.find(p => p.id === productId);
    if (!product) return;
    const temp = document.createElement('div');
    temp.innerHTML = buildProductCard(product);
    const newCard = temp.firstElementChild;
    card.replaceWith(newCard);
  });
}

/* ============================================================
   10. HOME PAGE
   ============================================================ */
function initHomePage() {
  renderHomeCategories();
  renderFeaturedProducts();
  renderRestaurants();
  renderHomeDeals();
  initHomeSearch();
}

function renderHomeCategories() {
  const el = document.getElementById('homeCategories');
  if (!el) return;
  const cats = [
    { icon: '🍕', label: 'Food',       val: 'food'        },
    { icon: '☕', label: 'Beverages',   val: 'beverages'   },
    { icon: '🛒', label: 'Grocery',     val: 'grocery'     },
    { icon: '📱', label: 'Electronics', val: 'electronics' },
    { icon: '💪', label: 'Fitness',     val: 'fitness'     },
    { icon: '🏠', label: 'Home',        val: 'home & decor'},
  ];
  el.innerHTML = cats.map(c => `
    <a class="cat-chip" href="pages/products.html?cat=${encodeURIComponent(c.val)}">
      <div class="cat-chip-icon">${c.icon}</div>
      <div class="cat-chip-label">${c.label}</div>
    </a>`).join('');
}

function renderFeaturedProducts() {
  const el = document.getElementById('featuredProducts');
  if (!el) return;
  if (!CK.products.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🛍</div><h3>Products unavailable</h3><p>Could not load products. Please try refreshing the page.</p></div>';
    return;
  }
  el.innerHTML = CK.products.slice(0, 8).map(p => buildProductCard(p)).join('');
}

function renderRestaurants() {
  const el = document.getElementById('homeRestaurants');
  if (!el) return;
  if (!CK.restaurants.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🍽️</div><h3>Restaurants unavailable</h3><p>Could not load restaurant data. Please try refreshing.</p></div>';
    return;
  }
  el.innerHTML = CK.restaurants.slice(0, 6).map(r => buildRestaurantCard(r)).join('');
}

function renderHomeDeals() {
  const el = document.getElementById('homeDeals');
  if (!el) return;
  if (!CK.discounts.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏷️</div><h3>Deals unavailable</h3><p>Could not load deals. Please try refreshing.</p></div>';
    return;
  }
  el.innerHTML = CK.discounts.slice(0, 4).map(d => buildDealCard(d)).join('');
}

function initHomeSearch() {
  const input = document.getElementById('heroSearch');
  const btn   = document.getElementById('heroSearchBtn');
  if (!btn) return;
  const doSearch = () => {
    const q = input ? input.value.trim() : '';
    if (q) window.location.href = `pages/products.html?q=${encodeURIComponent(q)}`;
    else    window.location.href = 'pages/products.html';
  };
  if (btn)   btn.addEventListener('click', doSearch);
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function buildRestaurantCard(r) {
  const tagsHtml = (r.tags || []).map(t => `<span class="tag">${sanitize(t)}</span>`).join('');
  return `
  <div class="restaurant-card">
    <div class="restaurant-img">
      <img src="${getImgSrc(r.image, r.name, 400, 200)}" alt="${sanitize(r.name)}" loading="lazy" ${imgFallback(r.name, 400, 200)}>
      <span class="rest-status ${r.open ? 'open' : 'closed'}">${r.open ? 'OPEN' : 'CLOSED'}</span>
    </div>
    <div class="restaurant-body">
      <div class="restaurant-name">${sanitize(r.name)}</div>
      <div class="restaurant-meta">
        <span>⭐ ${r.rating} (${r.reviews})</span>
        <span>🚚 ${sanitize(r.deliveryTime)}</span>
        <span>Min ₹${r.minOrder}</span>
      </div>
      <div style="margin-bottom:10px;font-size:.78rem;color:var(--text-muted)">${sanitize(r.cuisine)}</div>
      <div style="margin-bottom:8px">${tagsHtml}</div>
      ${r.offer ? `<div class="restaurant-offer">🏷️ ${sanitize(r.offer)}</div>` : ''}
    </div>
  </div>`;
}

function buildDealCard(d) {
  return `
  <div class="deal-card" onclick="copyCode('${d.code}')">
    <img class="deal-card-bg" src="${getImgSrc(d.image, d.title, 600, 250)}" alt="${sanitize(d.title)}" loading="lazy" ${imgFallback(d.title, 600, 250)}>
    <div class="deal-card-overlay">
      <div class="deal-card-badge"><span class="badge badge-yellow">${sanitize(d.badge)}</span></div>
      <h3>${sanitize(d.title)}</h3>
      <p>${sanitize(d.subtitle)}</p>
      <span class="deal-code">🏷️ ${sanitize(d.code)} — Tap to copy</span>
    </div>
  </div>`;
}

function copyCode(code) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(`Code "${code}" copied!`, 'success');
    }).catch(() => {
      fallbackCopyCode(code);
    });
  } else {
    fallbackCopyCode(code);
  }
}

function fallbackCopyCode(code) {
  try {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`Code "${code}" copied!`, 'success');
  } catch {
    showToast(`Code: ${code} (copy manually)`, 'default');
  }
}

/* ============================================================
   11. PRODUCTS PAGE
   ============================================================ */
function initProductsPage() {
  if (!CK.products.length) {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><h3>Products unavailable</h3><p>Could not load products. Please run the site via a local server (not file://).</p></div>';
    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = '0 products';
    return;
  }
  const params  = new URLSearchParams(location.search);
  const initCat = params.get('cat') || 'all';
  const initQ   = params.get('q')   || '';

  const searchInput = document.getElementById('productSearch');
  const catFilter   = document.getElementById('catFilter');
  const sortFilter  = document.getElementById('sortFilter');
  const grid        = document.getElementById('productsGrid');
  if (!grid) return;

  if (searchInput && initQ) searchInput.value = initQ;
  if (catFilter && initCat !== 'all') {
    const opt = [...catFilter.options].find(o => o.value === initCat);
    if (opt) catFilter.value = initCat;
  }

  function render() {
    let items = [...CK.products];
    const q   = searchInput ? searchInput.value.toLowerCase() : '';
    const cat = catFilter   ? catFilter.value : 'all';
    const srt = sortFilter  ? sortFilter.value : 'default';

    if (q)           items = items.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    if (cat !== 'all') items = items.filter(p => p.category === cat);
    if (srt === 'price-asc')   items.sort((a,b) => a.price - b.price);
    if (srt === 'price-desc')  items.sort((a,b) => b.price - a.price);
    if (srt === 'rating')      items.sort((a,b) => b.rating - a.rating);
    if (srt === 'discount')    items.sort((a,b) => b.discount - a.discount);

    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = `${items.length} product${items.length !== 1 ? 's' : ''}`;

    if (items.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><h3>No products found</h3><p>Try a different search or category.</p></div>`;
    } else {
      grid.innerHTML = items.map(p => buildProductCard(p)).join('');
    }
  }

  if (searchInput) searchInput.addEventListener('input', debounce(render));
  if (catFilter)   catFilter.addEventListener('change', render);
  if (sortFilter)  sortFilter.addEventListener('change', render);
  render();
}

/* ============================================================
   12. DISCOUNTS PAGE
   ============================================================ */
function initDiscountsPage() {
  const grid = document.getElementById('discountsGrid');
  if (grid) {
    if (!CK.discounts.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏷️</div><h3>Deals unavailable</h3><p>Could not load deals. Please try refreshing.</p></div>';
    } else {
      grid.innerHTML = CK.discounts.map(d => buildDiscountDetailCard(d)).join('');
    }
  }
  // Also render discounted products
  const discGrid = document.getElementById('discountedProducts');
  if (discGrid) {
    if (!CK.products.length) {
      discGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🛍</div><h3>Products unavailable</h3><p>Could not load products.</p></div>';
    } else {
      const onSale = CK.products.filter(p => p.discount > 0).sort((a,b) => b.discount - a.discount);
      discGrid.innerHTML = onSale.map(p => buildProductCard(p)).join('');
    }
  }
  // Populate coupon table (discount page has an inline script that also tries this; populate here too)
  populateCouponTable();
}

function populateCouponTable() {
  const tbody = document.getElementById('couponTableBody');
  if (!tbody || !CK.discounts.length) return;
  tbody.innerHTML = CK.discounts.map(d => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:12px 16px;font-weight:700;color:var(--primary)">${d.code}</td>
      <td style="padding:12px 16px">${d.discountType === 'percentage' ? d.discountValue + '% OFF' : d.discountType === 'flat' ? '₹' + d.discountValue + ' OFF' : d.discountType.toUpperCase()}</td>
      <td style="padding:12px 16px">₹${d.minOrder}</td>
      <td style="padding:12px 16px;text-transform:capitalize">${d.category}</td>
      <td style="padding:12px 16px">${d.validUntil}</td>
      <td style="padding:12px 16px"><button class="btn btn-primary btn-sm" onclick="copyCode('${d.code}')">📋 Copy</button></td>
    </tr>`).join('');
}

function buildDiscountDetailCard(d) {
  return `
  <div class="deal-card" onclick="copyCode('${d.code}')">
    <img class="deal-card-bg" src="${getImgSrc(d.image, d.title, 600, 250)}" alt="${sanitize(d.title)}" loading="lazy" ${imgFallback(d.title, 600, 250)}>
    <div class="deal-card-overlay" style="padding:20px">
      <div class="deal-card-badge"><span class="badge badge-yellow">${sanitize(d.badge)}</span></div>
      <h3>${sanitize(d.title)}</h3>
      <p>${sanitize(d.subtitle)}</p>
      <p style="font-size:.78rem;margin-bottom:6px;opacity:.8">Min order ₹${d.minOrder} · Valid till ${d.validUntil}</p>
      <span class="deal-code">🏷️ ${sanitize(d.code)} — Tap to copy</span>
    </div>
  </div>`;
}

/* ============================================================
   13. RESALE PAGE
   ============================================================ */
function initResalePage() {
  renderResaleListings();
  initResaleSubmitForm();
}

function renderResaleListings() {
  const grid = document.getElementById('resaleGrid');
  if (!grid) return;
  const catFilter   = document.getElementById('resaleCatFilter');
  const sortFilter  = document.getElementById('resaleSortFilter');
  const searchInput = document.getElementById('resaleSearch');

  function render() {
    // Always read fresh merged list so newly submitted listings appear
    let items = [...CK.resale, ...CK.resaleListings];
    const q   = searchInput ? searchInput.value.toLowerCase() : '';
    const cat = catFilter   ? catFilter.value : 'all';
    const srt = sortFilter  ? sortFilter.value : 'default';
    if (q)             items = items.filter(r => r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    if (cat !== 'all') items = items.filter(r => r.category === cat);
    if (srt === 'price-asc')  items.sort((a,b) => a.price - b.price);
    if (srt === 'price-desc') items.sort((a,b) => b.price - a.price);
    if (srt === 'newest')     items.sort((a,b) => new Date(b.postedDate) - new Date(a.postedDate));

    if (items.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📦</div><h3>No listings found</h3><p>Be the first to list!</p></div>`;
    } else {
      grid.innerHTML = items.map(r => buildResaleCard(r)).join('');
    }
  }

  // Attach listeners only once (guard against re-registration on re-render)
  if (!grid.dataset.listenersAttached) {
    if (catFilter)   catFilter.addEventListener('change', render);
    if (sortFilter)  sortFilter.addEventListener('change', render);
    if (searchInput) searchInput.addEventListener('input', debounce(render));
    grid.dataset.listenersAttached = 'true';
  }
  render();
}

function buildResaleCard(r) {
  const condClass = { 'New': 'condition-new', 'Excellent': 'condition-excellent', 'Very Good': 'condition-very-good', 'Good': 'condition-good', 'Fair': 'condition-fair' };
  const savings   = r.originalPrice ? Math.round(((r.originalPrice - r.price) / r.originalPrice) * 100) : 0;
  return `
  <div class="resale-card">
    <div class="resale-img">
      <img src="${getImgSrc(r.image, r.title, 400, 300)}" alt="${sanitize(r.title)}" loading="lazy" ${imgFallback(r.title, 400, 300)}>
      <span class="condition-badge ${condClass[r.condition] || 'condition-good'}">${sanitize(r.condition)}</span>
      ${r.verified ? '<span class="verified-badge">✓ Verified</span>' : ''}
    </div>
    <div class="resale-body">
      <div class="resale-title">${sanitize(r.title)}</div>
      <div class="resale-price-row">
        <span class="price-current">${formatCurrency(r.price)}</span>
        ${r.originalPrice ? `<span class="price-original">${formatCurrency(r.originalPrice)}</span>` : ''}
        ${savings > 0 ? `<span class="resale-savings">${savings}% saved</span>` : ''}
      </div>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${sanitize(r.description || '')}</p>
      <div class="seller-info">
        <div class="seller-avatar">${getInitials(r.sellerName || 'U')}</div>
        <div class="seller-details">
          <h4>${sanitize(r.sellerName || 'Seller')}</h4>
          <p>📍 ${sanitize(r.sellerLocation || 'Unknown')} · ⭐ ${r.sellerRating || 'N/A'} (${r.sellerTransactions || 0} sales)</p>
        </div>
      </div>
      <button class="btn btn-outline btn-sm btn-full mt-2 contact-seller-btn" data-seller="${sanitize(r.sellerName || 'Seller')}" data-item="${sanitize(r.title)}">📞 Contact Seller</button>
    </div>
  </div>`;
}

function initResaleSubmitForm() {
  const form = document.getElementById('resaleSubmitForm');
  if (!form) return;

  // Photo upload wiring
  let imageDataUrl = '';
  const photoInput     = document.getElementById('rPhoto');
  const photoPreview   = document.getElementById('rPhotoPreview');
  const photoPlaceholder = document.getElementById('rPhotoPlaceholder');
  const photoClearBtn  = document.getElementById('rPhotoClear');
  const photoArea      = document.getElementById('rPhotoLabel');

  function setPhoto(dataUrl) {
    imageDataUrl = dataUrl;
    photoPreview.src = dataUrl;
    photoPreview.classList.remove('hidden');
    photoPlaceholder.classList.add('hidden');
    photoClearBtn.classList.remove('hidden');
    photoArea.style.borderStyle = 'solid';
    photoArea.style.borderColor = 'var(--accent)';
  }

  function clearPhoto() {
    imageDataUrl = '';
    photoInput.value = '';
    photoPreview.src = '';
    photoPreview.classList.add('hidden');
    photoPlaceholder.classList.remove('hidden');
    photoClearBtn.classList.add('hidden');
    photoArea.style.borderStyle = 'dashed';
    photoArea.style.borderColor = '';
  }

  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('Photo must be under 5 MB.', 'error');
        photoInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setPhoto(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  if (photoClearBtn) {
    photoClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearPhoto();
    });
  }

  // Drag-and-drop onto the upload area
  if (photoArea) {
    photoArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      photoArea.style.borderColor = 'var(--primary)';
    });
    photoArea.addEventListener('dragleave', () => {
      photoArea.style.borderColor = imageDataUrl ? 'var(--accent)' : '';
    });
    photoArea.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) {
        showToast('Please drop an image file.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Photo must be under 5 MB.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setPhoto(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const listing = {
      id:             'rs_user_' + Date.now(),
      title:          form.querySelector('#rTitle').value.trim(),
      category:       form.querySelector('#rCategory').value,
      price:          parseFloat(form.querySelector('#rPrice').value),
      originalPrice:  parseFloat(form.querySelector('#rOriginalPrice').value) || null,
      condition:      form.querySelector('#rCondition').value,
      conditionScore: 7,
      description:    form.querySelector('#rDescription').value.trim(),
      sellerName:     form.querySelector('#rSellerName').value.trim(),
      sellerLocation: form.querySelector('#rLocation').value.trim(),
      sellerRating:   5.0,
      sellerTransactions: 0,
      image:          imageDataUrl,
      postedDate:     new Date().toISOString().slice(0,10),
      tags:           [],
      verified:       false,
      available:      true,
    };
    CK.resaleListings.push(listing);
    saveToStorage('ck_resale_listings', CK.resaleListings);
    showToast('Your listing has been submitted for review!', 'success');
    form.reset();
    clearPhoto();
    renderResaleListings();
    document.getElementById('resaleListingsSection')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function showContactModal(sellerName, itemTitle) {
  const overlay = document.getElementById('contactSellerModal');
  if (!overlay) return;
  const nameEl = overlay.querySelector('#modalSellerName');
  const itemEl = overlay.querySelector('#modalItemTitle');
  if (nameEl) nameEl.textContent = sellerName;
  if (itemEl) itemEl.textContent = itemTitle;
  overlay.classList.remove('hidden');
}

/* ============================================================
   14. DONATIONS PAGE
   ============================================================ */
function initDonationsPage() {
  initCampaignFinder();

  // Donation type selector
  const typeCards = document.querySelectorAll('.donation-type-card');
  const forms     = document.querySelectorAll('.donation-sub-form');
  typeCards.forEach(card => {
    card.addEventListener('click', () => {
      typeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const target = card.dataset.target;
      forms.forEach(f => f.classList.add('hidden'));
      const targetForm = document.getElementById(target);
      if (targetForm) targetForm.classList.remove('hidden');
    });
  });
  // Init first active
  if (typeCards.length) typeCards[0].click();

  // Donation forms
  document.querySelectorAll('.donation-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;

      if (form.id === 'productDonateForm') {
        const submitButton = form.querySelector('[type="submit"]');
        const resultCards = document.getElementById('product-donation-cards');
        const conditionInput = form.querySelector('#product-donation-condition');
        const ageInput = form.querySelector('#product-donation-age');
        const essentialInput = form.querySelector('#product-donation-essential');
        const descriptionInput = form.querySelector('#product-donation-description');
        const categoryInput = form.querySelector('#product-donation-category');

        if (!submitButton || !resultCards || !conditionInput || !ageInput ||
            !essentialInput || !descriptionInput || !categoryInput) {
          showToast('The product donation form is missing required scoring fields.', 'error');
          return;
        }

        const donation = {
          item_condition: Number(conditionInput.value),
          item_age_months: Number(ageInput.value),
          is_essential: Number(essentialInput.value)
        };
        const description = descriptionInput.value.trim();
        const category = categoryInput.value;
        submitButton.disabled = true;

        try {
          const configuredApiBase = typeof window.CONNECTKART_API_BASE_URL === 'string'
            ? window.CONNECTKART_API_BASE_URL.trim()
            : '';
          const isLocalPreview = window.location.protocol === 'file:' ||
            ['localhost', '127.0.0.1'].includes(window.location.hostname);
          const apiUrl = configuredApiBase
            ? new URL('/api/donations/product', configuredApiBase)
            : isLocalPreview
              ? new URL('http://localhost:3000/api/donations/product')
              : new URL('/api/donations/product', window.location.origin);
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(donation)
          });

          let data;
          try {
            data = await response.json();
          } catch {
            throw new Error('The donation scoring service returned an invalid response.');
          }

          if (!response.ok || typeof data.priority !== 'string') {
            throw new Error(typeof data.error === 'string'
              ? data.error
              : 'The donation priority could not be calculated.');
          }

          const badgeClass = {
            'High Priority': 'badge-green',
            'Standard': 'badge-blue',
            'Needs Inspection': 'badge-yellow'
          }[data.priority];
          if (!badgeClass) {
            throw new Error('The donation scoring service returned an unknown priority.');
          }

          const conditionLabel = conditionInput.selectedOptions[0].textContent;
          resultCards.insertAdjacentHTML('afterbegin', `<article class="feature-card campaign-card">
            <h3>${sanitize(category)}</h3>
            <p>${sanitize(description)}</p>
            <p class="text-sm text-muted">${sanitize(conditionLabel)} · ${donation.item_age_months} months old · Essential: ${donation.is_essential ? 'Yes' : 'No'}</p>
            <span class="badge ${badgeClass}">${sanitize(data.priority)}</span>
            <span class="badge badge-surface">Demo score — not saved</span>
          </article>`);
          showToast('Donation priority scored. This demo does not save submissions.', 'success', 4000);
          form.reset();
          return;
        } catch (error) {
          console.error('Product donation scoring failed:', error);
          showToast(`Could not score this donation: ${error.message}`, 'error', 5000);
          return;
        } finally {
          submitButton.disabled = false;
        }
      }

      showToast('Thank you for your generous donation! 🙏', 'success', 4000);
      form.reset();
    });
  });
}

function initCampaignFinder() {
  const finderForm = document.getElementById('campaign-finder-form');
  const descriptionInput = document.getElementById('campaign-description');
  const categorySelect = document.getElementById('campaign-category');
  const budgetInput = document.getElementById('campaign-budget');
  const searchButton = document.getElementById('campaign-search');
  const resetButton = document.getElementById('campaign-reset');
  const status = document.getElementById('campaign-finder-status');
  const results = document.getElementById('campaign-results');
  const dashboard = document.getElementById('campaign-dashboard');

  if (!finderForm || !descriptionInput || !categorySelect || !budgetInput || !searchButton || !resetButton || !status || !results || !dashboard) return;

  const campaigns = Array.isArray(CK_DATA.campaigns)
    ? CK_DATA.campaigns.filter(campaign =>
      campaign &&
      typeof campaign.title === 'string' &&
      campaign.title.trim() &&
      typeof campaign.category === 'string' &&
      campaign.category.trim() &&
      campaign.targetAmount !== null &&
      campaign.targetAmount !== '' &&
      Number.isFinite(Number(campaign.targetAmount)) &&
      Number(campaign.targetAmount) > 0 &&
      campaign.amountRaised !== null &&
      campaign.amountRaised !== '' &&
      Number.isFinite(Number(campaign.amountRaised)) &&
      Number(campaign.amountRaised) >= 0
    )
    : [];

  const categories = [...new Set(campaigns.map(campaign => campaign.category))].sort();
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });

  function campaignCard(campaign) {
    const target = Number(campaign.targetAmount);
    const raised = Number(campaign.amountRaised);
    const remaining = Math.max(target - raised, 0);
    const percentage = raised / target * 100;
    const barPercentage = Math.min(percentage, 100);

    return `<article class="feature-card campaign-card">
      <h3>${sanitize(campaign.title)}</h3>
      <span class="badge badge-green campaign-category">${sanitize(campaign.category)}</span>
      ${campaign.demoOnly ? '<span class="badge badge-yellow campaign-demo-label">DEMO — NOT VERIFIED</span>' : ''}
      ${campaign.description ? `<p>${sanitize(campaign.description)}</p>` : ''}
      <div class="campaign-amounts">
        <span>Target: <strong>${formatCurrency(target)}</strong></span>
        <span>Raised: <strong>${formatCurrency(raised)}</strong></span>
        <span>Remaining: <strong>${formatCurrency(remaining)}</strong></span>
      </div>
      <div class="campaign-progress" role="progressbar" aria-label="${sanitize(campaign.title)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(Math.round(percentage), 100)}">
        <span style="width:${barPercentage.toFixed(1)}%"></span>
      </div>
      <p class="campaign-percentage">${Math.round(percentage)}% funded</p>
    </article>`;
  }

  function renderDashboard() {
    dashboard.innerHTML = campaigns.length
      ? campaigns.map(campaignCard).join('')
      : '<p class="empty-state campaign-empty">Campaign targets and raised amounts are not available yet. No donation figures have been estimated.</p>';
  }

  function renderResults(categoryOverride = categorySelect.value, statusPrefix = '') {
    const selectedCategory = categoryOverride;
    const budgetText = budgetInput.value.trim();
    const budget = budgetText === '' ? null : Number(budgetText);

    if (budgetInput.validity.badInput || (budget !== null && (!Number.isFinite(budget) || budget < 0))) {
      status.textContent = 'Enter a valid budget of ₹0 or more.';
      results.innerHTML = '';
      return;
    }

    if (campaigns.length === 0) {
      status.textContent = 'No campaigns are available yet. Please check back when verified campaign details have been added.';
      results.innerHTML = '';
      return;
    }

    const matches = campaigns.filter(campaign => {
      if (selectedCategory && campaign.category !== selectedCategory) return false;
      if (budget !== null) {
        const minimumDonation = Number(campaign.minimumDonation);
        if (
          campaign.minimumDonation === null ||
          campaign.minimumDonation === '' ||
          !Number.isFinite(minimumDonation) ||
          minimumDonation < 0 ||
          minimumDonation > budget
        ) return false;
      }
      return true;
    });

    status.textContent = statusPrefix + (matches.length
      ? `${matches.length} campaign${matches.length === 1 ? '' : 's'} match your filters.`
      : 'No campaigns match those filters. Try another cause or a higher budget.');
    results.innerHTML = matches.map(campaignCard).join('');
  }

  finderForm.addEventListener('submit', async event => {
    event.preventDefault();
    const description = descriptionInput.value.trim();

    if (!description) {
      renderResults();
      return;
    }

    if (budgetInput.validity.badInput) {
      renderResults();
      return;
    }

    status.textContent = 'Predicting a cause category...';
    searchButton.disabled = true;

    try {
      const configuredApiBase = typeof window.CONNECTKART_API_BASE_URL === 'string'
        ? window.CONNECTKART_API_BASE_URL.trim()
        : '';
      const isLocalPreview = window.location.protocol === 'file:' ||
        ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const apiUrl = configuredApiBase
        ? new URL('/predict-campaign-category', configuredApiBase)
        : isLocalPreview
          ? new URL('http://localhost:3000/predict-campaign-category')
          : new URL('/predict-campaign-category', window.location.origin);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('The category prediction service returned an invalid response.');
      }

      if (!response.ok || typeof data.category !== 'string' || !data.category.trim()) {
        throw new Error(typeof data.error === 'string'
          ? data.error
          : 'The category prediction service could not classify this cause.');
      }

      const predictedCategory = data.category.trim();
      const selectedCategory = categorySelect.value;
      const filterCategory = selectedCategory || predictedCategory;
      const statusPrefix = selectedCategory && selectedCategory !== predictedCategory
        ? `Predicted category: ${predictedCategory}. Results use selected category: ${selectedCategory}. `
        : `Predicted category: ${predictedCategory}. `;
      renderResults(filterCategory, statusPrefix);
    } catch (error) {
      renderResults(
        categorySelect.value,
        `Could not predict a category (${error.message}). Showing campaigns using the selected category and budget filters. `
      );
    } finally {
      searchButton.disabled = false;
    }
  });

  categorySelect.addEventListener('change', renderResults);
  budgetInput.addEventListener('input', renderResults);
  resetButton.addEventListener('click', () => {
    descriptionInput.value = '';
    categorySelect.value = '';
    budgetInput.value = '';
    renderResults();
  });

  renderDashboard();
  renderResults();
}

/* ============================================================
   15. CART PAGE
   ============================================================ */
function initCartPage() {
  renderCartPage();
  initCouponInput();
}

function renderCartPage() {
  const itemsEl    = document.getElementById('cartItems');
  const summaryEl  = document.getElementById('cartSummary');
  const emptyEl    = document.getElementById('cartEmpty');
  const contentEl  = document.getElementById('cartContent');
  if (!itemsEl) return;

  if (CK.cart.length === 0) {
    if (contentEl) contentEl.classList.add('hidden');
    if (emptyEl)   emptyEl.classList.remove('hidden');
    return;
  }
  if (contentEl) contentEl.classList.remove('hidden');
  if (emptyEl)   emptyEl.classList.add('hidden');

  itemsEl.innerHTML = CK.cart.map(item => `
  <div class="cart-item" data-id="${item.id}">
    <div class="cart-item-img">
      <img src="${getImgSrc(item.image, item.name, 400, 300)}" alt="${sanitize(item.name)}" loading="lazy" ${imgFallback(item.name, 400, 300)}>
    </div>
    <div class="cart-item-info">
      <h4>${sanitize(item.name)}</h4>
      <p>${sanitize(item.restaurantName || '')}</p>
      <p style="font-size:.75rem;color:var(--primary)">${formatCurrency(item.price)} each</p>
    </div>
    <div class="cart-item-qty">
      <div class="qty-control">
        <button onclick="cartQtyChange('${item.id}', -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="cartQtyChange('${item.id}', 1)">+</button>
      </div>
    </div>
    <div style="text-align:right">
      <div class="cart-item-price">${formatCurrency(item.price * item.qty)}</div>
      <button class="cart-item-remove" onclick="cartRemove('${item.id}')" title="Remove">🗑</button>
    </div>
  </div>`).join('');

  updateCartSummaryDisplay();
}

function cartQtyChange(id, delta) {
  const item = CK.cart.find(i => i.id === id);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) { cartRemove(id); return; }
  updateCartQty(id, newQty);
  renderCartPage();
}

function cartRemove(id) {
  removeFromCart(id);
  renderCartPage();
  showToast('Item removed from cart.', 'default');
}

function initCouponInput() {
  const btn   = document.getElementById('applyCoupon');
  const input = document.getElementById('couponInput');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const code    = input.value.trim();
    const subtotal = getCartTotal();
    const result  = calcCouponDiscount(subtotal, code);
    const msgEl   = document.getElementById('couponMessage');
    if (msgEl) {
      msgEl.textContent = result.message || '';
      msgEl.style.color = result.discount > 0 ? 'var(--accent)' : 'var(--danger)';
    }
    if (result.discount > 0) {
      saveToStorage('ck_applied_coupon', code);
    } else {
      saveToStorage('ck_applied_coupon', '');
    }
    updateCartSummaryDisplay();
  });
}

function updateCartSummaryDisplay() {
  const coupon   = loadFromStorage('ck_applied_coupon', '');
  const subtotal = getCartTotal();
  const summary  = calcOrderSummary(subtotal, coupon);
  const el       = document.getElementById('cartSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="summary-row"><span>Subtotal (${getCartCount()} items)</span><span>${formatCurrency(summary.subtotal)}</span></div>
    ${summary.couponDiscount > 0 ? `<div class="summary-row" style="color:var(--accent)"><span>Coupon Discount</span><span>−${formatCurrency(summary.couponDiscount)}</span></div>` : ''}
    <div class="summary-row"><span>Delivery Charge</span><span>${summary.delivery === 0 ? '<span style="color:var(--accent)">FREE</span>' : formatCurrency(summary.delivery)}</span></div>
    <div class="summary-row"><span>Platform Fee</span><span>${formatCurrency(Math.round(summary.platformFee))}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>${formatCurrency(Math.round(summary.total))}</span></div>
    <p class="fee-info">💡 Platform fee (3%) helps us maintain ConnectKart services.</p>
    <a href="checkout.html" class="btn btn-primary btn-full mt-2" style="margin-top:16px">Proceed to Checkout →</a>
  `;
}

/* ============================================================
   16. CHECKOUT PAGE
   ============================================================ */
function initCheckoutPage() {
  if (CK.cart.length === 0) {
    showToast('Your cart is empty!', 'warning');
    setTimeout(() => { window.location.href = 'cart.html'; }, 1500);
    return;
  }
  renderCheckoutItems();
  initPaymentOptions();
  initCheckoutForm();
}

function renderCheckoutItems() {
  const el = document.getElementById('checkoutItems');
  if (!el) return;
  el.innerHTML = CK.cart.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-weight:600;font-size:.9rem">${sanitize(item.name)}</div>
        <div style="font-size:.78rem;color:var(--text-muted)">${sanitize(item.restaurantName)} × ${item.qty}</div>
      </div>
      <div style="font-weight:700">${formatCurrency(item.price * item.qty)}</div>
    </div>`).join('');

  // Summary
  const coupon   = loadFromStorage('ck_applied_coupon', '');
  const subtotal = getCartTotal();
  const summary  = calcOrderSummary(subtotal, coupon);
  const sumEl    = document.getElementById('checkoutSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(summary.subtotal)}</span></div>
      ${summary.couponDiscount > 0 ? `<div class="summary-row" style="color:var(--accent)"><span>Coupon Discount</span><span>−${formatCurrency(summary.couponDiscount)}</span></div>` : ''}
      <div class="summary-row"><span>Delivery</span><span>${summary.delivery === 0 ? '<span style="color:var(--accent)">FREE</span>' : formatCurrency(summary.delivery)}</span></div>
      <div class="summary-row"><span>Platform Fee</span><span>${formatCurrency(Math.round(summary.platformFee))}</span></div>
      <div class="summary-row summary-total"><span>Total Payable</span><span>${formatCurrency(Math.round(summary.total))}</span></div>`;
  }
}

function initPaymentOptions() {
  const options = document.querySelectorAll('.payment-option');
  const detailsContainers = document.querySelectorAll('.payment-details-section');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input[type="radio"]').checked = true;
      const method = opt.dataset.method;
      detailsContainers.forEach(d => d.classList.add('hidden'));
      const target = document.getElementById(`details_${method}`);
      if (target) target.classList.remove('hidden');
    });
  });
  // Select first by default
  if (options.length) options[0].click();
}

function initCheckoutForm() {
  const form = document.getElementById('checkoutForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    // Save order to localStorage
    const coupon   = loadFromStorage('ck_applied_coupon', '');
    const subtotal = getCartTotal();
    const summary  = calcOrderSummary(subtotal, coupon);
    const order = {
      id:            'CK' + Date.now().toString().slice(-8),
      date:          new Date().toLocaleString('en-IN'),
      items:         [...CK.cart],
      name:          form.querySelector('#chkName')?.value || '',
      email:         form.querySelector('#chkEmail')?.value || '',
      phone:         form.querySelector('#chkPhone')?.value || '',
      address:       form.querySelector('#chkAddress')?.value || '',
      city:          form.querySelector('#chkCity')?.value || '',
      pincode:       form.querySelector('#chkPincode')?.value || '',
      paymentMethod: form.querySelector('input[name="payMethod"]:checked')?.value || 'cod',
      summary,
    };
    saveToStorage('ck_last_order', order);
    // Clear cart
    CK.cart = [];
    saveToStorage('ck_cart', []);
    saveToStorage('ck_applied_coupon', '');
    window.location.href = 'order-confirmation.html';
  });
}

/* ============================================================
   17. ORDER CONFIRMATION PAGE
   ============================================================ */
function initConfirmationPage() {
  const order = loadFromStorage('ck_last_order', null);
  if (!order) {
    document.getElementById('noOrderMsg')?.classList.remove('hidden');
    return;
  }
  document.getElementById('confirmationContent')?.classList.remove('hidden');
  document.getElementById('noOrderMsg')?.classList.add('hidden');
  // Populate fields
  const fields = {
    '#orderId':      order.id,
    '#orderDate':    order.date,
    '#orderName':    order.name,
    '#orderEmail':   order.email,
    '#orderPhone':   order.phone,
    '#orderAddress': `${order.address}, ${order.city} – ${order.pincode}`,
    '#orderPayment': (order.paymentMethod || 'COD').toUpperCase(),
    '#orderTotal':   formatCurrency(Math.round(order.summary?.total || 0)),
    '#orderItems':   (order.items || []).map(i => `${sanitize(i.name)} ×${i.qty}`).join(', '),
  };
  for (const [sel, val] of Object.entries(fields)) {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  }
}

/* ============================================================
   18. FORM VALIDATION
   ============================================================ */
function validateForm(form) {
  let valid = true;
  form.querySelectorAll('[required]').forEach(field => {
    const errEl = field.parentElement.querySelector('.form-error');
    if (!field.value.trim()) {
      field.classList.add('error');
      if (errEl) errEl.textContent = 'This field is required.';
      valid = false;
    } else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) {
      field.classList.add('error');
      if (errEl) errEl.textContent = 'Enter a valid email address.';
      valid = false;
    } else if (field.type === 'tel' && !/^\d{10}$/.test(field.value.replace(/\D/g, ''))) {
      field.classList.add('error');
      if (errEl) errEl.textContent = 'Enter a valid 10-digit phone number.';
      valid = false;
    } else {
      field.classList.remove('error');
      if (errEl) errEl.textContent = '';
    }
  });
  if (!valid) showToast('Please fix the errors in the form.', 'error');
  return valid;
}

/* ============================================================
   19. ABOUT PAGE
   ============================================================ */
function initAboutPage() {
  // About page is mostly static HTML; no dynamic init needed.
}

/* ============================================================
   20. CONTACT PAGE
   ============================================================ */
function initContactPage() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    showToast('Message sent! We will respond within 24 hours.', 'success', 4000);
    form.reset();
  });
}

/* ============================================================
   21. MODAL HELPERS
   ============================================================ */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
  if (e.target.classList.contains('modal-close')) {
    e.target.closest('.modal-overlay')?.classList.add('hidden');
  }
  // Contact Seller button uses data-* to avoid apostrophe SyntaxErrors in inline onclick
  const contactBtn = e.target.closest('.contact-seller-btn');
  if (contactBtn) {
    showContactModal(contactBtn.dataset.seller || '', contactBtn.dataset.item || '');
  }
});

/* expose globals for inline onclick use */
window.CK                = CK;
window.handleAddToCart   = handleAddToCart;
window.handleQtyChange   = handleQtyChange;
window.cartQtyChange     = cartQtyChange;
window.cartRemove        = cartRemove;
window.copyCode          = copyCode;
window.showContactModal  = showContactModal;
window.showToast         = showToast;
window.saveToStorage     = saveToStorage;
window.renderCartPage    = renderCartPage;
window.updateCartBadge   = updateCartBadge;
window.populateCouponTable = populateCouponTable;

/* ============================================================
   22. AUTH HELPERS (localStorage-based)
   ============================================================ */

/** Returns the logged-in user object or null */
function getAuthUser() {
  return loadFromStorage('ck_user', null);
}

/** Inject Login / Account button into every navbar */
function updateNavAuth() {
  const user = getAuthUser();
  const isSubPage = location.pathname.includes('/pages/');
  const prefix    = isSubPage ? '' : 'pages/';

  document.querySelectorAll('.nav-actions').forEach(actions => {
    // Remove previous auth node if any
    actions.querySelectorAll('.nav-auth-btn').forEach(el => el.remove());

    const btn = document.createElement('a');
    if (user) {
      btn.href      = `${prefix}account.html`;
      btn.className = 'nav-auth-btn nav-auth-account';
      btn.textContent = `👤 ${user.firstName}`;
    } else {
      btn.href      = `${prefix}login.html`;
      btn.className = 'nav-auth-btn nav-auth-login';
      btn.textContent = '🔐 Login';
    }
    // Insert before the hamburger button
    const ham = actions.querySelector('.hamburger');
    if (ham) actions.insertBefore(btn, ham);
    else actions.appendChild(btn);
  });
}

/* ============================================================
   23. LOGIN / SIGN UP PAGE
   ============================================================ */
function initLoginPage() {
  // Redirect if already logged in
  if (getAuthUser()) { window.location.href = 'account.html'; return; }

  const tabLogin  = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const formLogin = document.getElementById('formLogin');
  const formSignup = document.getElementById('formSignup');

  function showTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabSignup.classList.toggle('active', !isLogin);
    formLogin.classList.toggle('hidden', !isLogin);
    formSignup.classList.toggle('hidden', isLogin);
  }

  tabLogin?.addEventListener('click',  () => showTab('login'));
  tabSignup?.addEventListener('click', () => showTab('signup'));
  document.getElementById('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); showTab('signup'); });
  document.getElementById('switchToLogin')?.addEventListener('click',  (e) => { e.preventDefault(); showTab('login'); });

  // Password toggle visibility
  document.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  // LOGIN SUBMIT
  document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pwd   = document.getElementById('loginPassword').value;

    // Validate fields
    if (!validateForm(e.target)) return;

    // Look up existing account
    const accounts = loadFromStorage('ck_accounts', []);
    const found = accounts.find(a => a.email === email);
    if (!found) {
      showFieldError('loginEmail', 'No account found with this email.');
      return;
    }
    if (found.password !== btoa(pwd)) {
      showFieldError('loginPassword', 'Incorrect password.');
      return;
    }

    // Save session
    saveToStorage('ck_user', { firstName: found.firstName, lastName: found.lastName, email: found.email, phone: found.phone, city: found.city || '' });
    showToast(`Welcome back, ${found.firstName}!`, 'success');
    setTimeout(() => { window.location.href = 'account.html'; }, 800);
  });

  // SIGN UP SUBMIT
  document.getElementById('signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const termsErr = document.getElementById('termsError');

    if (!validateForm(e.target)) return;

    if (!document.getElementById('agreeTerms').checked) {
      if (termsErr) termsErr.textContent = 'You must agree to the terms.';
      return;
    } else {
      if (termsErr) termsErr.textContent = '';
    }

    const firstName = document.getElementById('signupFirst').value.trim();
    const lastName  = document.getElementById('signupLast').value.trim();
    const email     = document.getElementById('signupEmail').value.trim().toLowerCase();
    const phone     = document.getElementById('signupPhone').value.trim();
    const pwd       = document.getElementById('signupPassword').value;
    const confirm   = document.getElementById('signupConfirm').value;

    if (pwd.length < 6) { showFieldError('signupPassword', 'Password must be at least 6 characters.'); return; }
    if (pwd !== confirm)  { showFieldError('signupConfirm', 'Passwords do not match.'); return; }

    const accounts = loadFromStorage('ck_accounts', []);
    if (accounts.find(a => a.email === email)) {
      showFieldError('signupEmail', 'An account with this email already exists.');
      return;
    }

    const newAccount = { firstName, lastName, email, phone, city: '', password: btoa(pwd) };
    accounts.push(newAccount);
    saveToStorage('ck_accounts', accounts);
    saveToStorage('ck_user', { firstName, lastName, email, phone, city: '' });
    showToast(`Account created! Welcome, ${firstName}!`, 'success');
    setTimeout(() => { window.location.href = 'account.html'; }, 800);
  });
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('error');
  const errEl = field.closest('.form-group')?.querySelector('.form-error') ||
                field.parentElement?.querySelector('.form-error');
  if (errEl) errEl.textContent = message;
}

/* ============================================================
   24. ACCOUNT PAGE
   ============================================================ */
function initAccountPage() {
  const user = getAuthUser();
  if (!user) {
    document.getElementById('notLoggedIn')?.classList.remove('hidden');
    return;
  }

  // Show content
  document.getElementById('notLoggedIn')?.classList.add('hidden');
  document.getElementById('accountContent')?.classList.remove('hidden');

  // Populate header
  document.getElementById('accountWelcome').textContent = `👤 Hello, ${user.firstName}!`;
  document.getElementById('accountEmail').textContent   = user.email;

  // Populate sidebar
  const initials = (user.firstName[0] + (user.lastName[0] || '')).toUpperCase();
  document.getElementById('sidebarAvatar').textContent = initials;
  document.getElementById('sidebarName').textContent   = `${user.firstName} ${user.lastName}`;

  // Populate profile form
  document.getElementById('profFirst').value = user.firstName;
  document.getElementById('profLast').value  = user.lastName;
  document.getElementById('profEmail').value = user.email;
  document.getElementById('profPhone').value = user.phone || '';
  document.getElementById('profCity').value  = user.city  || '';

  // Tab switching
  document.querySelectorAll('.account-nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.account-nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // Password toggle visibility
  document.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  // Save profile
  document.getElementById('profileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const updated = {
      ...user,
      firstName: document.getElementById('profFirst').value.trim(),
      lastName:  document.getElementById('profLast').value.trim(),
      phone:     document.getElementById('profPhone').value.trim(),
      city:      document.getElementById('profCity').value.trim(),
    };
    saveToStorage('ck_user', updated);
    // Update stored account too
    const accounts = loadFromStorage('ck_accounts', []);
    const idx = accounts.findIndex(a => a.email === user.email);
    if (idx !== -1) { accounts[idx] = { ...accounts[idx], ...updated }; saveToStorage('ck_accounts', accounts); }
    showToast('Profile updated!', 'success');
    document.getElementById('sidebarName').textContent = `${updated.firstName} ${updated.lastName}`;
    document.getElementById('accountWelcome').textContent = `👤 Hello, ${updated.firstName}!`;
  });

  // Change password
  document.getElementById('changePasswordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cur  = document.getElementById('curPassword').value;
    const nw   = document.getElementById('newPassword').value;
    const accounts = loadFromStorage('ck_accounts', []);
    const acc  = accounts.find(a => a.email === user.email);
    if (!acc || acc.password !== btoa(cur)) {
      showFieldError('curPassword', 'Current password is incorrect.');
      return;
    }
    if (nw.length < 6) { showFieldError('newPassword', 'New password must be at least 6 characters.'); return; }
    acc.password = btoa(nw);
    saveToStorage('ck_accounts', accounts);
    showToast('Password updated!', 'success');
    e.target.reset();
  });

  // Orders tab
  renderOrderHistory();

  // My Listings tab
  renderMyListings();

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    saveToStorage('ck_user', null);
    showToast('Logged out. See you soon!', 'default');
    setTimeout(() => { window.location.href = '../index.html'; }, 800);
  });

  // Delete account
  document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
    if (!confirm('This will delete all your account data from this browser. Continue?')) return;
    const accounts = loadFromStorage('ck_accounts', []);
    saveToStorage('ck_accounts', accounts.filter(a => a.email !== user.email));
    saveToStorage('ck_user', null);
    saveToStorage('ck_cart', []);
    saveToStorage('ck_resale_listings', []);
    saveToStorage('ck_last_order', null);
    showToast('Account data cleared.', 'default');
    setTimeout(() => { window.location.href = '../index.html'; }, 1000);
  });
}

function renderOrderHistory() {
  const el = document.getElementById('ordersList');
  if (!el) return;
  const lastOrder = loadFromStorage('ck_last_order', null);
  if (!lastOrder) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No orders yet</h3><p>Your order history will appear here after your first purchase.</p><a href="products.html" class="btn btn-primary" style="margin-top:16px">🛍 Start Shopping</a></div>`;
    return;
  }
  const s = lastOrder.summary || {};
  el.innerHTML = `
    <div class="order-history-card">
      <div class="order-history-header">
        <span class="order-history-id">Order #${lastOrder.id}</span>
        <span class="order-status-badge">✓ Placed</span>
        <span style="font-size:.78rem;color:var(--text-muted)">${lastOrder.date}</span>
      </div>
      <p style="font-size:.85rem;margin-bottom:10px">${(lastOrder.items || []).map(i => `${sanitize(i.name)} ×${i.qty}`).join(', ')}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.875rem">
        <span style="color:var(--text-muted)">Total: <strong style="color:var(--text)">${formatCurrency(Math.round(s.total || 0))}</strong></span>
        <a href="order-confirmation.html" class="btn btn-ghost btn-sm">View Details →</a>
      </div>
    </div>`;
}

function renderMyListings() {
  const el = document.getElementById('myListings');
  if (!el) return;
  const listings = loadFromStorage('ck_resale_listings', []);
  if (!listings.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📋</div><h3>No listings yet</h3><p>List your first item to start selling.</p></div>`;
    return;
  }
  el.innerHTML = listings.map(r => buildResaleCard(r)).join('');
}

document.addEventListener("DOMContentLoaded", function () {
  const chatbotToggle = document.getElementById("chatbot-toggle");
  const chatbotWindow = document.getElementById("chatbot-window");
  const chatbotClose = document.getElementById("chatbot-close");
  const chatForm = document.getElementById("chatbot-form");
  const chatInput = document.getElementById("chatbot-input");
  const chatMessages = document.getElementById("chatbot-messages");

  if (!chatbotToggle || !chatbotWindow || !chatbotClose ||
      !chatForm || !chatInput || !chatMessages) return;

  const quickActions = document.querySelectorAll(".chatbot-quick-action");
  const sendButton = chatForm.querySelector('button[type="submit"]');
  let isSending = false;

  chatbotToggle.addEventListener("click", function () {
    chatbotWindow.style.display = "flex";
    chatbotWindow.setAttribute("aria-hidden", "false");
    chatbotToggle.setAttribute("aria-expanded", "true");
    chatbotToggle.hidden = true;
    chatInput.focus();
  });

  chatbotClose.addEventListener("click", function () {
    chatbotWindow.style.display = "none";
    chatbotWindow.setAttribute("aria-hidden", "true");
    chatbotToggle.setAttribute("aria-expanded", "false");
    chatbotToggle.hidden = false;
    chatbotToggle.focus();
  });

  quickActions.forEach(function (button) {
    button.addEventListener("click", function () {
      chatInput.value = button.dataset.message || "";
      chatForm.requestSubmit();
    });
  });

  chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message || isSending) return;

    const userMessage = document.createElement("p");
    userMessage.className = "user-message";
    userMessage.textContent = message;
    chatMessages.appendChild(userMessage);
    chatInput.value = "";

    const loadingMessage = document.createElement("p");
    loadingMessage.className = "bot-message";
    loadingMessage.textContent = "Thinking...";
    chatMessages.appendChild(loadingMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    isSending = true;
    chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    quickActions.forEach(button => { button.disabled = true; });

    try {
      const configuredApiBase = typeof window.CONNECTKART_API_BASE_URL === "string"
        ? window.CONNECTKART_API_BASE_URL.trim()
        : "";
      const isLocalPreview = window.location.protocol === "file:" ||
        ["localhost", "127.0.0.1"].includes(window.location.hostname);
      // For separate hosting, set window.CONNECTKART_API_BASE_URL to the backend origin before this script loads.
      const apiUrl = configuredApiBase
        ? new URL("/chat", configuredApiBase)
        : isLocalPreview
          ? new URL("http://localhost:3000/chat")
          : new URL("/chat", window.location.origin);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The chat server returned an invalid response.");
      }

      loadingMessage.textContent = response.status === 429
        ? "Please wait a moment and try again. The AI service may be rate-limited or out of quota."
        : typeof data.reply === "string"
          ? data.reply
          : "The chat request failed. Please try again.";
    } catch (error) {
      console.error("Chatbot error:", error);
      loadingMessage.textContent = error instanceof TypeError
        ? "Unable to connect to the chat server. Start it with npm start and try again."
        : error.message;
    } finally {
      isSending = false;
      chatInput.disabled = false;
      if (sendButton) sendButton.disabled = false;
      quickActions.forEach(button => { button.disabled = false; });
      chatMessages.scrollTop = chatMessages.scrollHeight;
      chatInput.focus();
    }
  });
});
