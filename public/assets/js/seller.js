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
let locationOptions = [];
let stream = null;
let feedback = null;

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

function syncPortalVisibility() {
  const loggedIn = Boolean(currentUser);
  const sellerRole = isSellerAccount();
  const bannerRole = isBannerManager();

  el('sellerWorkspaceNav')?.classList.toggle('hidden', !sellerRole);
  el('sellerBannerNav')?.classList.toggle('hidden', !bannerRole);
  el('sellerSupportNav')?.classList.toggle('hidden', !loggedIn);
  setSectionVisibility('sellerLoginPanel', !loggedIn);
  setSectionVisibility('sellerPostingPanel', sellerRole);
  setSectionVisibility('sellerListingsPanel', sellerRole);
  setSectionVisibility('sellerBannerPanel', bannerRole);
  setSectionVisibility('sellerSupportPanel', loggedIn);

  if (!loggedIn) {
    setText('sellerPortalHint', 'Login to post and manage your listings.');
    return;
  }
  if (!sellerRole && currentUser?.role !== 'admin') {
    setText('sellerPortalHint', `Current role is ${currentUser.role}. Seller role required for posting.`);
    return;
  }
  if (currentUser?.role === 'admin') {
    setText('sellerPortalHint', 'Admin account detected. Listing post is seller-only. Banner manager is available.');
    return;
  }
  setText('sellerPortalHint', 'Seller workspace ready. Post, edit, and delete listings.');
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
  setText('sellerAuthStatus', 'Logging in...');
  try {
    await api.authLogin({
      email: form.email.value.trim(),
      password: form.password.value
    });
    form.reset();
    await refreshAuth();
    if (!isSellerAccount() && currentUser?.role !== 'admin') {
      setText('sellerAuthStatus', 'Login successful, but this account is not a seller account.');
      await refreshListings();
      return;
    }
    setText('sellerAuthStatus', 'Seller login successful.');
    await refreshListings();
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
    setText('sellerAuthStatus', 'Seller account created and logged in.');
    await refreshListings();
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
  const paymentModes = Array.from(form.querySelectorAll('input[name="paymentModes"]:checked')).map((node) => node.value);
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
      paymentModes: paymentModes.length ? paymentModes : ['cod'],
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
    for (const file of files.slice(0, 5)) {
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

    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      setText('sellerListingStatus', 'Invalid price');
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
        paymentModes: Array.isArray(item.paymentModes) && item.paymentModes.length ? item.paymentModes : ['cod'],
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

refreshAuth()
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
    await refreshBanners();
  })
  .catch(() => null);
