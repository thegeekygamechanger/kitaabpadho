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
      </div>
    </article>`
    )
    .join('');
}

async function refreshListings() {
  try {
    const result = await api.listListings({ limit: 24, offset: 0, sort: 'newest' });
    renderListings(result.data || []);
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
    await api.createListing({
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
    form.reset();
    setText('sellerListingStatus', 'Listing published.');
    await refreshListings();
  } catch (error) {
    setText('sellerListingStatus', error.message || 'Unable to publish listing');
  }
});

el('sellerRefreshListingsBtn')?.addEventListener('click', () => refreshListings().catch(() => null));

el('sellerLogoutBtn')?.addEventListener('click', async () => {
  try {
    await api.authLogout();
  } finally {
    await refreshAuth();
    window.location.reload();
  }
});

refreshAuth().then(refreshListings).catch(() => null);
