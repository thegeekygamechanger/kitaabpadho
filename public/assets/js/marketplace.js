import { api } from './api.js';
import { el, escapeHtml, formatInr, hideModal, renderEmpty, setText, showModal } from './ui.js';

function mediaPreview(media = []) {
  const first = media[0];
  if (!first) return '<div class="card-media"><strong>No Media</strong></div>';
  if (first.mediaType?.startsWith('image/')) {
    return `<div class="card-media"><img src="${escapeHtml(first.url || '')}" alt="listing media" /></div>`;
  }
  if (first.mediaType?.startsWith('video/')) {
    return `<div class="card-media"><video src="${escapeHtml(first.url || '')}" muted playsinline></video></div>`;
  }
  return '<div class="card-media"><strong>PDF Attached</strong></div>';
}

function listingTypeClass(type) {
  return `type-${type || 'buy'}`;
}

export function initMarketplace({ state, openAuthModal }) {
  const listingsGrid = el('listingsGrid');
  const listingForm = el('listingForm');
  const toggleListingFormBtn = el('toggleListingFormBtn');
  const closeListingFormBtn = el('closeListingFormBtn');
  const categoryFilter = el('categoryFilter');
  const cityFilter = el('cityFilter');
  const sortFilter = el('sortFilter');
  const applyListingFiltersBtn = el('applyListingFiltersBtn');
  const closeListingDetailBtn = el('closeListingDetailBtn');
  const listingDetailContent = el('listingDetailContent');
  let currentListing = null;

  function canManageListing(listing) {
    if (!state.user || !listing) return false;
    return state.user.role === 'admin' || Number(listing.createdBy) === Number(state.user.id);
  }

  function filtersFromState() {
    const filters = {
      q: state.marketplace.q,
      category: state.marketplace.category,
      listingType: state.marketplace.listingType,
      city: state.marketplace.city,
      areaCode: state.location.areaCode,
      sort: state.marketplace.sort,
      limit: state.marketplace.limit,
      offset: state.marketplace.offset
    };
    if (state.location.coords) {
      filters.lat = state.location.coords.lat;
      filters.lon = state.location.coords.lon;
      filters.radiusKm = state.location.radiusKm || 200;
    }
    return filters;
  }

  function syncFiltersFromControls() {
    state.marketplace.category = categoryFilter?.value || '';
    state.marketplace.city = cityFilter?.value.trim() || '';
    state.marketplace.sort = sortFilter?.value || 'newest';
  }

  function syncControlsFromState() {
    if (categoryFilter) categoryFilter.value = state.marketplace.category;
    if (cityFilter) cityFilter.value = state.marketplace.city;
    if (sortFilter) sortFilter.value = state.marketplace.sort;
  }

  function syncListingTypeTabs() {
    document.querySelectorAll('#listingTypeTabs .tab-btn').forEach((button) => {
      const active = button.dataset.type === state.marketplace.listingType;
      button.classList.toggle('active', active);
    });
    if (listingForm?.listingType) listingForm.listingType.value = state.marketplace.listingType;
  }

  function renderListings(items) {
    if (!Array.isArray(items) || items.length === 0) {
      listingsGrid.innerHTML = renderEmpty('No listings found for these filters.');
      return;
    }
    listingsGrid.innerHTML = items
      .map((item) => {
        const media = Array.isArray(item.media) ? item.media : [];
        const area = item.areaCode ? item.areaCode.replaceAll('_', ' ') : 'other';
        const distanceLabel =
          typeof item.distanceKm === 'number' ? `<span>${Number(item.distanceKm).toFixed(1)} km away</span>` : '';
        return `<article class="card">
          ${mediaPreview(media)}
          <div class="card-body">
            <div class="card-meta">
              <span class="pill ${listingTypeClass(item.listingType)}">${escapeHtml(item.listingType)}</span>
              <span class="pill type-buy">${escapeHtml(item.sellerType || 'student')}</span>
              <span class="muted">${escapeHtml(area)}</span>
              ${distanceLabel}
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="muted">${escapeHtml(item.city)} | ${escapeHtml(item.ownerName || 'Student')}</p>
            <p class="muted">Delivery: ${escapeHtml(item.deliveryMode || 'peer_to_peer')}</p>
            <div class="card-price">${formatInr(item.price)}</div>
            <p class="muted">${escapeHtml(String(item.description || '').slice(0, 90))}</p>
            <div class="card-actions">
              <button class="kb-btn kb-btn-dark view-listing-btn" type="button" data-id="${item.id}">View</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
  }

  async function refreshListings() {
    if (!listingsGrid) return;
    listingsGrid.innerHTML = renderEmpty('Loading listings...');
    try {
      const result = await api.listListings(filtersFromState());
      renderListings(result.data || []);
    } catch (error) {
      listingsGrid.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message)}</article>`;
    }
  }

  async function openListingDetails(listingId) {
    try {
      const listing = await api.listingById(listingId);
      currentListing = listing;
      const canManage = canManageListing(listing);
      const media = Array.isArray(listing.media) ? listing.media : [];
      const mediaHtml =
        media.length === 0
          ? '<p class="muted">No media uploaded yet.</p>'
          : media
              .map((item) => {
                if (item.mediaType?.startsWith('image/')) {
                  return `<img src="${escapeHtml(item.url || '')}" alt="" style="width:100%;max-width:220px;border-radius:10px" />`;
                }
                if (item.mediaType?.startsWith('video/')) {
                  return `<video src="${escapeHtml(item.url || '')}" controls style="width:100%;max-width:220px;border-radius:10px"></video>`;
                }
                return `<a class="kb-btn kb-btn-ghost" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer">Open PDF</a>`;
              })
              .join('');

      listingDetailContent.innerHTML = `
        <h3>${escapeHtml(listing.title)}</h3>
        <p class="muted">${escapeHtml(listing.city)} | ${escapeHtml(
        (listing.areaCode || 'other').replaceAll('_', ' ')
      )}</p>
        <p><strong>${formatInr(listing.price)}</strong> | ${escapeHtml(listing.listingType)}</p>
        <p class="muted">Seller Type: ${escapeHtml(listing.sellerType || 'student')} | Delivery: ${escapeHtml(
        listing.deliveryMode || 'peer_to_peer'
      )}</p>
        <p class="muted">Payments: ${escapeHtml(Array.isArray(listing.paymentModes) ? listing.paymentModes.join(', ') : 'cod')}</p>
        <p>${escapeHtml(listing.description)}</p>
        <p class="muted">Owner: ${escapeHtml(listing.ownerName || 'Student')} ${
        listing.ownerEmail ? `(${escapeHtml(listing.ownerEmail)})` : ''
      }</p>
        <div class="drawer-actions">
          <button class="kb-btn kb-btn-primary razorpay-order-btn" data-id="${listing.id}" data-amount="${Number(listing.price || 0)}" type="button">
            Create Razorpay Order
          </button>
          ${
            canManage
              ? `<button class="kb-btn kb-btn-dark edit-listing-btn" data-id="${listing.id}" type="button">Edit</button>
                 <button class="kb-btn kb-btn-dark delete-listing-btn" data-id="${listing.id}" type="button">Delete</button>`
              : ''
          }
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.6rem">${mediaHtml}</div>
      `;
      showModal('listingDetailModal');
    } catch (error) {
      currentListing = null;
      listingDetailContent.innerHTML = `<p class="state-error">${escapeHtml(error.message)}</p>`;
      showModal('listingDetailModal');
    }
  }

  async function submitListing(event) {
    event.preventDefault();
    if (!state.user) {
      openAuthModal('Please login to post your listing.');
      return;
    }

    const form = event.currentTarget;
    setText('listingStatus', 'Submitting listing...');
    try {
      const payload = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        category: form.category.value,
        listingType: form.listingType.value,
        sellerType: form.sellerType.value,
        deliveryMode: form.deliveryMode.value,
        paymentModes: Array.from(form.querySelectorAll('input[name="paymentModes"]:checked')).map((node) => node.value),
        price: Number(form.price.value || 0),
        city: form.city.value.trim(),
        areaCode: form.areaCode.value,
        latitude: Number(form.latitude.value),
        longitude: Number(form.longitude.value)
      };
      if (!payload.paymentModes.length) payload.paymentModes = ['cod'];

      const listing = await api.createListing(payload);
      const files = Array.from(form.media.files || []);
      for (const file of files.slice(0, 5)) {
        await api.uploadListingMedia(listing.id, file);
      }

      setText('listingStatus', `Listing #${listing.id} created successfully.`);
      form.reset();
      if (form.listingType) form.listingType.value = state.marketplace.listingType;
      await refreshListings();
    } catch (error) {
      setText('listingStatus', error.message || 'Unable to create listing');
    }
  }

  function toggleListingForm(forceHidden) {
    if (!listingForm) return;
    const shouldHide = typeof forceHidden === 'boolean' ? forceHidden : !listingForm.classList.contains('hidden');
    listingForm.classList.toggle('hidden', shouldHide);
  }

  toggleListingFormBtn?.addEventListener('click', () => toggleListingForm(false));
  closeListingFormBtn?.addEventListener('click', () => toggleListingForm(true));
  listingForm?.addEventListener('submit', submitListing);

  applyListingFiltersBtn?.addEventListener('click', () => {
    syncFiltersFromControls();
    refreshListings();
  });

  document.querySelectorAll('#listingTypeTabs .tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.marketplace.listingType = button.dataset.type || 'buy';
      syncListingTypeTabs();
      refreshListings();
    });
  });

  listingsGrid?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.view-listing-btn');
    if (!button) return;
    openListingDetails(button.dataset.id);
  });

  listingDetailContent?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.razorpay-order-btn');
    if (button) {
      try {
        const amount = Number(button.dataset.amount || 0);
        const listingId = button.dataset.id || '';
        const result = await api.createRazorpayOrder({
          amount,
          receipt: `listing-${listingId}-${Date.now()}`
        });
        window.alert(`Razorpay order created: ${result.order?.id || 'N/A'}`);
      } catch (error) {
        window.alert(error.message || 'Unable to create Razorpay order');
      }
      return;
    }

    const editBtn = target.closest('.edit-listing-btn');
    if (editBtn) {
      if (!currentListing || !canManageListing(currentListing)) return;
      const nextTitle = window.prompt('Update title', currentListing.title || '');
      if (nextTitle === null) return;
      const nextDescription = window.prompt('Update description', currentListing.description || '');
      if (nextDescription === null) return;
      const nextPriceRaw = window.prompt('Update price (INR)', String(currentListing.price || 0));
      if (nextPriceRaw === null) return;
      const nextCity = window.prompt('Update city', currentListing.city || '');
      if (nextCity === null) return;

      const nextPrice = Number(nextPriceRaw);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        window.alert('Invalid price');
        return;
      }

      try {
        await api.updateListing(currentListing.id, {
          title: nextTitle.trim() || currentListing.title,
          description: nextDescription.trim() || currentListing.description,
          category: currentListing.category,
          listingType: currentListing.listingType,
          sellerType: currentListing.sellerType || 'student',
          deliveryMode: currentListing.deliveryMode || 'peer_to_peer',
          paymentModes: Array.isArray(currentListing.paymentModes) && currentListing.paymentModes.length ? currentListing.paymentModes : ['cod'],
          price: nextPrice,
          city: nextCity.trim() || currentListing.city || 'Unknown',
          areaCode: currentListing.areaCode || 'other',
          latitude: Number(currentListing.latitude),
          longitude: Number(currentListing.longitude)
        });
        await refreshListings();
        await openListingDetails(currentListing.id);
      } catch (error) {
        window.alert(error.message || 'Unable to update listing');
      }
      return;
    }

    const deleteBtn = target.closest('.delete-listing-btn');
    if (deleteBtn) {
      if (!currentListing || !canManageListing(currentListing)) return;
      const ok = window.confirm(`Delete listing "${currentListing.title}"?`);
      if (!ok) return;
      try {
        await api.deleteListing(currentListing.id);
        hideModal('listingDetailModal');
        currentListing = null;
        await refreshListings();
      } catch (error) {
        window.alert(error.message || 'Unable to delete listing');
      }
    }
  });

  closeListingDetailBtn?.addEventListener('click', () => {
    currentListing = null;
    hideModal('listingDetailModal');
  });

  syncControlsFromState();
  syncListingTypeTabs();

  return {
    refreshListings,
    setSearchQuery(query) {
      state.marketplace.q = query;
    },
    setAreaCode(areaCode) {
      state.location.areaCode = areaCode;
    },
    setCityFromArea(cityName) {
      state.marketplace.city = cityName || '';
      syncControlsFromState();
    },
    onLocationChanged(coords) {
      state.location.coords = coords;
    }
  };
}
