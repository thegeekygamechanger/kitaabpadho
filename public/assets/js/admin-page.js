import { api } from './api.js';
import { escapeHtml } from './ui.js';

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function fmtTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderSummary(summary) {
  const node = el('adminSummary');
  if (!node) return;
  const cards = [
    ['Users', summary.users],
    ['Listings', summary.listings],
    ['Posts', summary.communityPosts],
    ['Comments', summary.communityComments],
    ['Actions 24h', summary.actionsLast24h],
    ['Actions Total', summary.actionsTotal]
  ];
  node.innerHTML = cards
    .map(
      ([label, value]) => `<article class="admin-kpi"><strong>${escapeHtml(fmtNumber(value))}</strong><span>${escapeHtml(label)}</span></article>`
    )
    .join('');
}

function renderActions(actions) {
  const node = el('adminActionsList');
  if (!node) return;
  if (!actions.length) {
    node.innerHTML = `<article class="state-empty">No actions found.</article>`;
    return;
  }

  node.innerHTML = `<div class="admin-table-wrap">
    <table class="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Entity</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>
        ${actions
          .map((item) => {
            const actor = item.actorName || item.actorEmail || 'System';
            const entity = `${item.entityType || '-'}${item.entityId ? `#${item.entityId}` : ''}`;
            return `<tr>
              <td>${escapeHtml(fmtTime(item.createdAt))}</td>
              <td>${escapeHtml(actor)}</td>
              <td>${escapeHtml(item.actionType || '-')}</td>
              <td>${escapeHtml(entity)}</td>
              <td>${escapeHtml(item.summary || '-')}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function getFilters() {
  return {
    q: el('adminSearchInput')?.value.trim() || '',
    actionType: el('adminActionTypeFilter')?.value.trim().toLowerCase() || '',
    entityType: el('adminEntityTypeFilter')?.value.trim().toLowerCase() || '',
    limit: 80,
    offset: 0
  };
}

async function refreshAdminData() {
  try {
    const [summary, actionsResult] = await Promise.all([api.adminSummary(), api.listAdminActions(getFilters())]);
    renderSummary(summary);
    renderActions(actionsResult.data || []);
    setText('adminStatus', `Showing ${fmtNumber(actionsResult.data?.length || 0)} actions`);
  } catch (error) {
    setText('adminStatus', error.message || 'Unable to load admin data');
  }
}

async function checkAdminSession() {
  try {
    const me = await api.authMe();
    const isAdmin = me.authenticated && me.user?.role === 'admin';
    el('adminLoginPanel')?.classList.toggle('hidden', isAdmin);
    el('adminMainPanel')?.classList.toggle('hidden', !isAdmin);
    if (isAdmin) await refreshAdminData();
  } catch {
    el('adminLoginPanel')?.classList.remove('hidden');
    el('adminMainPanel')?.classList.add('hidden');
  }
}

el('adminLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminLoginStatus', 'Logging in...');
  try {
    await api.authLogin({
      email: form.email.value.trim(),
      password: form.password.value
    });
    form.reset();
    setText('adminLoginStatus', 'Logged in.');
    await checkAdminSession();
  } catch (error) {
    setText('adminLoginStatus', error.message || 'Admin login failed');
  }
});

el('adminRefreshBtn')?.addEventListener('click', () => {
  refreshAdminData().catch(() => null);
});

el('adminApplyFiltersBtn')?.addEventListener('click', () => {
  refreshAdminData().catch(() => null);
});

el('adminLogoutBtn')?.addEventListener('click', async () => {
  try {
    await api.authLogout();
  } finally {
    window.location.reload();
  }
});

setInterval(() => {
  if (!el('adminMainPanel')?.classList.contains('hidden')) refreshAdminData().catch(() => null);
}, 15000);

checkAdminSession().catch(() => null);
