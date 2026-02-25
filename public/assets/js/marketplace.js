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

function haversineDistanceKm(fromLat, fromLon, toLat, toLon) {
  const lat1 = Number(fromLat);
  const lon1 = Number(fromLon);
  const lat2 = Number(toLat);
  const lon2 = Number(toLon);
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizePaymentModes(rawModes) {
  return ['cod'];
}

function paymentModeLabel(mode) {
  if (mode === 'cod') return 'Cash on Delivery';
  return 'Cash on Delivery';
}

function prettyPaymentModes(modes) {
  if (!Array.isArray(modes) || !modes.length) return 'cash on delivery';
  return 'cash on delivery';
}

function statusRail(status = '') {
  const flow = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered'];
  if (status === 'cancelled') {
    return `<div class="order-status-rail"><span class="order-step current">cancelled</span></div>`;
  }
  const currentIndex = flow.indexOf(status);
  return `<div class="order-status-rail">${flow
    .map((step, index) => `<span class="order-step${index === currentIndex ? ' current' : ''}">${escapeHtml(step.replaceAll('_', ' '))}</span>`)
    .join('')}</div>`;
}

export function initMarketplace({ state, openAuthModal }) {
  const listingsGrid = el('listingsGrid');
  const categoryFilter = el('categoryFilter');
  const sellerTypeFilter = el('sellerTypeFilter');
  const cityFilter = el('cityFilter');
  const sortFilter = el('sortFilter');
  const scopeTabsRoot = el('listingScopeTabs');
  const applyListingFiltersBtn = el('applyListingFiltersBtn');
  const closeListingDetailBtn = el('closeListingDetailBtn');
  const listingDetailContent = el('listingDetailContent');
  const orderSuccessContent = el('orderSuccessContent');
  const closeOrderSuccessBtn = el('closeOrderSuccessBtn');

  let currentListing = null;
  let geoCityOptions = [];
  let currentListingImages = [];
  let currentImageIndex = 0;
  let checkoutQuantity = 1;
  let checkoutPaymentMode = 'cod';
  let checkoutStatus = '';
  let checkoutOrder = null;
  let focusCheckoutOnOpen = false;

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

  function calculateCheckoutTotals(listing) {
    const quantity = Math.min(10, Math.max(1, Number(checkoutQuantity || 1)));
    checkoutQuantity = quantity;
    const unitPrice = Number(listing?.price || 0);
    const itemTotal = unitPrice * quantity;
    let distanceKm = typeof listing?.distanceKm === 'number' ? Number(listing.distanceKm) : 0;
    if (!(distanceKm > 0) && state.location?.coords && listing?.latitude && listing?.longitude) {
      distanceKm = haversineDistanceKm(
        state.location.coords.lat,
        state.location.coords.lon,
        Number(listing.latitude),
        Number(listing.longitude)
      );
    }
    const deliveryRatePer10Km = Math.max(0, Number(listing?.deliveryRatePer10Km || 20));
    const deliveryCharge = distanceKm > 0 ? Math.ceil(distanceKm / 10) * deliveryRatePer10Km : 0;
    const payableTotal = itemTotal + deliveryCharge;
    return {
      quantity,
      unitPrice,
      itemTotal,
      distanceKm,
      deliveryRatePer10Km,
      deliveryCharge,
      payableTotal
    };
  }

  function setImageAt(index) {
    if (!currentListingImages.length) {
      currentImageIndex = 0;
      return;
    }
    const max = currentListingImages.length - 1;
    currentImageIndex = Math.min(max, Math.max(0, index));
  }

  function renderListingDetail() {
    if (!currentListing) return;
    const listing = currentListing;
    const canManage = canManageListing(listing);
    const media = Array.isArray(listing.media) ? listing.media : [];
    const imageMedia = media.filter((item) => item.mediaType?.startsWith('image/') && item.url).slice(0, 10);
    currentListingImages = imageMedia.map((item) => item.url);
    if (!currentListingImages.length) currentImageIndex = 0;
    setImageAt(currentImageIndex);

    const actionLabel = primaryActionLabel(listing.listingType);
    const chips = [
      `<span class="pill ${listingTypeClass(listing.listingType)}">${escapeHtml(listing.listingType || 'buy')}</span>`,
      `<span class="pill type-buy">${escapeHtml(listing.category || 'stationery')}</span>`,
      `<span class="pill type-rent">${escapeHtml(listing.sellerType || 'student')}</span>`,
      listing.publishIndia ? `<span class="pill type-sell">India</span>` : ''
    ].join('');

    const paymentModes = normalizePaymentModes(listing.paymentModes);
    if (!paymentModes.includes(checkoutPaymentMode)) {
      checkoutPaymentMode = paymentModes.includes('cod') ? 'cod' : paymentModes[0];
    }

    const checkout = calculateCheckoutTotals(listing);
    const checkoutOrderStatus = checkoutOrder
      ? `Order #${checkoutOrder.id} created. Current status: ${String(checkoutOrder.status || 'received').replaceAll('_', ' ')}.`
      : '';
    const mediaCounter =
      currentListingImages.length > 1
        ? `<span class="listing-image-counter">${currentImageIndex + 1}/${currentListingImages.length}</span>`
        : '';

    listingDetailContent.innerHTML = `
      <article class="listing-detail">
        <div class="listing-detail-media">
          <div class="listing-detail-main-media">
            ${
              currentListingImages[currentImageIndex]
                ? `<img id="listingDetailMainImage" src="${escapeHtml(currentListingImages[currentImageIndex])}" alt="${escapeHtml(listing.title || 'Listing image')}" />`
                : `<div class="listing-detail-no-media">No product image uploaded</div>`
            }
            ${
              currentListingImages.length > 1
                ? `<button class="listing-carousel-btn prev" type="button" data-dir="-1" aria-label="Previous image">&#8249;</button>
                   <button class="listing-carousel-btn next" type="button" data-dir="1" aria-label="Next image">&#8250;</button>
                   ${mediaCounter}`
                : ''
            }
          </div>
          ${
            imageMedia.length > 1
              ? `<div class="listing-detail-thumb-row">
                  ${imageMedia
                    .map(
                      (item, index) => `<button class="listing-thumb-btn" type="button" data-index="${index}" data-url="${escapeHtml(item.url)}">
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
          <p class="muted">Location: ${escapeHtml(listing.city || 'Unknown')} | ${escapeHtml((listing.areaCode || 'unknown').replaceAll('_', ' '))}</p>
          <p class="muted">Delivery: ${escapeHtml(listing.deliveryMode || 'peer_to_peer')} | Payments: ${escapeHtml(prettyPaymentModes(paymentModes))}</p>
          <p class="listing-detail-description">${escapeHtml(listing.description || '')}</p>

          <section id="listingCheckoutBox" class="checkout-box">
            <h4>${actionLabel} Checkout</h4>
            <div class="checkout-grid">
              <label class="field-label" for="checkoutQtyInput">Quantity</label>
              <label class="field-label" for="checkoutPaymentModeSelect">Payment Method</label>
              <input id="checkoutQtyInput" class="kb-input" type="number" min="1" max="10" value="${checkout.quantity}" />
              <select id="checkoutPaymentModeSelect" class="kb-select">
                ${paymentModes
                  .map(
                    (mode) =>
                      `<option value="${escapeHtml(mode)}" ${mode === checkoutPaymentMode ? 'selected' : ''}>${escapeHtml(paymentModeLabel(mode))}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="checkout-summary">
              <span>Item Total: ${formatInr(checkout.itemTotal)}</span>
              <span>Distance: ${escapeHtml(checkout.distanceKm > 0 ? `${checkout.distanceKm.toFixed(1)} km` : 'not detected')}</span>
              <span>Delivery Charge (${formatInr(checkout.deliveryRatePer10Km)} per 10 KM): ${formatInr(checkout.deliveryCharge)}</span>
              <strong>Total Payable: ${formatInr(checkout.payableTotal)}</strong>
            </div>
            ${checkoutOrder ? statusRail(checkoutOrder.status) : ''}
            <div class="drawer-actions">
              <button class="kb-btn kb-btn-primary place-order-btn" data-id="${listing.id}" type="button">${actionLabel}</button>
              ${
                canManage
                  ? `<button class="kb-btn kb-btn-dark edit-listing-btn" data-id="${listing.id}" type="button">Edit</button>
                     <button class="kb-btn kb-btn-dark delete-listing-btn" data-id="${listing.id}" type="button">Delete</button>`
                  : ''
              }
            </div>
            <p class="muted">${escapeHtml(checkoutStatus || checkoutOrderStatus)}</p>
          </section>
        </div>
      </article>
    `;
    showModal('listingDetailModal');
    if (focusCheckoutOnOpen) {
      focusCheckoutOnOpen = false;
      requestAnimationFrame(() => {
        document.getElementById('listingCheckoutBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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
              <button class="kb-btn kb-btn-primary view-listing-btn" type="button" data-id="${item.id}" data-open="checkout">${primaryActionLabel(item.listingType)}</button>
              <button class="kb-btn kb-btn-dark view-listing-btn" type="button" data-id="${item.id}" data-open="details">View Details</button>
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

  async function openListingDetails(listingId, { focusCheckout = false } = {}) {
    try {
      const listing = await api.listingById(listingId);
      currentListing = listing;
      currentImageIndex = 0;
      checkoutQuantity = 1;
      checkoutStatus = '';
      checkoutOrder = null;
      focusCheckoutOnOpen = Boolean(focusCheckout);
      const modes = normalizePaymentModes(listing.paymentModes);
      checkoutPaymentMode = modes.includes('cod') ? 'cod' : modes[0];
      renderListingDetail();
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
    openListingDetails(button.dataset.id, { focusCheckout: String(button.dataset.open || '') === 'checkout' });
  });

  async function ensureAuthedForOrder() {
    if (state.user?.id) return true;
    try {
      const me = await api.authMe();
      if (me?.authenticated && me?.user?.id) {
        state.user = me.user;
        return true;
      }
    } catch {
      // fall through
    }
    return false;
  }

  function showOrderSuccessModal({ order, listing }) {
    if (!orderSuccessContent || !order) return;
    const actionLabel = String(order.actionKind || listing?.listingType || 'buy').toUpperCase();
    const paymentMessage = 'Cash on Delivery selected. Seller received your order request.';
    orderSuccessContent.innerHTML = `
      <div class="order-success-head">
        <p class="order-success-kicker">Order Sent Successfully</p>
        <h3>${escapeHtml(actionLabel)} order #${escapeHtml(String(order.id))} placed</h3>
      </div>
      <p class="muted">Item: ${escapeHtml(order.listingTitle || listing?.title || 'Listing')}</p>
      <p class="muted">Seller has received this request and can start processing now.</p>
      <div class="order-success-summary">
        <span>Total: ${formatInr(order.payableTotal || order.totalPrice || 0)}</span>
        <span>Status: ${escapeHtml(String(order.status || 'received').replaceAll('_', ' '))}</span>
      </div>
      <p class="muted">${escapeHtml(paymentMessage)}</p>
      <div class="drawer-actions">
        <button class="kb-btn kb-btn-primary order-success-view-orders-btn" type="button">View Orders</button>
        <button class="kb-btn kb-btn-ghost order-success-continue-btn" type="button">Continue Browsing</button>
      </div>
    `;
    showModal('orderSuccessModal');
  }

  function hideOrderSuccessModal() {
    hideModal('orderSuccessModal');
  }

  listingDetailContent?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'checkoutQtyInput') {
      checkoutQuantity = Math.min(10, Math.max(1, Number(target.value || 1)));
      renderListingDetail();
      return;
    }
    if (target.id === 'checkoutPaymentModeSelect') {
      checkoutPaymentMode = String(target.value || 'cod').toLowerCase();
      renderListingDetail();
    }
  });

  listingDetailContent?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const thumbBtn = target.closest('.listing-thumb-btn');
    if (thumbBtn) {
      const index = Number(thumbBtn.dataset.index || 0);
      setImageAt(index);
      renderListingDetail();
      return;
    }

    const carouselBtn = target.closest('.listing-carousel-btn');
    if (carouselBtn) {
      const dir = Number(carouselBtn.dataset.dir || 1);
      setImageAt(currentImageIndex + dir);
      if (currentImageIndex < 0) currentImageIndex = 0;
      if (currentImageIndex >= currentListingImages.length) currentImageIndex = currentListingImages.length - 1;
      renderListingDetail();
      return;
    }

    const placeOrderBtn = target.closest('.place-order-btn');
    if (placeOrderBtn) {
      const authed = await ensureAuthedForOrder();
      if (!authed) {
        openAuthModal?.('Login required to place order.');
        return;
      }
      if (!currentListing) return;
      const action = currentListing.listingType === 'rent' ? 'rent' : 'buy';
      const payload = {
        listingId: currentListing.id,
        action,
        quantity: checkoutQuantity,
        paymentMode: checkoutPaymentMode,
        buyerLat: state.location?.coords?.lat,
        buyerLon: state.location?.coords?.lon,
        buyerCity: state.location?.selectedCity || state.marketplace?.city || '',
        buyerAreaCode: state.location?.areaCode || ''
      };
      checkoutStatus = 'Placing order...';
      renderListingDetail();
      try {
        const result = await api.createMarketplaceOrder(payload);
        checkoutOrder = result.order || null;
        checkoutStatus = checkoutOrder
          ? `Order #${checkoutOrder.id} placed successfully.`
          : 'Order placed successfully.';
        window.dispatchEvent(new CustomEvent('kp:orders:refresh'));
        if (checkoutOrder) {
          showOrderSuccessModal({ order: checkoutOrder, listing: currentListing });
        }
        renderListingDetail();
      } catch (error) {
        if (Number(error.status) === 401) {
          openAuthModal?.('Login required to place order.');
          return;
        }
        checkoutStatus = error.message || 'Unable to place order';
        renderListingDetail();
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
          deliveryRatePer10Km: Number(currentListing.deliveryRatePer10Km || 20),
          paymentModes: ['cod'],
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
    currentListingImages = [];
    currentImageIndex = 0;
    checkoutOrder = null;
    checkoutStatus = '';
    hideModal('listingDetailModal');
  });

  closeOrderSuccessBtn?.addEventListener('click', () => {
    hideOrderSuccessModal();
  });

  orderSuccessContent?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.order-success-view-orders-btn')) {
      hideOrderSuccessModal();
      window.location.hash = '#ordersPanel';
      window.dispatchEvent(new CustomEvent('kp:orders:refresh'));
      return;
    }
    if (target.closest('.order-success-continue-btn')) {
      hideOrderSuccessModal();
    }
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
