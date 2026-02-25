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
let currentCoords = null;

async function refreshAuth() {
  try {
    const me = await api.authMe();
    currentUser = me.authenticated ? me.user : null;
    setText('deliveryAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
  } catch {
    currentUser = null;
    setText('deliveryAuthBadge', 'Guest');
  }
}

function renderJobs(items) {
  const node = el('deliveryJobs');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No open jobs nearby.</article>`;
    return;
  }

  node.innerHTML = items
    .map((item) => {
      const distance = typeof item.distanceKm === 'number' ? `${Number(item.distanceKm).toFixed(1)} km` : 'distance n/a';
      return `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.status || 'open')}</span>
            <span class="muted">${escapeHtml(distance)}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
          <p class="muted">${escapeHtml(item.pickupCity || '')} | ${escapeHtml(item.pickupAreaCode || '')}</p>
          <p class="muted">${escapeHtml(item.listingType || '')} | ${escapeHtml(item.sellerType || '')}</p>
          <p class="card-price">${escapeHtml(formatInr(item.listingPrice || 0))}</p>
          <div class="card-actions">
            <button class="kb-btn kb-btn-primary claim-job-btn" data-id="${item.id}" type="button">Claim Job</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

async function refreshJobs() {
  try {
    const filters = { limit: 40, offset: 0, status: 'open', radiusKm: 250 };
    if (currentCoords) {
      filters.lat = currentCoords.lat;
      filters.lon = currentCoords.lon;
    }
    const result = await api.listDeliveryJobs(filters);
    renderJobs(result.data || []);
  } catch (error) {
    setText('deliveryStatus', error.message || 'Unable to load delivery jobs');
  }
}

async function detectGps() {
  if (!navigator.geolocation) {
    setText('deliveryStatus', 'Geolocation not supported in this browser.');
    return;
  }
  setText('deliveryStatus', 'Detecting location...');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentCoords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      setText('deliveryStatus', `Location detected: ${currentCoords.lat.toFixed(4)}, ${currentCoords.lon.toFixed(4)}`);
      refreshJobs().catch(() => null);
    },
    () => {
      setText('deliveryStatus', 'Location permission denied.');
    }
  );
}

el('deliveryLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('deliveryStatus', 'Logging in...');
  try {
    await api.authLogin({
      email: form.email.value.trim(),
      password: form.password.value
    });
    form.reset();
    await refreshAuth();
    setText('deliveryStatus', 'Login successful.');
    await refreshJobs();
  } catch (error) {
    setText('deliveryStatus', error.message || 'Login failed');
  }
});

el('detectDeliveryGpsBtn')?.addEventListener('click', () => {
  detectGps();
});

el('deliveryRefreshBtn')?.addEventListener('click', () => {
  refreshJobs().catch(() => null);
});

el('deliveryJobs')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.claim-job-btn');
  if (!button) return;
  if (!currentUser) {
    setText('deliveryStatus', 'Please login first.');
    return;
  }
  try {
    await api.claimDeliveryJob(button.dataset.id);
    setText('deliveryStatus', 'Delivery job claimed.');
    await refreshJobs();
  } catch (error) {
    setText('deliveryStatus', error.message || 'Unable to claim delivery job');
  }
});

el('deliveryLogoutBtn')?.addEventListener('click', async () => {
  try {
    await api.authLogout();
  } finally {
    window.location.reload();
  }
});

setInterval(() => {
  refreshJobs().catch(() => null);
}, 15000);

refreshAuth().then(refreshJobs).catch(() => null);
