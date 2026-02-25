import { api } from './api.js';
import { initFeedback } from './feedback.js';
import { playNotificationSound, unlockNotificationSound } from './sound.js';
import { escapeHtml, formatInr } from './ui.js';

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function normalizeCities(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

let currentUser = null;
let currentListings = [];
let stream = null;
let feedback = null;

function canManageListing(item) {
  if (!currentUser || !item) return false;
  return currentUser.role === 'admin' || Number(item.createdBy) === Number(currentUser.id);
}

function isSellerAccount() {
  return Boolean(currentUser && currentUser.role === 'seller');
}

function syncPortalVisibility() {
  const loggedIn = Boolean(currentUser);
  const isAdminUser = currentUser?.role === 'admin';
  const canUseSellerWorkspace = isSellerAccount();

  el('sellerPostingPanel')?.classList.toggle('hidden', !canUseSellerWorkspace);
  el('sellerListingsPanel')?.classList.toggle('hidden', !canUseSellerWorkspace);

  if (!loggedIn) {
    setText('sellerPortalHint', 'Login to post and manage your listings.');
    return;
  }

  if (isAdminUser) {
    setText('sellerPortalHint', 'Admin account detected. Use /admin for admin actions.');
    return;
  }

  if (!canUseSellerWorkspace) {
    setText('sellerPortalHint', `Current role is ${currentUser.role}. Seller role required for posting.`);
    return;
  }

  setText('sellerPortalHint', 'Seller workspace ready. You can post, edit, and delete your listings.');
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

async function refreshListings() {
  if (!isSellerAccount()) {
    currentListings = [];
    renderListings([]);
    return;
  }
  try {
    const result = await api.listListings({ limit: 24, offset: 0, sort: 'newest' });
    currentListings = Array.isArray(result.data) ? result.data.filter((row) => canManageListing(row)) : [];
    renderListings(currentListings);
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to load listings');
  }
}

function setCityOptions(cities = []) {
  const citySelect = el('sellerCitySelect');
  if (!citySelect) return;
  const uniqueCities = [...new Set((cities || []).map((item) => String(item || '').trim()).filter(Boolean))];
  citySelect.innerHTML = `<option value="">Select city</option>${uniqueCities
    .map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`)
    .join('')}`;
  if (uniqueCities.length > 0) citySelect.value = uniqueCities[0];
}

async function searchCities() {
  const form = el('sellerListingForm');
  if (!form) return;
  const q = String(form.cityQuery?.value || '').trim();
  const areaCode = String(form.areaCode?.value || '').trim();
  try {
    let cities = [];
    const result = await api.locationCities({ q, areaCode, limit: 40 });
    cities = Array.isArray(result.data) ? result.data : [];

    const lat = Number(form.latitude?.value);
    const lon = Number(form.longitude?.value);
    if ((!cities || cities.length === 0) && Number.isFinite(lat) && Number.isFinite(lon)) {
      const nearby = await api.locationNearby(lat, lon).catch(() => null);
      cities = (nearby?.nearbyCities || []).map((item) => item.city).filter(Boolean);
      if (nearby?.current?.city) cities.unshift(nearby.current.city);
      if (nearby?.current?.locality) cities.unshift(nearby.current.locality);
      if (nearby?.localityOptions?.length) {
        cities.push(...nearby.localityOptions.map((item) => item.name).filter(Boolean));
      }
      const serviceableCitiesInput = form.serviceableCities;
      if (serviceableCitiesInput && !String(serviceableCitiesInput.value || '').trim()) {
        const autoCities = (nearby?.nearbyCities || []).slice(0, 6).map((item) => item.city).filter(Boolean);
        serviceableCitiesInput.value = autoCities.join(', ');
      }
    }

    if ((!cities || cities.length === 0) && q) cities = [q];
    setCityOptions(cities);
    setText('sellerListingStatus', `Loaded ${cities.length || 0} city option(s).`);
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to load city options.');
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
      form.latitude.value = String(lat);
      form.longitude.value = String(lon);
      await searchCities();
      setText('sellerListingStatus', `GPS detected: ${lat.toFixed(4)}, ${lon.toFixed(4)}.`);
    },
    () => {
      setText('sellerListingStatus', 'Location permission denied.');
    }
  );
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
    if (!isSellerAccount()) {
      setText('sellerAuthStatus', 'Login successful, but this account is not a seller account.');
      await refreshListings();
      return;
    }
    setText('sellerAuthStatus', 'Seller login successful.');
    await refreshListings();
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
      areaCode: form.areaCode.value,
      serviceableAreaCodes,
      serviceableCities,
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
    await searchCities().catch(() => null);
    await refreshListings();
    playNotificationSound();
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to publish listing');
  }
});

el('sellerCitySearchBtn')?.addEventListener('click', () => {
  searchCities().catch(() => null);
});

el('sellerDetectGpsBtn')?.addEventListener('click', () => {
  detectGpsForSeller().catch(() => null);
});

el('sellerListingForm')
  ?.querySelector('select[name="areaCode"]')
  ?.addEventListener('change', () => {
  searchCities().catch(() => null);
});

el('sellerRefreshListingsBtn')?.addEventListener('click', () => refreshListings().catch(() => null));

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
        areaCode: item.areaCode || 'other',
        serviceableAreaCodes: Array.isArray(item.serviceableAreaCodes) ? item.serviceableAreaCodes : [],
        serviceableCities: normalizeCities(serviceableCityRaw),
        latitude: Number(item.latitude),
        longitude: Number(item.longitude)
      });
      setText('sellerListingStatus', `Listing #${item.id} updated.`);
      await refreshListings();
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
    } catch (error) {
      setText('sellerListingStatus', error.message || 'Unable to delete listing');
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
    await searchCities().catch(() => null);
    await refreshListings();
  })
  .catch(() => null);
