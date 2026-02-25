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

let currentUser = null;
let currentCoords = null;
let currentJobs = [];
let currentWorkJobs = [];
let currentOrders = [];
let stream = null;
let feedback = null;
const PORTAL_KEY = 'kp_active_portal';
const PORTAL_NAME = 'delivery';
const TAB_SECTION_IDS = [
  'deliveryJobsPanel',
  'deliveryWorkPanel',
  'deliveryOrdersPanel',
  'deliveryProfilePanel',
  'deliverySupportPanel'
];
const TAB_LINK_IDS = {
  deliveryJobsPanel: 'deliveryJobsNav',
  deliveryWorkPanel: 'deliveryWorkNav',
  deliveryOrdersPanel: 'deliveryOrdersNav',
  deliveryProfilePanel: 'deliveryProfileNav',
  deliverySupportPanel: 'deliverySupportNav'
};
const ORDER_FLOW = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered', 'cancelled'];

initFormEnhancements();

function isDeliveryAccount() {
  if (!currentUser) return false;
  return currentUser.role === 'delivery' || currentUser.role === 'admin';
}

function canManageJob(item) {
  if (!currentUser || !item) return false;
  return (
    currentUser.role === 'admin' ||
    Number(item.createdBy) === Number(currentUser.id) ||
    Number(item.claimedBy) === Number(currentUser.id)
  );
}

function activeDeliveryTabIds() {
  if (!currentUser || !isDeliveryAccount()) return [];
  return ['deliveryJobsPanel', 'deliveryWorkPanel', 'deliveryOrdersPanel', 'deliveryProfilePanel', 'deliverySupportPanel'];
}

function syncTabView() {
  const loginPanel = el('deliveryLoginPanel');
  const loginVisible = !loginPanel || !loginPanel.classList.contains('hidden');
  const allowed = activeDeliveryTabIds().filter((id) => {
    const section = el(id);
    return Boolean(section && !section.classList.contains('hidden'));
  });
  const rawHash = String(window.location.hash || '').replace('#', '');
  const fallback = allowed[0] || '';
  const target = allowed.includes(rawHash) ? rawHash : fallback;

  for (const id of TAB_SECTION_IDS) {
    const section = el(id);
    if (!section) continue;
    section.classList.toggle('view-hidden', !(id === target && !loginVisible && !section.classList.contains('hidden')));
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
  const deliveryRole = isDeliveryAccount();
  const loginVisible = !deliveryRole;
  const logoutBtn = el('deliveryLogoutBtn');
  if (logoutBtn) logoutBtn.hidden = !deliveryRole;
  el('deliveryPortalNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryJobsNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryWorkNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryOrdersNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryProfileNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliverySupportNav')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryLoginPanel')?.classList.toggle('hidden', !loginVisible);
  el('deliveryJobsPanel')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryWorkPanel')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryOrdersPanel')?.classList.toggle('hidden', !deliveryRole);
  el('deliveryProfilePanel')?.classList.toggle('hidden', !deliveryRole);
  el('deliverySupportPanel')?.classList.toggle('hidden', !deliveryRole);
  syncTabView();
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

function syncRoleHint() {
  if (!currentUser) {
    setText('deliveryStatus', 'Enable GPS to get nearby delivery jobs up to 250 km.');
    return;
  }
  if (!isDeliveryAccount()) {
    setText('deliveryStatus', `Current role is ${currentUser.role}. Delivery role required for claim actions.`);
  }
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
  syncPortalVisibility();
  renderDeliveryProfile();
  syncRoleHint();
  await feedback?.onAuthChanged?.();
  connectRealtime();
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
            ${item.orderId ? `<span class="muted">Order #${escapeHtml(String(item.orderId))}</span>` : ''}
          </div>
          <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
          <p class="muted">${escapeHtml(item.pickupCity || '')} | ${escapeHtml(item.pickupAreaCode || '')}</p>
          <p class="muted">${escapeHtml(item.listingType || '')} | ${escapeHtml(item.sellerType || '')}</p>
          <p class="card-price">${escapeHtml(formatInr(item.listingPrice || 0))}</p>
          <div class="card-actions">
            <button class="kb-btn kb-btn-ghost view-job-btn" data-id="${item.id}" type="button">View</button>
            ${
              item.status === 'open' && isDeliveryAccount()
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

function renderWorkJobs(items) {
  const node = el('deliveryWorkList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No claimed jobs yet. Claim a job from Delivery Jobs.</article>`;
    return;
  }
  node.innerHTML = items
    .map((item) => {
      return `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.status || 'claimed')}</span>
            <span class="muted">Job #${escapeHtml(String(item.id))}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
          <p class="muted">${escapeHtml(item.pickupCity || '')} | ${escapeHtml(item.pickupAreaCode || '')}</p>
          <div class="order-workflow-actions">
            <button class="kb-btn kb-btn-ghost delivery-work-status-btn" data-id="${item.id}" data-stage="in_progress" type="button">In Progress</button>
            <button class="kb-btn kb-btn-ghost delivery-work-status-btn" data-id="${item.id}" data-stage="on_the_way" type="button">On The Way</button>
            <button class="kb-btn kb-btn-dark delivery-work-status-btn" data-id="${item.id}" data-stage="done" type="button">Done Delivery</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function renderDeliveryOrders(items) {
  const node = el('deliveryOrdersList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No assigned orders found.</article>`;
    return;
  }
  node.innerHTML = items
    .map((item) => {
      const actions = [];
      if (item.status === 'shipping') {
        actions.push(
          `<button class="kb-btn kb-btn-ghost delivery-order-status-btn" data-id="${item.id}" data-status="out_for_delivery" type="button">Out for Delivery</button>`
        );
      }
      if (item.status === 'out_for_delivery') {
        actions.push(
          `<button class="kb-btn kb-btn-dark delivery-order-status-btn" data-id="${item.id}" data-status="delivered" type="button">Mark Delivered</button>`
        );
      }
      actions.push(
        `<button class="kb-btn kb-btn-ghost delivery-order-view-btn" data-id="${item.id}" type="button">View</button>`
      );
      return `<article class="card">
        <div class="card-media">${
          item.listingImageUrl ? `<img src="${escapeHtml(item.listingImageUrl)}" alt="${escapeHtml(item.listingTitle || 'Order item')}" />` : '<strong>No Image</strong>'
        }</div>
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.actionKind || 'buy')}</span>
            <span class="pill type-rent">${escapeHtml(prettyOrderStatus(item.status || 'shipping'))}</span>
            <span class="muted">#${escapeHtml(String(item.id || ''))}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
          <p class="muted">Buyer: ${escapeHtml(item.buyerName || item.buyerEmail || '-')}</p>
          <p class="muted">Seller: ${escapeHtml(item.sellerName || '-')}</p>
          <p class="muted">Delivery fee: ${formatInr(item.deliveryCharge)} | Paycheck: ${formatInr(item.paycheckAmount)}</p>
          <p class="muted">Paycheck status: ${escapeHtml(item.paycheckStatus || 'pending')}</p>
          ${renderOrderStatusRail(item.status)}
          <div class="card-actions">${actions.join('')}</div>
        </div>
      </article>`;
    })
    .join('');
}

function renderDeliveryProfile() {
  const form = el('deliveryProfileForm');
  if (!form || !currentUser || !isDeliveryAccount()) {
    setText('deliveryProfileSummary', 'Login to manage delivery profile and TOTP.');
    return;
  }
  if (form.fullName) form.fullName.value = currentUser.fullName || '';
  if (form.email) form.email.value = currentUser.email || '';
  if (form.phoneNumber) form.phoneNumber.value = currentUser.phoneNumber || '';
  setText(
    'deliveryProfileSummary',
    `${currentUser.fullName || ''} | ${currentUser.email || ''} | role: ${currentUser.role || 'delivery'} | TOTP: ${
      currentUser.totpEnabled ? 'enabled' : 'disabled'
    }`
  );
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
  if (!isDeliveryAccount()) {
    currentJobs = [];
    renderJobs([]);
    return;
  }
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

async function refreshWorkJobs() {
  if (!isDeliveryAccount()) {
    currentWorkJobs = [];
    renderWorkJobs([]);
    return;
  }
  try {
    const baseFilters = buildBaseFilters();
    const result = await api.listDeliveryJobs({ ...baseFilters, status: 'claimed' });
    currentWorkJobs = Array.isArray(result.data)
      ? result.data.filter((item) => Number(item.claimedBy) === Number(currentUser?.id))
      : [];
    renderWorkJobs(currentWorkJobs);
    setText('deliveryWorkStatus', `Claimed jobs: ${currentWorkJobs.length}`);
  } catch (error) {
    setText('deliveryWorkStatus', error.message || 'Unable to load work queue');
  }
}

async function refreshDeliveryOrders() {
  if (!isDeliveryAccount()) {
    currentOrders = [];
    renderDeliveryOrders([]);
    return;
  }
  try {
    const status = String(el('deliveryOrdersStatusFilter')?.value || '');
    const result = await api.listDeliveryOrders({
      status: status || undefined,
      limit: 60,
      offset: 0
    });
    currentOrders = Array.isArray(result.data) ? result.data : [];
    renderDeliveryOrders(currentOrders);
    setText('deliveryOrdersStatus', `Showing ${currentOrders.length} order(s).`);
  } catch (error) {
    setText('deliveryOrdersStatus', error.message || 'Unable to load delivery orders');
  }
}

async function resolveOpenOrderByListingId(listingId) {
  const localMatch = currentOrders.find(
    (item) => Number(item.listingId) === Number(listingId) && item.status !== 'delivered' && item.status !== 'cancelled'
  );
  if (localMatch) return localMatch;
  await refreshDeliveryOrders().catch(() => null);
  return currentOrders.find(
    (item) => Number(item.listingId) === Number(listingId) && item.status !== 'delivered' && item.status !== 'cancelled'
  );
}

async function resolveOpenOrderForJob(job) {
  if (!job) return null;
  if (job.orderId) {
    const exact = currentOrders.find(
      (item) => Number(item.id) === Number(job.orderId) && item.status !== 'delivered' && item.status !== 'cancelled'
    );
    if (exact) return exact;
    try {
      const fetched = await api.orderById(job.orderId);
      if (fetched && fetched.status !== 'delivered' && fetched.status !== 'cancelled') return fetched;
    } catch {
      // Fallback to listing-based lookup for backward compatibility.
    }
  }
  return resolveOpenOrderByListingId(job.listingId);
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

function connectRealtime() {
  if (stream) stream.close();
  stream = new EventSource('/api/events/stream');

  stream.addEventListener('delivery.updated', async () => {
    if (!isDeliveryAccount()) return;
    await refreshJobs().catch(() => null);
    await refreshWorkJobs().catch(() => null);
    await refreshDeliveryOrders().catch(() => null);
    playNotificationSound();
  });

  stream.addEventListener('orders.updated', async () => {
    if (!isDeliveryAccount()) return;
    await refreshDeliveryOrders().catch(() => null);
  });

  stream.addEventListener('notifications.invalidate', () => {
    if (!isDeliveryAccount()) return;
    playNotificationSound();
  });

  stream.addEventListener('feedback.updated', async () => {
    await feedback?.refreshMyFeedback?.().catch(() => null);
    playNotificationSound();
  });
}

el('deliveryLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = String(form.password?.value || '');
  const totpCode = String(form.totpCode?.value || '').trim();
  if (!password && !totpCode) {
    setText('deliveryStatus', 'Enter password or TOTP code to login.');
    return;
  }
  setText('deliveryStatus', 'Logging in...');
  try {
    const payload = { email: form.email.value.trim() };
    if (password) payload.password = password;
    if (totpCode) payload.totpCode = totpCode;
    await api.authLogin(payload);
    form.reset();
    await refreshAuth();
    if (!isDeliveryAccount()) {
      setText('deliveryStatus', 'Login successful, but this account is not a delivery account.');
      syncTabView();
      return;
    }
    window.location.hash = '#deliveryJobsPanel';
    setText('deliveryStatus', 'Delivery login successful.');
    await refreshJobs();
    await refreshWorkJobs();
    await refreshDeliveryOrders();
    unlockNotificationSound();
  } catch (error) {
    setText('deliveryStatus', error.message || 'Login failed');
  }
});

el('deliverySignupForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('deliveryStatus', 'Creating delivery executive account...');
  try {
    await api.authRegister({
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phoneNumber: form.phoneNumber.value.trim(),
      password: form.password.value,
      role: 'delivery'
    });
    form.reset();
    await refreshAuth();
    window.location.hash = '#deliveryJobsPanel';
    setText('deliveryStatus', 'Delivery account created and logged in.');
    await refreshJobs();
    await refreshWorkJobs();
    await refreshDeliveryOrders();
    unlockNotificationSound();
  } catch (error) {
    setText('deliveryStatus', error.message || 'Unable to create delivery account');
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

el('deliveryWorkRefreshBtn')?.addEventListener('click', () => {
  refreshWorkJobs().catch(() => null);
});

el('deliveryOrdersRefreshBtn')?.addEventListener('click', () => {
  refreshDeliveryOrders().catch(() => null);
});

el('deliveryOrdersStatusFilter')?.addEventListener('change', () => {
  refreshDeliveryOrders().catch(() => null);
});

el('deliveryProfileForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isDeliveryAccount()) {
    setText('deliveryProfileStatus', 'Delivery login required.');
    return;
  }
  const form = event.currentTarget;
  setText('deliveryProfileStatus', 'Saving profile...');
  try {
    const result = await api.updateProfile({
      fullName: form.fullName.value.trim(),
      phoneNumber: form.phoneNumber.value.trim()
    });
    currentUser = result.user || currentUser;
    setText('deliveryAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderDeliveryProfile();
    setText('deliveryProfileStatus', 'Profile updated.');
  } catch (error) {
    setText('deliveryProfileStatus', error.message || 'Unable to update profile');
  }
});

el('deliveryPasswordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isDeliveryAccount()) {
    setText('deliveryPasswordStatus', 'Delivery login required.');
    return;
  }
  const form = event.currentTarget;
  const currentPassword = String(form.currentPassword?.value || '').trim();
  if (!currentPassword) {
    setText('deliveryPasswordStatus', 'Current password is required.');
    return;
  }
  setText('deliveryPasswordStatus', 'Changing password...');
  try {
    const result = await api.changePassword({
      currentPassword,
      newPassword: form.newPassword.value
    });
    form.reset();
    setText(
      'deliveryPasswordStatus',
      result?.reauthRequired ? 'Password changed. Please login again.' : 'Password changed.'
    );
    if (result?.reauthRequired) {
      currentUser = null;
      if (stream) stream.close();
      window.location.reload();
    }
  } catch (error) {
    setText('deliveryPasswordStatus', error.message || 'Unable to change password');
  }
});

el('deliveryTotpSetupBtn')?.addEventListener('click', async () => {
  if (!isDeliveryAccount()) {
    setText('deliveryTotpStatus', 'Delivery login required.');
    return;
  }
  setText('deliveryTotpStatus', 'Generating TOTP secret...');
  try {
    const data = await api.setupTotp();
    setText(
      'deliveryTotpSecretView',
      `Secret: ${data.secret} | Account: ${data.accountName} | Issuer: ${data.issuer}`
    );
    setText('deliveryTotpStatus', 'Secret generated. Add it in authenticator and verify below.');
  } catch (error) {
    setText('deliveryTotpStatus', error.message || 'Unable to setup TOTP');
  }
});

el('deliveryTotpEnableForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isDeliveryAccount()) {
    setText('deliveryTotpStatus', 'Delivery login required.');
    return;
  }
  const form = event.currentTarget;
  setText('deliveryTotpStatus', 'Enabling TOTP...');
  try {
    const result = await api.enableTotp(String(form.code?.value || '').trim());
    currentUser = result.user || currentUser;
    setText('deliveryAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderDeliveryProfile();
    form.reset();
    setText('deliveryTotpStatus', 'TOTP enabled.');
  } catch (error) {
    setText('deliveryTotpStatus', error.message || 'Unable to enable TOTP');
  }
});

el('deliveryTotpDisableBtn')?.addEventListener('click', async () => {
  if (!isDeliveryAccount()) {
    setText('deliveryTotpStatus', 'Delivery login required.');
    return;
  }
  const currentPassword = window.prompt('Enter current password (or leave blank to use TOTP code):') || '';
  let totpCode = '';
  if (!currentPassword) {
    totpCode = window.prompt('Enter 6-digit TOTP code:') || '';
  }
  setText('deliveryTotpStatus', 'Disabling TOTP...');
  try {
    const result = await api.disableTotp({
      currentPassword: currentPassword || undefined,
      totpCode: totpCode || undefined
    });
    currentUser = result.user || currentUser;
    setText('deliveryAuthBadge', currentUser ? `${currentUser.fullName} (${currentUser.email})` : 'Guest');
    renderDeliveryProfile();
    setText('deliveryTotpStatus', 'TOTP disabled.');
  } catch (error) {
    setText('deliveryTotpStatus', error.message || 'Unable to disable TOTP');
  }
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
        `Job #${job.id}\nOrder: ${job.orderId ? `#${job.orderId}` : 'N/A'}\nListing #${job.listingId}\nStatus: ${job.status}\nPickup: ${job.pickupCity} (${job.pickupAreaCode})\nDelivery Mode: ${job.deliveryMode}`
      );
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to view delivery job');
    }
    return;
  }

  const claimBtn = target.closest('.claim-job-btn');
  if (claimBtn) {
    if (!isDeliveryAccount()) {
      setText('deliveryStatus', 'Delivery role required to claim jobs.');
      return;
    }
    try {
      await api.claimDeliveryJob(claimBtn.dataset.id);
      setText('deliveryStatus', 'Delivery job claimed.');
      playNotificationSound();
      await refreshJobs();
      await refreshWorkJobs();
      await refreshDeliveryOrders();
      window.location.hash = '#deliveryWorkPanel';
    } catch (error) {
      setText('deliveryStatus', error.message || 'Unable to claim delivery job');
    }
    return;
  }

  const updateBtn = target.closest('.update-job-status-btn');
  if (updateBtn) {
    if (!isDeliveryAccount()) {
      setText('deliveryStatus', 'Delivery role required.');
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
    if (!isDeliveryAccount()) {
      setText('deliveryStatus', 'Delivery role required.');
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

el('deliveryWorkList')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.delivery-work-status-btn');
  if (!button) return;
  if (!isDeliveryAccount()) {
    setText('deliveryWorkStatus', 'Delivery login required.');
    return;
  }
  const job = currentWorkJobs.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!job) return;
  const stage = String(button.dataset.stage || '');
  try {
    setText('deliveryWorkStatus', `Updating job #${job.id}...`);
    if (stage === 'in_progress') {
      const order = await resolveOpenOrderForJob(job);
      if (order && ['received', 'packing'].includes(String(order.status || ''))) {
        await api.updateOrderStatus(order.id, 'shipping');
      }
      await api.updateDeliveryJobStatus(job.id, 'claimed');
      setText('deliveryWorkStatus', `Job #${job.id} moved to in progress.`);
    } else if (stage === 'on_the_way') {
      const order = await resolveOpenOrderForJob(job);
      if (!order) {
        setText('deliveryWorkStatus', `No active order found for listing #${job.listingId}.`);
        return;
      }
      await api.updateOrderStatus(order.id, 'out_for_delivery');
      setText('deliveryWorkStatus', `Order #${order.id} is out for delivery.`);
    } else if (stage === 'done') {
      const order = await resolveOpenOrderForJob(job);
      if (order) {
        const updated = await api.updateOrderStatus(order.id, 'delivered');
        if (updated?.order?.paycheckStatus === 'released') {
          setText(
            'deliveryWorkStatus',
            `Delivered. Paycheck released: ${formatInr(updated.order.paycheckAmount || 0)} for order #${updated.order.id}.`
          );
        } else {
          setText('deliveryWorkStatus', `Order #${order.id} delivered.`);
        }
      } else {
        setText('deliveryWorkStatus', `No active order found for listing #${job.listingId}.`);
      }
      await api.updateDeliveryJobStatus(job.id, 'completed');
    }
    await refreshJobs();
    await refreshWorkJobs();
    await refreshDeliveryOrders();
    playNotificationSound();
  } catch (error) {
    setText('deliveryWorkStatus', error.message || 'Unable to update work status');
  }
});

el('deliveryOrdersList')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewBtn = target.closest('.delivery-order-view-btn');
  if (viewBtn) {
    const item = currentOrders.find((row) => Number(row.id) === Number(viewBtn.dataset.id));
    if (!item) return;
    window.alert(
      `Order #${item.id}\nItem: ${item.listingTitle}\nStatus: ${prettyOrderStatus(item.status)}\nBuyer: ${
        item.buyerName || item.buyerEmail || '-'
      }\nPaycheck: ${formatInr(item.paycheckAmount || 0)} (${item.paycheckStatus || 'pending'})`
    );
    return;
  }

  const statusBtn = target.closest('.delivery-order-status-btn');
  if (!statusBtn) return;
  const orderId = Number(statusBtn.dataset.id);
  const nextStatus = String(statusBtn.dataset.status || '').trim();
  if (!orderId || !nextStatus) return;
  try {
    setText('deliveryOrdersStatus', `Updating order #${orderId}...`);
    const payload = await api.updateOrderStatus(orderId, nextStatus);
    const updatedOrder = payload?.order || null;
    if (updatedOrder?.status === 'delivered') {
      const workJob = currentWorkJobs.find((item) => Number(item.listingId) === Number(updatedOrder.listingId));
      if (workJob) {
        await api.updateDeliveryJobStatus(workJob.id, 'completed').catch(() => null);
      }
      if (updatedOrder.paycheckStatus === 'released') {
        setText(
          'deliveryOrdersStatus',
          `Delivered. Paycheck released: ${formatInr(updatedOrder.paycheckAmount || 0)} for order #${updatedOrder.id}.`
        );
      } else {
        setText('deliveryOrdersStatus', `Order #${orderId} delivered.`);
      }
    } else {
      setText('deliveryOrdersStatus', `Order #${orderId} moved to ${prettyOrderStatus(nextStatus)}.`);
    }
    await refreshJobs();
    await refreshWorkJobs();
    await refreshDeliveryOrders();
    playNotificationSound();
  } catch (error) {
    setText('deliveryOrdersStatus', error.message || 'Unable to update order');
  }
});

el('deliveryLogoutBtn')?.addEventListener('click', async () => {
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
  if (isDeliveryAccount()) refreshJobs().catch(() => null);
  if (isDeliveryAccount()) refreshWorkJobs().catch(() => null);
  if (isDeliveryAccount()) refreshDeliveryOrders().catch(() => null);
}, 15000);

feedback = initFeedback({
  portal: 'delivery',
  getUser: () => currentUser,
  formId: 'deliverySupportForm',
  statusId: 'deliverySupportStatus',
  listId: 'deliverySupportList',
  refreshBtnId: 'deliverySupportRefreshBtn'
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
        (position) => {
          currentCoords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          refreshJobs().catch(() => null);
        },
        () => null,
        { maximumAge: 180000, timeout: 7000 }
      );
    }
    await refreshJobs();
    await refreshWorkJobs();
    await refreshDeliveryOrders();
    syncTabView();
  })
  .catch(() => null);
