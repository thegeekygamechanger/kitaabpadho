import { api } from './api.js';
import { playNotificationSound } from './sound.js';
import { el, escapeHtml, renderEmpty, setText } from './ui.js';

function fmtTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function initNotifications({ state, openAuthModal }) {
  const panel = el('notificationsPanel');
  const listNode = el('notificationsList');
  const btn = el('notificationsBtn');
  const countNode = el('notificationsCount');
  const refreshBtn = el('notificationsRefreshBtn');
  const readAllBtn = el('notificationsReadAllBtn');
  let pollTimer = null;
  let lastUnreadCount = 0;

  function isAuthed() {
    return Boolean(state.user?.id);
  }

  function renderVisibility() {
    const visible = isAuthed();
    if (panel) panel.classList.toggle('hidden', !visible);
    if (btn) btn.hidden = !visible;
    if (!visible) {
      if (listNode) listNode.innerHTML = '';
      if (countNode) countNode.textContent = '0';
      setText('notificationsStatus', 'Login to receive alerts for new arrivals and community updates.');
      lastUnreadCount = 0;
    }
  }

  function renderList(items) {
    if (!listNode) return;
    if (!Array.isArray(items) || items.length === 0) {
      listNode.innerHTML = renderEmpty('No notifications yet.');
      return;
    }

    listNode.innerHTML = items
      .map(
        (item) => `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.kind || 'notice')}</span>
            <span class="muted">${escapeHtml(fmtTime(item.createdAt))}</span>
            <span class="muted">${item.isRead ? 'read' : 'unread'}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title || '')}</h3>
          <p class="muted">${escapeHtml(item.body || '')}</p>
          <div class="card-actions">
            ${item.isRead ? '' : `<button class="kb-btn kb-btn-ghost notification-read-btn" data-id="${item.id}" type="button">Mark Read</button>`}
          </div>
        </div>
      </article>`
      )
      .join('');
  }

  async function refresh() {
    if (!isAuthed()) {
      renderVisibility();
      return;
    }
    try {
      const result = await api.listNotifications({
        limit: state.notifications.limit,
        offset: state.notifications.offset,
        unreadOnly: state.notifications.unreadOnly
      });
      renderList(result.data || []);
      state.notifications.unreadCount = Number(result.meta?.unreadCount || 0);
      if (state.notifications.unreadCount > lastUnreadCount) playNotificationSound();
      lastUnreadCount = state.notifications.unreadCount;
      if (countNode) countNode.textContent = String(state.notifications.unreadCount);
      setText('notificationsStatus', `Unread: ${state.notifications.unreadCount}`);
    } catch (error) {
      setText('notificationsStatus', error.message || 'Unable to load notifications');
    }
  }

  async function markAllRead() {
    if (!isAuthed()) return;
    try {
      await api.readAllNotifications();
      await refresh();
    } catch (error) {
      setText('notificationsStatus', error.message || 'Unable to mark notifications');
    }
  }

  listNode?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.notification-read-btn');
    if (!button) return;
    try {
      await api.readNotification(button.dataset.id);
      await refresh();
    } catch (error) {
      setText('notificationsStatus', error.message || 'Unable to update notification');
    }
  });

  btn?.addEventListener('click', async () => {
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
    window.location.hash = '#notificationsPanel';
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await refresh();
  });

  refreshBtn?.addEventListener('click', refresh);
  readAllBtn?.addEventListener('click', markAllRead);

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (!isAuthed()) return;
    pollTimer = setInterval(() => {
      refresh().catch(() => null);
    }, 15000);
  }

  renderVisibility();

  return {
    async onAuthChanged() {
      renderVisibility();
      startPolling();
      if (isAuthed()) await refresh();
    },
    async refresh() {
      await refresh();
    }
  };
}
