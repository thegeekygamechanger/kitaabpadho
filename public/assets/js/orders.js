import { api } from './api.js';
import { el, escapeHtml, formatInr, hideModal, renderEmpty, showModal } from './ui.js';

const STATUS_FLOW = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered'];

function prettyStatus(status) {
  return String(status || '').replaceAll('_', ' ');
}

function orderStatusRail(status) {
  if (status === 'cancelled') {
    return `<div class="order-status-rail"><span class="order-step current">cancelled</span></div>`;
  }
  const currentIndex = STATUS_FLOW.indexOf(status);
  return `<div class="order-status-rail">${STATUS_FLOW.map((step, index) => {
    const isCurrent = index === currentIndex;
    const cls = isCurrent ? 'order-step current' : 'order-step';
    return `<span class="${cls}">${escapeHtml(prettyStatus(step))}</span>`;
  }).join('')}</div>`;
}

export function initOrders({ state, openAuthModal }) {
  const panel = el('ordersPanel');
  const navLink = el('ordersNavLink');
  const mobileNavLink = el('mobileOrdersNavLink');
  const list = el('ordersList');
  const statusFilter = el('ordersStatusFilter');
  const refreshBtn = el('ordersRefreshBtn');
  const ratingModal = el('orderRatingModal');
  const ratingContent = el('orderRatingContent');
  const closeRatingBtn = el('closeOrderRatingBtn');
  let currentOrders = [];
  let activeRatingOrderId = null;
  const promptedDeliveredOrders = new Set();

  function closeRatingModal() {
    activeRatingOrderId = null;
    hideModal('orderRatingModal');
  }

  function renderRatingModal(order, statusText = '') {
    if (!ratingContent || !order) return;
    const orderId = Number(order.id || 0);
    const existingRating = Number(order.buyerRating || 0);
    ratingContent.innerHTML = `
      <div class="order-success-head">
        <p class="order-success-kicker">Delivery Completed</p>
        <h3>Rate order #${escapeHtml(String(orderId))}</h3>
      </div>
      <p class="muted">Item: ${escapeHtml(order.listingTitle || `Listing #${order.listingId || '-'}`)}</p>
      <form id="orderRatingForm" class="drawer">
        <label class="field-label" for="orderRatingInput">Rating (1-5)</label>
        <input id="orderRatingInput" class="kb-input" type="number" min="1" max="5" step="1" value="${escapeHtml(
          String(existingRating > 0 ? existingRating : 5)
        )}" required />
        <label class="field-label" for="orderRatingRemark">Remark (optional)</label>
        <textarea id="orderRatingRemark" class="kb-textarea" placeholder="Share delivery feedback">${escapeHtml(
          order.buyerRatingRemark || ''
        )}</textarea>
        <div class="drawer-actions">
          <button class="kb-btn kb-btn-primary" type="submit">Submit Rating</button>
          <button id="orderRatingCancelBtn" class="kb-btn kb-btn-ghost" type="button">Later</button>
        </div>
      </form>
      <p id="orderRatingStatus" class="muted">${escapeHtml(statusText)}</p>
    `;
  }

  function maybePromptRating() {
    if (!state.user?.id) return;
    if (activeRatingOrderId) return;
    const pending = currentOrders.find(
      (item) => String(item.status || '') === 'delivered' && !item.buyerRating && !promptedDeliveredOrders.has(Number(item.id))
    );
    if (!pending) return;
    promptedDeliveredOrders.add(Number(pending.id));
    activeRatingOrderId = Number(pending.id);
    renderRatingModal(pending);
    showModal('orderRatingModal');
  }

  function render() {
    const isAuthed = Boolean(state.user?.id);
    if (panel) panel.classList.toggle('hidden', !isAuthed);
    if (navLink) navLink.hidden = !isAuthed;
    if (mobileNavLink) mobileNavLink.hidden = !isAuthed;
    if (!isAuthed) {
      if (list) list.innerHTML = renderEmpty('Login to view your orders.');
      const statusNode = el('ordersStatus');
      if (statusNode) statusNode.textContent = 'Login to view your orders and live status workflow.';
      return;
    }
    if (!Array.isArray(currentOrders) || !currentOrders.length) {
      if (list) list.innerHTML = renderEmpty('No orders found.');
      const statusNode = el('ordersStatus');
      if (statusNode) statusNode.textContent = 'No orders yet.';
      return;
    }

    if (list) {
      list.innerHTML = currentOrders
        .map((item) => {
          const payable = Number(item.payableTotal || item.totalPrice || 0);
          return `<article class="card">
            <div class="card-media">${
              item.listingImageUrl ? `<img src="${escapeHtml(item.listingImageUrl)}" alt="${escapeHtml(item.listingTitle || 'Order item')}" />` : '<strong>No Image</strong>'
            }</div>
            <div class="card-body">
              <div class="card-meta">
                <span class="pill type-buy">${escapeHtml(item.actionKind || 'buy')}</span>
                <span class="pill type-rent">${escapeHtml(prettyStatus(item.status || 'received'))}</span>
                <span class="muted">#${escapeHtml(String(item.id || ''))}</span>
              </div>
              <h3 class="card-title">${escapeHtml(item.listingTitle || `Listing #${item.listingId}`)}</h3>
              <p class="muted">Seller: ${escapeHtml(item.sellerName || '-')}</p>
              <p class="muted">Mode: ${escapeHtml(item.paymentMode || 'cod')} | Payment: ${escapeHtml(item.paymentState || 'pending')}</p>
              <p class="muted">Delivery step: ${escapeHtml(prettyStatus(item.deliveryStatusTag || '-'))}</p>
              <p class="muted">Delivery remark: ${escapeHtml(item.deliveryNote || '-')}</p>
              <p class="muted">Your rating: ${item.buyerRating ? `${escapeHtml(String(item.buyerRating))}/5` : 'Pending'}</p>
              <p class="muted">Items: ${formatInr(item.totalPrice)} | Delivery: ${formatInr(item.deliveryCharge)} | Total: ${formatInr(payable)}</p>
              ${orderStatusRail(item.status)}
              <div class="card-actions">
                <button class="kb-btn kb-btn-dark order-view-btn" data-id="${item.id}" type="button">View</button>
                ${
                  String(item.status || '') === 'delivered' && !item.buyerRating
                    ? `<button class="kb-btn kb-btn-primary order-rate-btn" data-id="${item.id}" type="button">Rate Delivery</button>`
                    : ''
                }
              </div>
            </div>
          </article>`;
        })
        .join('');
    }

    const statusNode = el('ordersStatus');
    if (statusNode) statusNode.textContent = `Showing ${currentOrders.length} order(s).`;
  }

  async function refresh() {
    if (!state.user?.id) {
      currentOrders = [];
      render();
      return;
    }
    const statusNode = el('ordersStatus');
    if (statusNode) statusNode.textContent = 'Loading orders...';
    try {
      const result = await api.listMyOrders({
        status: statusFilter?.value || undefined,
        limit: 50,
        offset: 0
      });
      currentOrders = Array.isArray(result.data) ? result.data : [];
      render();
      maybePromptRating();
    } catch (error) {
      if (list) list.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message || 'Unable to load orders')}</article>`;
      if (statusNode) statusNode.textContent = error.message || 'Unable to load orders';
    }
  }

  refreshBtn?.addEventListener('click', () => {
    refresh().catch(() => null);
  });

  statusFilter?.addEventListener('change', () => {
    refresh().catch(() => null);
  });

  list?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const rateBtn = target.closest('.order-rate-btn');
    if (rateBtn) {
      const order = currentOrders.find((item) => Number(item.id) === Number(rateBtn.dataset.id));
      if (!order) return;
      activeRatingOrderId = Number(order.id);
      renderRatingModal(order);
      showModal('orderRatingModal');
      return;
    }

    const viewBtn = target.closest('.order-view-btn');
    if (!viewBtn) return;
    const row = currentOrders.find((item) => Number(item.id) === Number(viewBtn.dataset.id));
    if (!row) return;
    window.alert(
      `Order #${row.id}\nItem: ${row.listingTitle}\nStatus: ${prettyStatus(row.status)}\nPayment: ${row.paymentMode} (${row.paymentState})\nDelivery step: ${prettyStatus(
        row.deliveryStatusTag || '-'
      )}\nRemark: ${row.deliveryNote || '-'}\nPayable: ${formatInr(row.payableTotal || row.totalPrice)}`
    );
  });

  closeRatingBtn?.addEventListener('click', () => {
    closeRatingModal();
  });

  ratingModal?.addEventListener('click', (event) => {
    if (event.target === ratingModal) {
      closeRatingModal();
    }
  });

  ratingContent?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('#orderRatingCancelBtn')) {
      closeRatingModal();
    }
  });

  ratingContent?.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'orderRatingForm') return;
    event.preventDefault();
    if (!activeRatingOrderId) return;
    const ratingInput = el('orderRatingInput');
    const remarkInput = el('orderRatingRemark');
    const statusNode = el('orderRatingStatus');
    const rating = Number(ratingInput?.value || 0);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      if (statusNode) statusNode.textContent = 'Rating must be between 1 and 5.';
      return;
    }
    if (statusNode) statusNode.textContent = 'Submitting rating...';
    try {
      const result = await api.rateOrder(activeRatingOrderId, {
        rating,
        remark: String(remarkInput?.value || '').trim()
      });
      if (result?.order?.id) {
        currentOrders = currentOrders.map((item) =>
          Number(item.id) === Number(result.order.id) ? { ...item, ...result.order } : item
        );
      }
      render();
      closeRatingModal();
      window.dispatchEvent(new CustomEvent('kp:orders:refresh'));
    } catch (error) {
      if (statusNode) statusNode.textContent = error.message || 'Unable to submit rating.';
    }
  });

  window.addEventListener('kp:orders:refresh', () => {
    refresh().catch(() => null);
  });

  render();

  return {
    refresh,
    onAuthChanged() {
      render();
      return refresh();
    }
  };
}
