import { api } from './api.js';
import { el, escapeHtml, renderEmpty, setText } from './ui.js';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatTimestamp(value) {
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

function compactJson(value) {
  if (!value || typeof value !== 'object') return '-';
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return '-';
  }
}

function renderSummary(node, summary) {
  if (!node) return;
  const cards = [
    ['Users', summary.users],
    ['Listings', summary.listings],
    ['Community Posts', summary.communityPosts],
    ['Comments', summary.communityComments],
    ['Actions (24h)', summary.actionsLast24h],
    ['Actions (Total)', summary.actionsTotal]
  ];

  node.innerHTML = cards
    .map(
      ([label, value]) => `<article class="admin-kpi">
        <strong>${escapeHtml(formatNumber(value))}</strong>
        <span>${escapeHtml(label)}</span>
      </article>`
    )
    .join('');
}

function renderActionRows(node, actions) {
  if (!node) return;
  if (!Array.isArray(actions) || actions.length === 0) {
    node.innerHTML = renderEmpty('No actions found for selected filters.');
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
          <th>Details</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${actions
          .map((item) => {
            const actor = item.actorName || item.actorEmail || 'System';
            const actorRole = item.actorRole ? ` (${item.actorRole})` : '';
            const entity = `${item.entityType || '-'}${item.entityId ? `#${item.entityId}` : ''}`;
            const source = [item.ipAddress, item.userAgent].filter(Boolean).join(' | ');
            return `<tr>
              <td>${escapeHtml(formatTimestamp(item.createdAt))}</td>
              <td>${escapeHtml(`${actor}${actorRole}`)}</td>
              <td>${escapeHtml(item.actionType || '-')}</td>
              <td>${escapeHtml(entity)}</td>
              <td>${escapeHtml(item.summary || '-')}</td>
              <td><pre>${escapeHtml(compactJson(item.details))}</pre></td>
              <td>${escapeHtml(source || '-')}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>`;
}

export function initAdmin({ state, openAuthModal }) {
  const panel = el('adminPanel');
  const navLink = el('adminNavLink');
  const summaryNode = el('adminSummary');
  const actionsNode = el('adminActionsList');
  const searchInput = el('adminSearchInput');
  const actionTypeFilter = el('adminActionTypeFilter');
  const entityTypeFilter = el('adminEntityTypeFilter');
  const applyBtn = el('adminApplyFiltersBtn');
  const refreshBtn = el('adminRefreshBtn');

  function isAdmin() {
    return Boolean(state.user && state.user.role === 'admin');
  }

  function syncControlsFromState() {
    if (searchInput) searchInput.value = state.admin.q;
    if (actionTypeFilter) actionTypeFilter.value = state.admin.actionType;
    if (entityTypeFilter) entityTypeFilter.value = state.admin.entityType;
  }

  function syncStateFromControls() {
    state.admin.q = searchInput?.value.trim() || '';
    state.admin.actionType = actionTypeFilter?.value.trim().toLowerCase() || '';
    state.admin.entityType = entityTypeFilter?.value.trim().toLowerCase() || '';
  }

  function renderVisibility() {
    const visible = isAdmin();
    if (navLink) navLink.hidden = !visible;
    if (panel) panel.classList.toggle('hidden', !visible);
    if (!visible) {
      if (summaryNode) summaryNode.innerHTML = '';
      if (actionsNode) actionsNode.innerHTML = '';
      setText('adminStatus', state.user ? 'Admin role required.' : 'Login with an admin account to view project actions.');
    }
  }

  function handleAdminError(error) {
    if (error?.status === 401) {
      setText('adminStatus', 'Session expired. Please login as admin.');
      openAuthModal?.('Please login as admin to open the admin panel.');
      return;
    }
    if (error?.status === 403) {
      setText('adminStatus', 'Admin access required.');
      return;
    }
    setText('adminStatus', error?.message || 'Unable to load admin data');
  }

  async function refreshSummary() {
    if (!isAdmin()) return;
    const summary = await api.adminSummary();
    renderSummary(summaryNode, summary);
  }

  async function refreshActions() {
    if (!isAdmin()) return;
    if (actionsNode) actionsNode.innerHTML = renderEmpty('Loading project actions...');
    const result = await api.listAdminActions({
      q: state.admin.q,
      actionType: state.admin.actionType,
      entityType: state.admin.entityType,
      limit: state.admin.limit,
      offset: state.admin.offset
    });
    renderActionRows(actionsNode, result.data || []);
    setText(
      'adminStatus',
      `Showing ${formatNumber((result.data || []).length)} of ${formatNumber(result.meta?.total || 0)} actions.`
    );
  }

  async function refresh() {
    renderVisibility();
    if (!isAdmin()) return;
    syncControlsFromState();
    setText('adminStatus', 'Loading admin data...');
    try {
      await Promise.all([refreshSummary(), refreshActions()]);
    } catch (error) {
      handleAdminError(error);
    }
  }

  applyBtn?.addEventListener('click', async () => {
    syncStateFromControls();
    await refresh();
  });

  refreshBtn?.addEventListener('click', async () => {
    await refresh();
  });

  [searchInput, actionTypeFilter, entityTypeFilter].forEach((input) => {
    input?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      syncStateFromControls();
      await refresh();
    });
  });

  syncControlsFromState();
  renderVisibility();

  return {
    onAuthChanged: refresh,
    refresh
  };
}
