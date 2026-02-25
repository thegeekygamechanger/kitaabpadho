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
let currentJobs = [];

function canManageJob(item) {
  if (!currentUser || !item) return false;
  return (
    currentUser.role === 'admin' ||
    Number(item.createdBy) === Number(currentUser.id) ||
    Number(item.claimedBy) === Number(currentUser.id)
  );
}

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
    node.innerHTML = `<article class="state-empty">No delivery jobs found for this filter.</article>`;
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
            <button class="kb-btn kb-btn-ghost view-job-btn" data-id="${item.id}" type="button">View</button>
            ${
              item.status === 'open'
                ? `<button class="kb-btn kb-btn-primary claim-job-btn" data-id="${item.id}" type="button">Claim</button>`
                : ''
            }
            ${
              canManageJob(item)
                ? `<button class="kb-btn kb-btn-dark update-job-status-btn" data-id="${item.id}" type="button">Update Status</button>
                   <button class="kb-btn kb-btn-dark delete-job-btn" data-id="${item.id}" type="button">Delete</button>`
                : ''
            }
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function buildBaseFilters() {
  const filters = { limit: 40, offset: 0, radiusKm: 250 };
  if (currentCoords) {
    filters.lat = currentCoords.lat;
    filters.lon = currentCoords.lon;
  }
  return filters;
}

async function refreshJobs() {
  try {
    const statusFilter = el('deliveryStatusFilter')?.value || 'open';
    const baseFilters = buildBaseFilters();
    let jobs = [];

    if (statusFilter === 'all') {
      const statuses = ['open', 'claimed', 'completed', 'cancelled'];
      const results = await Promise.all(
        statuses.map((status) => api.listDeliveryJobs({ ...baseFilters, status }).catch(() => ({ data: [] })))
      );
      const seen = new Set();
      for (const result of results) {
        for (const item of result.data || []) {
          const key = Number(item.id);
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push(item);
        }
      }
    } else {
      const result = await api.listDeliveryJobs({ ...baseFilters, status: statusFilter });
      jobs = result.data || [];
    }

    jobs.sort((a, b) => Number(b.id) - Number(a.id));
    currentJobs = jobs;
    renderJobs(jobs);
    setText('deliveryStatus', `Showing ${jobs.length} job(s) for filter: ${statusFilter}`);
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

el('deliveryStatusFilter')?.addEventListener('change', () => {
  refreshJobs().catch(() => null);
});

el('deliveryJobs')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewBtn = target.closest('.view-job-btn');
  if (viewBtn) {
    if (!currentUser) {
      setText('deliveryStatus', 'Please login first.');
      return;
    }
    try {
      const job = await api.deliveryJobById(viewBtn.dataset.id);
      window.alert(
        `Job #${job.id}\nListing #${job.listingId}\nStatus: ${job.status}\nPickup: ${job.pickupCity} (${job.pickupAreaCode})\nDelivery Mode: ${job.deliveryMode}`
      );
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to view delivery job');
    }
    return;
  }

  const claimBtn = target.closest('.claim-job-btn');
  if (claimBtn) {
    if (!currentUser) {
      setText('deliveryStatus', 'Please login first.');
      return;
    }
    try {
      await api.claimDeliveryJob(claimBtn.dataset.id);
      setText('deliveryStatus', 'Delivery job claimed.');
      await refreshJobs();
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to claim delivery job');
    }
    return;
  }

  const updateBtn = target.closest('.update-job-status-btn');
  if (updateBtn) {
    if (!currentUser) {
      setText('deliveryStatus', 'Please login first.');
      return;
    }
    const item = currentJobs.find((row) => Number(row.id) === Number(updateBtn.dataset.id));
    if (!item) return;
    const nextStatus = (window.prompt('Enter status: open, claimed, completed, cancelled', item.status || 'open') || '')
      .trim()
      .toLowerCase();
    if (!nextStatus) return;
    if (!['open', 'claimed', 'completed', 'cancelled'].includes(nextStatus)) {
      setText('deliveryStatus', 'Invalid status.');
      return;
    }
    try {
      await api.updateDeliveryJobStatus(item.id, nextStatus);
      setText('deliveryStatus', `Job #${item.id} updated to ${nextStatus}.`);
      await refreshJobs();
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to update delivery job');
    }
    return;
  }

  const deleteBtn = target.closest('.delete-job-btn');
  if (deleteBtn) {
    if (!currentUser) {
      setText('deliveryStatus', 'Please login first.');
      return;
    }
    const item = currentJobs.find((row) => Number(row.id) === Number(deleteBtn.dataset.id));
    if (!item) return;
    const ok = window.confirm(`Delete delivery job #${item.id}?`);
    if (!ok) return;
    try {
      await api.deleteDeliveryJob(item.id);
      setText('deliveryStatus', `Job #${item.id} deleted.`);
      await refreshJobs();
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to delete delivery job');
    }
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
