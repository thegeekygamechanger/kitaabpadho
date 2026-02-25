import { api } from './api.js';
import { escapeHtml, formatInr } from './ui.js';

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

let currentUser = null;
let currentListings = [];

function canManageListing(item) {
  if (!currentUser || !item) return false;
  return currentUser.role === 'admin' || Number(item.createdBy) === Number(currentUser.id);
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
        </div>
        <h3 class="card-title">${escapeHtml(item.title || '')}</h3>
        <p class="muted">${escapeHtml(item.city || '')} | Delivery: ${escapeHtml(item.deliveryMode || '')}</p>
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
  try {
    const result = await api.listListings({ limit: 24, offset: 0, sort: 'newest' });
    currentListings = Array.isArray(result.data) ? result.data : [];
    renderListings(currentListings);
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to load listings');
  }
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
    setText('sellerAuthStatus', 'Login successful.');
  } catch (error) {
    setText('sellerAuthStatus', error.message || 'Login failed');
  }
});

el('sellerListingForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) {
    setText('sellerListingStatus', 'Please login first.');
    return;
  }
  const form = event.currentTarget;
  const paymentModes = Array.from(form.querySelectorAll('input[name="paymentModes"]:checked')).map((node) => node.value);
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
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to publish listing');
  }
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
    await refreshAuth();
    window.location.reload();
  }
});

refreshAuth().then(refreshListings).catch(() => null);
