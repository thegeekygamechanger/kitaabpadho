import { api } from './api.js';
import { el, escapeHtml, formatInr, hideModal, renderEmpty, showModal } from './ui.js';

function mediaPreview(media = []) {
  const first = media[0];
  if (!first) return '<div class="card-media"><strong>No Media</strong></div>';
  if (first.mediaType?.startsWith('image/')) {
    return `<div class="card-media"><img src="${escapeHtml(first.url || '')}" alt="listing media" /></div>`;
  }
  return '<div class="card-media"><strong>Image unavailable</strong></div>';
}

function listingTypeClass(type) {
  return `type-${type || 'buy'}`;
}

function primaryActionLabel(type) {
  return type === 'rent' ? 'Rent Now' : 'Buy Now';
}

function asUniqueLocationOptions({ nearbyCities = [], localityOptions = [] } = {}) {
  const options = [];
  const pushUnique = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (options.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
    options.push(normalized);
  };
  nearbyCities.forEach((item) => pushUnique(item.city || item.name));
  localityOptions.forEach((item) => {
    pushUnique(item.name);
    pushUnique(item.filterCity);
    pushUnique(item.city);
  });
  return options.slice(0, 40);
}

export function initMarketplace({ state }) {
  const listingsGrid = el('listingsGrid');
  const categoryFilter = el('categoryFilter');
  const sellerTypeFilter = el('sellerTypeFilter');
  const cityFilter = el('cityFilter');
  const sortFilter = el('sortFilter');
  const scopeTabsRoot = el('listingScopeTabs');
  const applyListingFiltersBtn = el('applyListingFiltersBtn');
  const closeListingDetailBtn = el('closeListingDetailBtn');
  const listingDetailContent = el('listingDetailContent');
  let currentListing = null;
  let geoCityOptions = [];

  function canManageListing(listing) {
    if (!state.user || !listing) return false;
    return state.user.role === 'admin' || Number(listing.createdBy) === Number(state.user.id);
  }

  function filtersFromState() {
    const scope = state.marketplace.scope || 'local';
    const filters = {
      q: state.marketplace.q,
      category: state.marketplace.category,
      sellerType: state.marketplace.sellerType,
      listingType: state.marketplace.listingType,
      city: state.marketplace.city,
      areaCode: state.location.areaCode,
      scope,
      sort: state.marketplace.sort,
      limit: state.marketplace.limit,
      offset: state.marketplace.offset
    };
    if (scope === 'local' && state.location.coords) {
      filters.lat = state.location.coords.lat;
      filters.lon = state.location.coords.lon;
      filters.radiusKm = state.location.radiusKm || 250;
    }
    return filters;
  }

  function syncFiltersFromControls() {
    state.marketplace.category = categoryFilter?.value || '';
    state.marketplace.sellerType = sellerTypeFilter?.value || '';
    state.marketplace.city = cityFilter?.value || '';
    state.marketplace.sort = sortFilter?.value || 'newest';
  }

  function renderCityFilterOptions() {
    if (!cityFilter) return;
    const selected = state.marketplace.city || '';
    cityFilter.innerHTML = `<option value="">Nearby Cities & Localities</option>${geoCityOptions
      .map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`)
      .join('')}`;
    if (!geoCityOptions.length) {
      cityFilter.innerHTML = '<option value="">Use GPS to load nearby city/locality</option>';
      state.marketplace.city = '';
      return;
    }
    const hasSelected = geoCityOptions.some((item) => item.toLowerCase() === selected.toLowerCase());
    cityFilter.value = hasSelected ? selected : '';
  }

  function syncControlsFromState() {
    if (categoryFilter) categoryFilter.value = state.marketplace.category;
    if (sellerTypeFilter) sellerTypeFilter.value = state.marketplace.sellerType;
    if (sortFilter) sortFilter.value = state.marketplace.sort;
    renderCityFilterOptions();
    syncScopeTabs();
  }

  function syncListingTypeTabs() {
    document.querySelectorAll('#listingTypeTabs .tab-btn').forEach((button) => {
      const active = button.dataset.type === state.marketplace.listingType;
      button.classList.toggle('active', active);
    });
  }

  function syncScopeTabs() {
    document.querySelectorAll('#listingScopeTabs .tab-btn').forEach((button) => {
      const active = button.dataset.scope === (state.marketplace.scope || 'local');
      button.classList.toggle('active', active);
    });
  }

  function renderListings(items) {
    if (!Array.isArray(items) || items.length === 0) {
      listingsGrid.innerHTML = renderEmpty('No listings found for these filters.');
      return;
    }
    listingsGrid.innerHTML = items
      .map((item) => {
        const media = Array.isArray(item.media) ? item.media : [];
        const area = item.areaCode ? item.areaCode.replaceAll('_', ' ') : 'unknown';
        const distanceLabel =
          typeof item.distanceKm === 'number' ? `<span>${Number(item.distanceKm).toFixed(1)} km away</span>` : '';
        const indiaBadge = item.publishIndia ? `<span class="pill type-sell">India</span>` : '';
        return `<article class="card">
          ${mediaPreview(media)}
          <div class="card-body">
            <div class="card-meta">
              <span class="pill ${listingTypeClass(item.listingType)}">${escapeHtml(item.listingType)}</span>
              <span class="pill type-buy">${escapeHtml(item.sellerType || 'student')}</span>
              ${indiaBadge}
              <span class="muted">${escapeHtml(area)}</span>
              ${distanceLabel}
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="muted">${escapeHtml(item.city)} | ${escapeHtml(item.ownerName || 'Student')}</p>
            <p class="muted">Delivery: ${escapeHtml(item.deliveryMode || 'peer_to_peer')}</p>
            <div class="card-price">${formatInr(item.price)}</div>
            <p class="muted">${escapeHtml(String(item.description || '').slice(0, 90))}</p>
            <div class="card-actions">
              <button class="kb-btn kb-btn-primary view-listing-btn" type="button" data-id="${item.id}">${primaryActionLabel(
                item.listingType
              )}</button>
              <button class="kb-btn kb-btn-dark view-listing-btn" type="button" data-id="${item.id}">View Details</button>
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
      const imageMedia = media.filter((item) => item.mediaType?.startsWith('image/') && item.url);
      const heroMedia = imageMedia[0];
      const actionLabel = primaryActionLabel(listing.listingType);
      const chips = [
        `<span class="pill ${listingTypeClass(listing.listingType)}">${escapeHtml(listing.listingType || 'buy')}</span>`,
        `<span class="pill type-buy">${escapeHtml(listing.category || 'stationery')}</span>`,
        `<span class="pill type-rent">${escapeHtml(listing.sellerType || 'student')}</span>`,
        listing.publishIndia ? `<span class="pill type-sell">India</span>` : ''
      ].join('');
      const paymentText =
        Array.isArray(listing.paymentModes) && listing.paymentModes.length ? listing.paymentModes.join(', ') : 'cod';

      listingDetailContent.innerHTML = `
        <article class="listing-detail">
          <div class="listing-detail-media">
            <div class="listing-detail-main-media">
              ${
                heroMedia
                  ? `<img id="listingDetailMainImage" src="${escapeHtml(heroMedia.url)}" alt="${escapeHtml(listing.title || 'Listing image')}" />`
                  : `<div class="listing-detail-no-media">No product image uploaded</div>`
              }
            </div>
            ${
              imageMedia.length > 1
                ? `<div class="listing-detail-thumb-row">
                    ${imageMedia
                      .slice(0, 8)
                      .map(
                        (item) => `<button class="listing-thumb-btn" type="button" data-url="${escapeHtml(item.url)}">
                          <img src="${escapeHtml(item.url)}" alt="listing thumb" />
                        </button>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
          </div>
          <div class="listing-detail-info">
            <h3>${escapeHtml(listing.title)}</h3>
            <div class="card-meta">${chips}</div>
            <p class="listing-detail-price">${formatInr(listing.price)}</p>
            <p class="muted">Seller: ${escapeHtml(listing.ownerName || 'Student')} ${listing.ownerEmail ? `(${escapeHtml(listing.ownerEmail)})` : ''}</p>
            <p class="muted">Location: ${escapeHtml(listing.city || 'Unknown')} | ${escapeHtml(
              (listing.areaCode || 'unknown').replaceAll('_', ' ')
            )}</p>
            <p class="muted">Serviceable Areas: ${escapeHtml((listing.serviceableAreaCodes || []).join(', ') || '-')}</p>
            <p class="muted">Serviceable Cities: ${escapeHtml((listing.serviceableCities || []).join(', ') || '-')}</p>
            <p class="muted">Delivery: ${escapeHtml(listing.deliveryMode || 'peer_to_peer')} | Payments: ${escapeHtml(paymentText)}</p>
            <p class="listing-detail-description">${escapeHtml(listing.description || '')}</p>
            <div class="drawer-actions">
              <button class="kb-btn kb-btn-primary listing-primary-action-btn" data-id="${listing.id}" data-amount="${Number(
        listing.price || 0
      )}" data-kind="${escapeHtml(listing.listingType || 'buy')}" type="button">
                ${actionLabel}
              </button>
              <button class="kb-btn kb-btn-dark razorpay-order-btn" data-id="${listing.id}" data-amount="${Number(
        listing.price || 0
      )}" type="button">
                Create Razorpay Order
              </button>
              ${
                canManage
                  ? `<button class="kb-btn kb-btn-dark edit-listing-btn" data-id="${listing.id}" type="button">Edit</button>
                     <button class="kb-btn kb-btn-dark delete-listing-btn" data-id="${listing.id}" type="button">Delete</button>`
                  : ''
              }
            </div>
          </div>
        </article>
      `;
      showModal('listingDetailModal');
    } catch (error) {
      currentListing = null;
      listingDetailContent.innerHTML = `<p class="state-error">${escapeHtml(error.message)}</p>`;
      showModal('listingDetailModal');
    }
  }

  applyListingFiltersBtn?.addEventListener('click', () => {
    syncFiltersFromControls();
    refreshListings();
  });

  cityFilter?.addEventListener('change', () => {
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

  scopeTabsRoot?.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.marketplace.scope = button.dataset.scope || 'local';
      if (state.marketplace.scope === 'india') {
        state.marketplace.city = '';
        state.location.areaCode = 'all';
      }
      syncControlsFromState();
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
    const thumbBtn = target.closest('.listing-thumb-btn');
    if (thumbBtn) {
      const mainImage = el('listingDetailMainImage');
      const nextUrl = thumbBtn.dataset.url || '';
      if (mainImage instanceof HTMLImageElement && nextUrl) mainImage.src = nextUrl;
      return;
    }

    const primaryActionBtn = target.closest('.listing-primary-action-btn');
    if (primaryActionBtn) {
      try {
        const amount = Number(primaryActionBtn.dataset.amount || 0);
        const listingId = primaryActionBtn.dataset.id || '';
        const actionKind = primaryActionBtn.dataset.kind === 'rent' ? 'rent' : 'buy';
        const result = await api.createRazorpayOrder({
          amount,
          receipt: `${actionKind}-${listingId}-${Date.now()}`
        });
        window.alert(`${actionKind === 'rent' ? 'Rent' : 'Buy'} order ready: ${result.order?.id || 'N/A'}`);
      } catch (error) {
        window.alert(error.message || 'Unable to create order');
      }
      return;
    }

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
          paymentModes:
            Array.isArray(currentListing.paymentModes) && currentListing.paymentModes.length
              ? currentListing.paymentModes
              : ['cod'],
          price: nextPrice,
          city: nextCity.trim() || currentListing.city || 'Unknown',
          areaCode: currentListing.areaCode || 'unknown',
          serviceableAreaCodes: Array.isArray(currentListing.serviceableAreaCodes)
            ? currentListing.serviceableAreaCodes
            : [],
          serviceableCities: Array.isArray(currentListing.serviceableCities) ? currentListing.serviceableCities : [],
          publishIndia: Boolean(currentListing.publishIndia),
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
    setGeoFilterOptions(geoOptions) {
      geoCityOptions = asUniqueLocationOptions(geoOptions);
      renderCityFilterOptions();
    },
    setSearchQuery(query) {
      state.marketplace.q = query;
    },
    setAreaCode(areaCode) {
      if (state.marketplace.scope === 'india') return;
      state.location.areaCode = areaCode;
    },
    setCityFromArea(cityName) {
      if (state.marketplace.scope === 'india') {
        state.marketplace.city = '';
      } else {
        state.marketplace.city = cityName || '';
      }
      syncControlsFromState();
    },
    onLocationChanged(coords) {
      state.location.coords = coords;
    }
  };
}
