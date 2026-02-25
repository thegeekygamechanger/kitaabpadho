import { api } from './api.js';
import { escapeHtml } from './ui.js';

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const node = byId(id);
  if (node) node.textContent = text;
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function initFeedback({
  portal = 'client',
  getUser = () => null,
  formId,
  statusId,
  listId,
  refreshBtnId,
  onAuthRequired
}) {
  const form = byId(formId);
  const listNode = byId(listId);
  const refreshBtn = byId(refreshBtnId);
  let timer = null;

  function renderFeedbackList(items) {
    if (!listNode) return;
    if (!Array.isArray(items) || items.length === 0) {
      listNode.innerHTML = `<article class="state-empty">No queries yet.</article>`;
      return;
    }
    listNode.innerHTML = items
      .map(
        (item) => `<article class="card">
          <div class="card-body">
            <div class="card-meta">
              <span class="pill type-buy">${escapeHtml(item.sourcePortal || portal)}</span>
              <span class="muted">${escapeHtml(formatWhen(item.createdAt))}</span>
              <span class="muted">${escapeHtml(item.senderName || '')} | ${escapeHtml(item.senderRole || 'guest')}</span>
            </div>
            <h3 class="card-title">${escapeHtml(item.subject || '')}</h3>
            <p class="muted">${escapeHtml(item.message || '')}</p>
          </div>
        </article>`
      )
      .join('');
  }

  async function refreshMyFeedback() {
    const user = getUser();
    if (!listNode) return;
    if (!user) {
      listNode.innerHTML = `<article class="state-empty">Login to view your submitted support queries.</article>`;
      return;
    }
    try {
      const result = await api.listMyFeedback({ limit: 20, offset: 0 });
      renderFeedbackList(result.data || []);
    } catch (error) {
      listNode.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message || 'Unable to load support queries')}</article>`;
    }
  }

  function syncIdentityFields() {
    if (!form) return;
    const user = getUser();
    const senderNameInput = form.querySelector('input[name="senderName"]');
    const senderEmailInput = form.querySelector('input[name="senderEmail"]');
    const userHint = form.querySelector('.support-user-hint');
    if (user) {
      if (senderNameInput) senderNameInput.value = user.fullName || '';
      if (senderEmailInput) senderEmailInput.value = user.email || '';
      if (userHint) userHint.textContent = `Sending as ${user.fullName || user.email}`;
    } else if (userHint) {
      userHint.textContent = 'Provide your name and email to receive updates.';
    }
  }

  function startPolling() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      refreshMyFeedback().catch(() => null);
    }, 20000);
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = getUser();
    const sourcePortal = portal || 'client';
    const subject = String(form.subject?.value || '').trim();
    const message = String(form.message?.value || '').trim();
    const senderName = String(form.senderName?.value || '').trim();
    const senderEmail = String(form.senderEmail?.value || '').trim();

    if (!subject || !message) {
      setText(statusId, 'Subject and message are required.');
      return;
    }

    if (!user && (!senderName || !senderEmail)) {
      setText(statusId, 'Name and email are required for guest queries.');
      return;
    }

    setText(statusId, 'Submitting your query...');
    try {
      await api.createFeedback({
        sourcePortal,
        senderName: user ? undefined : senderName,
        senderEmail: user ? undefined : senderEmail,
        subject,
        message
      });
      setText(statusId, 'Query submitted. Our support team will review it.');
      form.reset();
      syncIdentityFields();
      await refreshMyFeedback();
    } catch (error) {
      setText(statusId, error.message || 'Unable to submit support query');
      if (error.status === 401) onAuthRequired?.('Login to sync your support queries.');
    }
  });

  refreshBtn?.addEventListener('click', () => {
    refreshMyFeedback().catch(() => null);
  });

  syncIdentityFields();
  startPolling();
  refreshMyFeedback().catch(() => null);

  return {
    async onAuthChanged() {
      syncIdentityFields();
      await refreshMyFeedback();
    },
    refreshMyFeedback
  };
}
