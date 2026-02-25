import { api } from './api.js';
import { initFeedback } from './feedback.js';
import { initFormEnhancements } from './forms.js';
import { playNotificationSound, unlockNotificationSound } from './sound.js';
import { escapeHtml, formatInr } from './ui.js';

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function slugifyAreaCode(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizeCities(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

let currentUser = null;
let currentListings = [];
let currentBanners = [];
let currentSellerOrders = [];
let locationOptions = [];
let stream = null;
let feedback = null;
const PORTAL_KEY = 'kp_active_portal';
const PORTAL_NAME = 'seller';
const TAB_SECTION_IDS = [
  'sellerPostingPanel',
  'sellerListingsPanel',
  'sellerOrdersPanel',
  'sellerProfilePanel',
  'sellerBannerPanel',
  'sellerSupportPanel'
];
const TAB_LINK_IDS = {
  sellerPostingPanel: 'sellerWorkspaceNav',
  sellerListingsPanel: 'sellerWorkspaceNav',
  sellerOrdersPanel: 'sellerOrdersNav',
  sellerProfilePanel: 'sellerProfileNav',
  sellerBannerPanel: 'sellerBannerNav',
  sellerSupportPanel: 'sellerSupportNav'
};
const ORDER_FLOW = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered', 'cancelled'];
const SELLER_STATUS_OPTIONS = ['packing', 'shipping', 'cancelled'];

initFormEnhancements();

function isSellerAccount() {
  return Boolean(currentUser && currentUser.role === 'seller');
}

function isBannerManager() {
  return Boolean(currentUser && (currentUser.role === 'seller' || currentUser.role === 'admin'));
}

function canManageListing(item) {
  if (!currentUser || !item) return false;
  return currentUser.role === 'admin' || Number(item.createdBy) === Number(currentUser.id);
}

function canManageBanner(item) {
  if (!currentUser || !item) return false;
  return currentUser.role === 'admin' || Number(item.createdBy) === Number(currentUser.id);
}

function setSectionVisibility(id, visible) {
  el(id)?.classList.toggle('hidden', !visible);
}

function activeSellerTabIds() {
  if (!currentUser) return [];
  if (isSellerAccount()) {
    return [
      'sellerPostingPanel',
      'sellerListingsPanel',
      'sellerOrdersPanel',
      'sellerProfilePanel',
      'sellerBannerPanel',
      'sellerSupportPanel'
    ];
  }
  if (currentUser.role === 'admin') return ['sellerBannerPanel', 'sellerSupportPanel'];
  return [];
}

function syncTabView() {
  const loginPanel = el('sellerLoginPanel');
  const loginVisible = !loginPanel || !loginPanel.classList.contains('hidden');
  const allowed = activeSellerTabIds().filter((id) => {
    const section = el(id);
    return Boolean(section && !section.classList.contains('hidden'));
  });
  const rawHash = String(window.location.hash || '').replace('#', '');
  const fallback = allowed[0] || '';
  const target = allowed.includes(rawHash) ? rawHash : fallback;

  for (const id of TAB_SECTION_IDS) {
    const section = el(id);
    if (!section) continue;
    const shouldShow = !loginVisible && id === target && !section.classList.contains('hidden');
    section.classList.toggle('view-hidden', !shouldShow);
  }
  if (loginPanel) loginPanel.classList.toggle('view-hidden', !loginVisible);

  for (const [sectionId, linkId] of Object.entries(TAB_LINK_IDS)) {
    const link = el(linkId);
    if (!link) continue;
    link.classList.toggle('active', !loginVisible && sectionId === target);
  }

  if (!loginVisible && target && rawHash !== target) {
    window.history.replaceState(null, '', `#${target}`);
  }
}

function syncPortalVisibility() {
  const loggedIn = Boolean(currentUser);
  const sellerRole = isSellerAccount();
  const portalAccess = sellerRole || currentUser?.role === 'admin';
  const bannerRole = isBannerManager();
  const loginVisible = !portalAccess;

  const logoutBtn = el('sellerLogoutBtn');
  if (logoutBtn) logoutBtn.hidden = !portalAccess;
  el('sellerPortalNav')?.classList.toggle('hidden', !portalAccess);

  el('sellerWorkspaceNav')?.classList.toggle('hidden', !sellerRole);
  el('sellerOrdersNav')?.classList.toggle('hidden', !sellerRole);
  el('sellerProfileNav')?.classList.toggle('hidden', !sellerRole);
  el('sellerBannerNav')?.classList.toggle('hidden', !bannerRole);
  el('sellerSupportNav')?.classList.toggle('hidden', !portalAccess);
  setSectionVisibility('sellerLoginPanel', loginVisible);
  setSectionVisibility('sellerPostingPanel', sellerRole);
  setSectionVisibility('sellerListingsPanel', sellerRole);
  setSectionVisibility('sellerOrdersPanel', sellerRole);
  setSectionVisibility('sellerProfilePanel', sellerRole);
  setSectionVisibility('sellerBannerPanel', bannerRole);
  setSectionVisibility('sellerSupportPanel', portalAccess);
  syncTabView();

  if (!loggedIn) {
    setText('sellerPortalHint', 'Login to post and manage your listings.');
    return;
  }
  if (!portalAccess) {
    setText('sellerPortalHint', `Current role is ${currentUser.role}. Seller role required for posting.`);
    return;
  }
  if (currentUser?.role === 'admin') {
    setText('sellerPortalHint', 'Admin account detected. Listing post is seller-only. Banner manager is available.');
    return;
  }
  setText('sellerPortalHint', 'Seller workspace ready. Post, edit, and delete listings.');
}

async function handlePortalSwitchSession() {
  let previousPortal = '';
  try {
    previousPortal = String(localStorage.getItem(PORTAL_KEY) || '');
    localStorage.setItem(PORTAL_KEY, PORTAL_NAME);
  } catch {
    previousPortal = '';
  }
  if (previousPortal && previousPortal !== PORTAL_NAME) {
    await api.authLogout().catch(() => null);
  }
}

function renderListings(items) {
  const node = el('sellerListings');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No listings yet.</article>`;
    return;
  }

  node.innerHTML = items
    .map(
      (item) => `<article class="card">
      <div class="card-body">
        <div class="card-meta">
          <span class="pill type-buy">${escapeHtml(item.listingType || '')}</span>
          <span class="pill type-rent">${escapeHtml(item.sellerType || '')}</span>
          ${item.publishIndia ? '<span class="pill type-sell">India</span>' : ''}
          <span class="muted">${escapeHtml(item.areaCode || '')}</span>
        </div>
        <h3 class="card-title">${escapeHtml(item.title || '')}</h3>
        <p class="muted">${escapeHtml(item.city || '')} | Delivery: ${escapeHtml(item.deliveryMode || '')}</p>
        <p class="muted">Serviceable: ${escapeHtml((item.serviceableCities || []).slice(0, 3).join(', ') || '-')}</p>
        <p class="card-price">${escapeHtml(formatInr(item.price))}</p>
        <div class="card-actions">
          <button class="kb-btn kb-btn-ghost seller-view-listing-btn" data-id="${item.id}" type="button">View</button>
          ${
            canManageListing(item)
              ? `<button class="kb-btn kb-btn-dark seller-edit-listing-btn" data-id="${item.id}" type="button">Edit</button>
                 <button class="kb-btn kb-btn-dark seller-delete-listing-btn" data-id="${item.id}" type="button">Delete</button>`
              : ''
          }
        </div>
      </div>
    </article>`
    )
    .join('');
}

function renderBanners(items) {
  const node = el('sellerBannerList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No banners published yet.</article>`;
    return;
  }

  node.innerHTML = items
    .map(
      (item) => `<article class="card">
      <div class="card-body">
        <div class="card-meta">
          <span class="pill type-buy">${escapeHtml(item.scope || 'local')}</span>
          <span class="muted">${escapeHtml(item.source || 'manual')}</span>
          <span class="muted">${item.isActive ? 'active' : 'inactive'}</span>
        </div>
        <h3 class="card-title">${escapeHtml(item.title || '')}</h3>
        <p class="muted">${escapeHtml(item.message || '')}</p>
        <p class="muted">Priority: ${escapeHtml(String(item.priority ?? 0))}</p>
        <div class="card-actions">
          <button class="kb-btn kb-btn-ghost seller-banner-view-btn" data-id="${item.id}" type="button">View</button>
          ${
            canManageBanner(item)
              ? `<button class="kb-btn kb-btn-dark seller-banner-edit-btn" data-id="${item.id}" type="button">Edit</button>
                 <button class="kb-btn kb-btn-dark seller-banner-delete-btn" data-id="${item.id}" type="button">Delete</button>`
              : ''
          }
        </div>
      </div>
    </article>`
    )
    .join('');
}

function prettyOrderStatus(status) {
  return String(status || '').replaceAll('_', ' ');
}

function renderOrderStatusRail(status) {
  if (status === 'cancelled') {
    return `<div class="order-status-rail"><span class="order-step current">cancelled</span></div>`;
  }
  const currentIndex = ORDER_FLOW.indexOf(status);
  return `<div class="order-status-rail">${ORDER_FLOW.filter((step) => step !== 'cancelled')
    .map((step, index) => {
      const cls = index === currentIndex ? 'order-step current' : 'order-step';
      return `<span class="${cls}">${escapeHtml(prettyOrderStatus(step))}</span>`;
    })
    .join('')}</div>`;
}

function nextSellerStatuses(currentStatus) {
  const current = String(currentStatus || '').toLowerCase();
  if (current === 'received') return ['packing', 'cancelled'];
  if (current === 'packing') return ['shipping', 'cancelled'];
  if (current === 'shipping') return ['cancelled'];
  return [];
}

function renderSellerOrders(items) {
  const node = el('sellerOrdersList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No seller orders found.</article>`;
    return;
  }
  node.innerHTML = items
    .map((item) => {
      const nextStatuses = nextSellerStatuses(item.status).filter((status) => SELLER_STATUS_OPTIONS.includes(status));
      return `<article class="card">
        <div class="card-media">${
          item.listingImageUrl ? `<img src="${escapeHtml(item.listingImageUrl)}" alt="${escapeHtml(item.listingTitle || 'Order item')}" />` : '<strong>No Image</strong>'
        }</div>
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.actionKind || 'buy')}</span>
            <span class="pill type-rent">${escapeHtml(prettyOrderStatus(item.status || 'received'))}</span>
            <span class="muted">#${escapeHtml(String(item.id || ''))}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
          <p class="muted">Buyer: ${escapeHtml(item.buyerName || item.buyerEmail || '-')}</p>
          <p class="muted">Payment: ${escapeHtml(item.paymentMode || 'cod')} (${escapeHtml(item.paymentState || 'pending')})</p>
          <p class="muted">Items: ${formatInr(item.totalPrice)} | Delivery: ${formatInr(item.deliveryCharge)} | Total: ${formatInr(item.payableTotal)}</p>
          ${renderOrderStatusRail(item.status)}
          <div class="card-actions">
            ${nextStatuses
              .map(
                (status) =>
                  `<button class="kb-btn kb-btn-ghost seller-order-status-btn" data-id="${item.id}" data-status="${status}" type="button">${escapeHtml(
                    prettyOrderStatus(status)
                  )}</button>`
              )
              .join('')}
            <button class="kb-btn kb-btn-dark seller-order-view-btn" data-id="${item.id}" type="button">View</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function renderSellerProfile() {
  const form = el('sellerProfileForm');
  if (!form || !currentUser || !isSellerAccount()) {
    setText('sellerProfileSummary', 'Login to manage seller profile and TOTP.');
    return;
  }
  if (form.fullName) form.fullName.value = currentUser.fullName || '';
  if (form.email) form.email.value = currentUser.email || '';
  if (form.phoneNumber) form.phoneNumber.value = currentUser.phoneNumber || '';
  setText(
    'sellerProfileSummary',
    `${currentUser.fullName || ''} | ${currentUser.email || ''} | role: ${currentUser.role || 'seller'} | TOTP: ${
      currentUser.totpEnabled ? 'enabled' : 'disabled'
    }`
  );
}

function setCityOptions(cities = []) {
  const citySelect = el('sellerCitySelect');
  if (!citySelect) return;
  const uniqueCities = [...new Set((cities || []).map((item) => String(item || '').trim()).filter(Boolean))];
  citySelect.innerHTML = `<option value="">Select city</option>${uniqueCities
    .map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`)
    .join('')}`;
  if (uniqueCities.length) citySelect.value = uniqueCities[0];
}

function renderServiceableAreas(options = []) {
  const node = el('sellerServiceableAreaList');
  if (!node) return;
  const unique = [];
  for (const option of options) {
    const label = String(option.label || option.city || '').trim();
    if (!label) continue;
    const areaCode = slugifyAreaCode(option.areaCode || option.city || label, '');
    if (!areaCode) continue;
    if (unique.some((row) => row.areaCode === areaCode)) continue;
    unique.push({ label, areaCode });
  }
  node.innerHTML = unique
    .slice(0, 14)
    .map(
      (item) =>
        `<label><input type="checkbox" name="serviceableAreaCodes" value="${escapeHtml(item.areaCode)}" /> ${escapeHtml(item.label)}</label>`
    )
    .join('');
}

function applyLocationToForm(option) {
  const form = el('sellerListingForm');
  if (!form || !option) return;
  if (form.city) form.city.value = option.city || option.label || '';
  if (form.areaCode) form.areaCode.value = option.areaCode || slugifyAreaCode(option.city || option.label || 'unknown');
  if (form.latitude && Number.isFinite(option.lat)) form.latitude.value = String(option.lat);
  if (form.longitude && Number.isFinite(option.lon)) form.longitude.value = String(option.lon);
}

function renderServiceLocationSelect() {
  const select = el('sellerServiceLocation');
  if (!select) return;
  const values = locationOptions
    .map((option, index) => ({
      key: `${index}`,
      label: option.label || option.city || ''
    }))
    .filter((row) => row.label);
  select.innerHTML = `<option value="">Select serviceable location</option>${values
    .map((row) => `<option value="${row.key}">${escapeHtml(row.label)}</option>`)
    .join('')}`;
  if (values.length) {
    select.value = values[0].key;
    const first = locationOptions[Number(values[0].key)];
    applyLocationToForm(first);
  }
}

async function loadGeoOptions(lat, lon) {
  const result = await api.locationNearby(lat, lon);
  const options = [];
  const pushOption = (label, city, areaCode, optLat, optLon) => {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel) return;
    options.push({
      label: normalizedLabel,
      city: String(city || normalizedLabel).trim(),
      areaCode: slugifyAreaCode(areaCode || city || normalizedLabel),
      lat: Number.isFinite(optLat) ? optLat : lat,
      lon: Number.isFinite(optLon) ? optLon : lon
    });
  };

  pushOption(result.current?.locality || result.current?.city || 'Detected Area', result.current?.city || '', '', lat, lon);
  for (const locality of result.localityOptions || []) {
    pushOption(locality.name, locality.filterCity || locality.city || locality.name, '', lat, lon);
  }
  for (const cityRow of result.nearbyCities || []) {
    pushOption(cityRow.city, cityRow.city, cityRow.city, lat, lon);
  }

  locationOptions = options.slice(0, 20);
  renderServiceLocationSelect();
  renderServiceableAreas(locationOptions);
  setCityOptions(locationOptions.map((item) => item.city));

  const form = el('sellerListingForm');
  if (form?.serviceableCities && !String(form.serviceableCities.value || '').trim()) {
    const autoCities = locationOptions.map((item) => item.city).filter(Boolean).slice(0, 8);
    form.serviceableCities.value = [...new Set(autoCities)].join(', ');
  }
}

async function detectGpsForSeller() {
  const form = el('sellerListingForm');
  if (!form) return;
  if (!navigator.geolocation) {
    setText('sellerListingStatus', 'Geolocation is not supported in this browser.');
    return;
  }
  setText('sellerListingStatus', 'Detecting current location...');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      if (form.latitude) form.latitude.value = String(lat);
      if (form.longitude) form.longitude.value = String(lon);
      await loadGeoOptions(lat, lon).catch(() => null);
      setText('sellerListingStatus', `GPS detected. Geo options loaded within 250 KM.`);
    },
    () => {
      setText('sellerListingStatus', 'Location permission denied.');
    }
  );
}

async function refreshAuth() {
  try {
    const me = await api.authMe();
    currentUser = me.authenticated ? me.user : null;
    setText('sellerAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
  } catch {
    currentUser = null;
    setText('sellerAuthBadge', 'Guest');
  }
  syncPortalVisibility();
  renderSellerProfile();
  await feedback?.onAuthChanged?.();
  connectRealtime();
}

async function refreshListings() {
  if (!isSellerAccount()) {
    currentListings = [];
    renderListings([]);
    return;
  }
  try {
    const result = await api.listListings({ limit: 40, offset: 0, sort: 'newest', scope: 'all' });
    currentListings = Array.isArray(result.data) ? result.data.filter((row) => canManageListing(row)) : [];
    renderListings(currentListings);
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to load listings');
  }
}

async function refreshBanners() {
  if (!isBannerManager()) {
    currentBanners = [];
    renderBanners([]);
    return;
  }
  try {
    const result = await api.listMyBanners({ limit: 80 });
    currentBanners = Array.isArray(result.data) ? result.data : [];
    renderBanners(currentBanners);
  } catch (error) {
    setText('sellerBannerStatus', error.message || 'Unable to load banners');
  }
}

async function refreshSellerOrders() {
  if (!isSellerAccount()) {
    currentSellerOrders = [];
    renderSellerOrders([]);
    return;
  }
  try {
    const status = String(el('sellerOrdersStatusFilter')?.value || '');
    const result = await api.listSellerOrders({
      status: status || undefined,
      limit: 60,
      offset: 0
    });
    currentSellerOrders = Array.isArray(result.data) ? result.data : [];
    renderSellerOrders(currentSellerOrders);
    setText('sellerOrdersStatus', `Showing ${currentSellerOrders.length} order(s).`);
  } catch (error) {
    setText('sellerOrdersStatus', error.message || 'Unable to load seller orders');
  }
}

function connectRealtime() {
  if (stream) stream.close();
  stream = new EventSource('/api/events/stream');
  stream.addEventListener('listing.created', async () => {
    if (isSellerAccount()) {
      await refreshListings().catch(() => null);
      playNotificationSound();
    }
  });
  stream.addEventListener('listing.updated', async () => {
    if (isSellerAccount()) await refreshListings().catch(() => null);
  });
  stream.addEventListener('listing.deleted', async () => {
    if (isSellerAccount()) await refreshListings().catch(() => null);
  });
  stream.addEventListener('orders.updated', async () => {
    if (isSellerAccount()) await refreshSellerOrders().catch(() => null);
  });
  stream.addEventListener('banner.updated', async () => {
    if (isBannerManager()) await refreshBanners().catch(() => null);
  });
  stream.addEventListener('feedback.updated', async () => {
    await feedback?.refreshMyFeedback?.().catch(() => null);
    playNotificationSound();
  });
  stream.addEventListener('notifications.invalidate', () => {
    playNotificationSound();
  });
}

el('sellerLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = String(form.password?.value || '');
  const totpCode = String(form.totpCode?.value || '').trim();
  if (!password && !totpCode) {
    setText('sellerAuthStatus', 'Enter password or TOTP code to login.');
    return;
  }
  setText('sellerAuthStatus', 'Logging in...');
  try {
    const payload = { email: form.email.value.trim() };
    if (password) payload.password = password;
    if (totpCode) payload.totpCode = totpCode;
    await api.authLogin(payload);
    form.reset();
    await refreshAuth();
    if (!isSellerAccount() && currentUser?.role !== 'admin') {
      setText('sellerAuthStatus', 'Login successful, but this account is not a seller account.');
      await refreshListings();
      syncTabView();
      return;
    }
    if (isSellerAccount()) window.location.hash = '#sellerPostingPanel';
    if (currentUser?.role === 'admin') window.location.hash = '#sellerBannerPanel';
    setText('sellerAuthStatus', 'Seller login successful.');
    await refreshListings();
    await refreshSellerOrders();
    await refreshBanners();
    unlockNotificationSound();
  } catch (error) {
    setText('sellerAuthStatus', error.message || 'Login failed');
  }
});

el('sellerSignupForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('sellerAuthStatus', 'Creating seller account...');
  try {
    await api.authRegister({
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phoneNumber: form.phoneNumber.value.trim(),
      password: form.password.value,
      role: 'seller'
    });
    form.reset();
    await refreshAuth();
    window.location.hash = '#sellerPostingPanel';
    setText('sellerAuthStatus', 'Seller account created and logged in.');
    await refreshListings();
    await refreshSellerOrders();
    await refreshBanners();
    unlockNotificationSound();
  } catch (error) {
    setText('sellerAuthStatus', error.message || 'Unable to create seller account');
  }
});

el('sellerListingForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isSellerAccount()) {
    setText('sellerListingStatus', 'Seller account login required.');
    return;
  }
  const form = event.currentTarget;
  const serviceableAreaCodes = Array.from(form.querySelectorAll('input[name="serviceableAreaCodes"]:checked')).map(
    (node) => node.value
  );
  const serviceableCities = normalizeCities(form.serviceableCities?.value || '');
  setText('sellerListingStatus', 'Publishing listing...');
  try {
    const listing = await api.createListing({
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      category: form.category.value,
      listingType: form.listingType.value,
      sellerType: form.sellerType.value,
      deliveryMode: form.deliveryMode.value,
      deliveryRatePer10Km: form.deliveryRatePer10Km?.value
        ? Number(form.deliveryRatePer10Km.value)
        : undefined,
      paymentModes: ['cod'],
      price: Number(form.price.value || 0),
      city: form.city.value.trim(),
      areaCode: slugifyAreaCode(form.areaCode.value || form.city.value || 'unknown'),
      serviceableAreaCodes,
      serviceableCities,
      publishIndia: Boolean(form.publishIndia?.checked),
      latitude: Number(form.latitude.value),
      longitude: Number(form.longitude.value)
    });

    const files = Array.from(form.media?.files || []);
    for (const file of files.slice(0, 10)) {
      if (!String(file.type || '').startsWith('image/')) continue;
      await api.uploadListingMedia(listing.id, file);
    }

    form.reset();
    setText('sellerListingStatus', 'Listing published.');
    await refreshListings();
    await refreshBanners();
    playNotificationSound();
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to publish listing');
  }
});

el('sellerServiceLocation')?.addEventListener('change', async (event) => {
  const index = Number(event.target.value);
  const option = Number.isInteger(index) ? locationOptions[index] : null;
  if (!option) return;
  applyLocationToForm(option);
  try {
    const geo = await api.locationGeocode(option.label || option.city);
    const form = el('sellerListingForm');
    if (form?.latitude && Number.isFinite(Number(geo.lat))) form.latitude.value = String(geo.lat);
    if (form?.longitude && Number.isFinite(Number(geo.lon))) form.longitude.value = String(geo.lon);
    if (form?.city && geo.city) form.city.value = geo.city;
    if (form?.areaCode && geo.areaCode) form.areaCode.value = geo.areaCode;
  } catch {
    // Keep detected GPS coordinates when geocode fallback fails.
  }
});

el('sellerDetectGpsBtn')?.addEventListener('click', () => {
  detectGpsForSeller().catch(() => null);
});

el('sellerRefreshListingsBtn')?.addEventListener('click', () => refreshListings().catch(() => null));
el('sellerBannerRefreshBtn')?.addEventListener('click', () => refreshBanners().catch(() => null));
el('sellerOrdersRefreshBtn')?.addEventListener('click', () => refreshSellerOrders().catch(() => null));
el('sellerOrdersStatusFilter')?.addEventListener('change', () => refreshSellerOrders().catch(() => null));

el('sellerProfileForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isSellerAccount()) {
    setText('sellerProfileStatus', 'Seller login required.');
    return;
  }
  const form = event.currentTarget;
  setText('sellerProfileStatus', 'Saving profile...');
  try {
    const result = await api.updateProfile({
      fullName: form.fullName.value.trim(),
      phoneNumber: form.phoneNumber.value.trim()
    });
    currentUser = result.user || currentUser;
    setText('sellerAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderSellerProfile();
    setText('sellerProfileStatus', 'Profile updated.');
  } catch (error) {
    setText('sellerProfileStatus', error.message || 'Unable to update profile');
  }
});

el('sellerPasswordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isSellerAccount()) {
    setText('sellerPasswordStatus', 'Seller login required.');
    return;
  }
  const form = event.currentTarget;
  const currentPassword = String(form.currentPassword?.value || '').trim();
  if (!currentPassword) {
    setText('sellerPasswordStatus', 'Current password is required.');
    return;
  }
  setText('sellerPasswordStatus', 'Changing password...');
  try {
    const result = await api.changePassword({
      currentPassword,
      newPassword: form.newPassword.value
    });
    form.reset();
    setText(
      'sellerPasswordStatus',
      result?.reauthRequired ? 'Password changed. Please login again.' : 'Password changed.'
    );
    if (result?.reauthRequired) {
      currentUser = null;
      if (stream) stream.close();
      window.location.reload();
    }
  } catch (error) {
    setText('sellerPasswordStatus', error.message || 'Unable to change password');
  }
});

el('sellerTotpSetupBtn')?.addEventListener('click', async () => {
  if (!isSellerAccount()) {
    setText('sellerTotpStatus', 'Seller login required.');
    return;
  }
  setText('sellerTotpStatus', 'Generating TOTP secret...');
  try {
    const data = await api.setupTotp();
    setText(
      'sellerTotpSecretView',
      `Secret: ${data.secret} | Account: ${data.accountName} | Issuer: ${data.issuer}`
    );
    setText('sellerTotpStatus', 'Secret generated. Add it in authenticator and verify below.');
  } catch (error) {
    setText('sellerTotpStatus', error.message || 'Unable to setup TOTP');
  }
});

el('sellerTotpEnableForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isSellerAccount()) {
    setText('sellerTotpStatus', 'Seller login required.');
    return;
  }
  const form = event.currentTarget;
  setText('sellerTotpStatus', 'Enabling TOTP...');
  try {
    const result = await api.enableTotp(String(form.code?.value || '').trim());
    currentUser = result.user || currentUser;
    setText('sellerAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderSellerProfile();
    form.reset();
    setText('sellerTotpStatus', 'TOTP enabled.');
  } catch (error) {
    setText('sellerTotpStatus', error.message || 'Unable to enable TOTP');
  }
});

el('sellerTotpDisableBtn')?.addEventListener('click', async () => {
  if (!isSellerAccount()) {
    setText('sellerTotpStatus', 'Seller login required.');
    return;
  }
  const currentPassword = window.prompt('Enter current password (or leave blank to use TOTP code):') || '';
  let totpCode = '';
  if (!currentPassword) {
    totpCode = window.prompt('Enter 6-digit TOTP code:') || '';
  }
  setText('sellerTotpStatus', 'Disabling TOTP...');
  try {
    const result = await api.disableTotp({
      currentPassword: currentPassword || undefined,
      totpCode: totpCode || undefined
    });
    currentUser = result.user || currentUser;
    setText('sellerAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderSellerProfile();
    setText('sellerTotpStatus', 'TOTP disabled.');
  } catch (error) {
    setText('sellerTotpStatus', error.message || 'Unable to disable TOTP');
  }
});

el('sellerOrdersList')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewBtn = target.closest('.seller-order-view-btn');
  if (viewBtn) {
    const item = currentSellerOrders.find((row) => Number(row.id) === Number(viewBtn.dataset.id));
    if (!item) return;
    window.alert(
      `Order #${item.id}\nItem: ${item.listingTitle}\nBuyer: ${item.buyerName || item.buyerEmail}\nStatus: ${prettyOrderStatus(
        item.status
      )}\nPayment: ${item.paymentMode} (${item.paymentState})\nTotal: ${formatInr(item.payableTotal)}`
    );
    return;
  }

  const statusBtn = target.closest('.seller-order-status-btn');
  if (!statusBtn) return;
  const orderId = Number(statusBtn.dataset.id);
  const status = String(statusBtn.dataset.status || '').trim();
  if (!orderId || !status) return;
  try {
    setText('sellerOrdersStatus', `Updating order #${orderId}...`);
    await api.updateOrderStatus(orderId, status);
    setText('sellerOrdersStatus', `Order #${orderId} updated to ${prettyOrderStatus(status)}.`);
    window.dispatchEvent(new CustomEvent('kp:orders:refresh'));
    await refreshSellerOrders();
  } catch (error) {
    setText('sellerOrdersStatus', error.message || 'Unable to update order status');
  }
});

el('sellerListings')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewBtn = target.closest('.seller-view-listing-btn');
  if (viewBtn) {
    const item = currentListings.find((row) => Number(row.id) === Number(viewBtn.dataset.id));
    if (!item) return;
    window.alert(
      `${item.title}\n${item.city} | ${item.listingType}/${item.category}\n${formatInr(item.price)}\n${item.description || ''}`
    );
    return;
  }

  const editBtn = target.closest('.seller-edit-listing-btn');
  if (editBtn) {
    const item = currentListings.find((row) => Number(row.id) === Number(editBtn.dataset.id));
    if (!item) return;

    const title = window.prompt('Update title', item.title || '');
    if (title === null) return;
    const description = window.prompt('Update description', item.description || '');
    if (description === null) return;
    const priceRaw = window.prompt('Update price (INR)', String(item.price || 0));
    if (priceRaw === null) return;
    const city = window.prompt('Update city', item.city || '');
    if (city === null) return;
    const serviceableCityRaw = window.prompt(
      'Update serviceable cities (comma separated)',
      (item.serviceableCities || []).join(', ')
    );
    if (serviceableCityRaw === null) return;
    const deliveryRateRaw = window.prompt(
      'Delivery rate per 10 KM (INR)',
      String(item.deliveryRatePer10Km ?? 20)
    );
    if (deliveryRateRaw === null) return;

    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      setText('sellerListingStatus', 'Invalid price');
      return;
    }
    const deliveryRatePer10Km = Number(deliveryRateRaw);
    if (!Number.isFinite(deliveryRatePer10Km) || deliveryRatePer10Km < 0) {
      setText('sellerListingStatus', 'Invalid delivery rate.');
      return;
    }

    setText('sellerListingStatus', 'Updating listing...');
    try {
      await api.updateListing(item.id, {
        title: title.trim() || item.title,
        description: description.trim() || item.description,
        category: item.category,
        listingType: item.listingType,
        sellerType: item.sellerType || 'student',
        deliveryMode: item.deliveryMode || 'peer_to_peer',
        deliveryRatePer10Km,
        paymentModes: ['cod'],
        price,
        city: city.trim() || item.city || 'Unknown',
        areaCode: slugifyAreaCode(item.areaCode || city || 'unknown'),
        serviceableAreaCodes: Array.isArray(item.serviceableAreaCodes) ? item.serviceableAreaCodes : [],
        serviceableCities: normalizeCities(serviceableCityRaw),
        publishIndia: Boolean(item.publishIndia),
        latitude: Number(item.latitude),
        longitude: Number(item.longitude)
      });
      setText('sellerListingStatus', `Listing #${item.id} updated.`);
      await refreshListings();
      await refreshBanners();
    } catch (error) {
      setText('sellerListingStatus', error.message || 'Unable to update listing');
    }
    return;
  }

  const deleteBtn = target.closest('.seller-delete-listing-btn');
  if (deleteBtn) {
    const item = currentListings.find((row) => Number(row.id) === Number(deleteBtn.dataset.id));
    if (!item) return;
    const ok = window.confirm(`Delete listing "${item.title}"?`);
    if (!ok) return;

    setText('sellerListingStatus', 'Deleting listing...');
    try {
      await api.deleteListing(item.id);
      setText('sellerListingStatus', `Listing #${item.id} deleted.`);
      await refreshListings();
      await refreshBanners();
    } catch (error) {
      setText('sellerListingStatus', error.message || 'Unable to delete listing');
    }
  }
});

el('sellerBannerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isBannerManager()) {
    setText('sellerBannerStatus', 'Seller/Admin login required.');
    return;
  }
  const form = event.currentTarget;
  setText('sellerBannerStatus', 'Publishing banner...');
  try {
    let imageKey = '';
    let imageUrl = '';
    const file = form.image?.files?.[0];
    if (file && String(file.type || '').startsWith('image/')) {
      const uploaded = await api.uploadBannerImage(file);
      imageKey = uploaded.key || '';
      imageUrl = uploaded.url || '';
    }

    await api.createBanner({
      title: form.title.value.trim(),
      message: form.message.value.trim(),
      linkUrl: (form.linkUrl.value || '/#marketplace').trim(),
      buttonText: (form.buttonText.value || 'View').trim(),
      scope: form.scope.value || 'local',
      priority: Number(form.priority.value || 0),
      isActive: Boolean(form.isActive.checked),
      imageKey,
      imageUrl
    });

    form.reset();
    setText('sellerBannerStatus', 'Banner published.');
    await refreshBanners();
  } catch (error) {
    setText('sellerBannerStatus', error.message || 'Unable to publish banner');
  }
});

el('sellerBannerList')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewBtn = target.closest('.seller-banner-view-btn');
  if (viewBtn) {
    const item = currentBanners.find((row) => Number(row.id) === Number(viewBtn.dataset.id));
    if (!item) return;
    window.alert(`${item.title}\n${item.message || ''}\n${item.linkUrl || '/#marketplace'}`);
    return;
  }

  const editBtn = target.closest('.seller-banner-edit-btn');
  if (editBtn) {
    const item = currentBanners.find((row) => Number(row.id) === Number(editBtn.dataset.id));
    if (!item) return;
    const nextTitle = window.prompt('Banner title', item.title || '');
    if (nextTitle === null) return;
    const nextMessage = window.prompt('Banner text', item.message || '');
    if (nextMessage === null) return;
    const nextLink = window.prompt('Redirect URL', item.linkUrl || '/#marketplace');
    if (nextLink === null) return;
    try {
      await api.updateBanner(item.id, {
        title: nextTitle.trim(),
        message: nextMessage.trim(),
        linkUrl: nextLink.trim() || '/#marketplace'
      });
      setText('sellerBannerStatus', `Banner #${item.id} updated.`);
      await refreshBanners();
    } catch (error) {
      setText('sellerBannerStatus', error.message || 'Unable to update banner');
    }
    return;
  }

  const deleteBtn = target.closest('.seller-banner-delete-btn');
  if (deleteBtn) {
    const item = currentBanners.find((row) => Number(row.id) === Number(deleteBtn.dataset.id));
    if (!item) return;
    const ok = window.confirm(`Delete banner "${item.title}"?`);
    if (!ok) return;
    try {
      await api.deleteBanner(item.id);
      setText('sellerBannerStatus', `Banner #${item.id} deleted.`);
      await refreshBanners();
    } catch (error) {
      setText('sellerBannerStatus', error.message || 'Unable to delete banner');
    }
  }
});

el('sellerLogoutBtn')?.addEventListener('click', async () => {
  try {
    await api.authLogout();
  } finally {
    currentUser = null;
    await feedback?.onAuthChanged?.();
    if (stream) stream.close();
    window.location.reload();
  }
});

setInterval(() => {
  if (isSellerAccount()) refreshListings().catch(() => null);
  if (isSellerAccount()) refreshSellerOrders().catch(() => null);
  if (isBannerManager()) refreshBanners().catch(() => null);
}, 20000);

feedback = initFeedback({
  portal: 'seller',
  getUser: () => currentUser,
  formId: 'sellerSupportForm',
  statusId: 'sellerSupportStatus',
  listId: 'sellerSupportList',
  refreshBtnId: 'sellerSupportRefreshBtn'
});

window.addEventListener('pointerdown', unlockNotificationSound, { once: true });
window.addEventListener('keydown', unlockNotificationSound, { once: true });
window.addEventListener('hashchange', () => {
  syncTabView();
});

handlePortalSwitchSession()
  .then(() => refreshAuth())
  .then(async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await loadGeoOptions(position.coords.latitude, position.coords.longitude).catch(() => null);
        },
        () => null,
        { maximumAge: 180000, timeout: 7000 }
      );
    }
    await refreshListings();
    await refreshSellerOrders();
    await refreshBanners();
    syncTabView();
  })
  .catch(() => null);
