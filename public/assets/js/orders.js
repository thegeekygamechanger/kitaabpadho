import { api } from './api.js';
import { el, escapeHtml, formatInr, renderEmpty } from './ui.js';

const STATUS_FLOW = ['received', 'packing', 'shipping', 'out_for_delivery', 'delivered'];
const ONLINE_MODES = new Set(['upi', 'card', 'razorpay']);

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
  const list = el('ordersList');
  const statusFilter = el('ordersStatusFilter');
  const refreshBtn = el('ordersRefreshBtn');
  let currentOrders = [];

  function render() {
    const isAuthed = Boolean(state.user?.id);
    if (panel) panel.classList.toggle('hidden', !isAuthed);
    if (navLink) navLink.hidden = !isAuthed;
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
          const canPayOnline =
            ONLINE_MODES.has(String(item.paymentMode || '').toLowerCase()) &&
            String(item.paymentState || '').toLowerCase() !== 'paid';
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
              <p class="muted">Items: ${formatInr(item.totalPrice)} | Delivery: ${formatInr(item.deliveryCharge)} | Total: ${formatInr(payable)}</p>
              ${orderStatusRail(item.status)}
              <div class="card-actions">
                ${
                  canPayOnline
                    ? `<button class="kb-btn kb-btn-primary order-pay-btn" data-id="${item.id}" type="button">Pay Online (Final Step)</button>`
                    : ''
                }
                <button class="kb-btn kb-btn-dark order-view-btn" data-id="${item.id}" type="button">View</button>
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

    const payBtn = target.closest('.order-pay-btn');
    if (payBtn) {
      if (!state.user?.id) {
        openAuthModal?.('Please login to continue payment.');
        return;
      }
      try {
        const payload = await api.createOrderRazorpayPayment(payBtn.dataset.id);
        window.alert(`Razorpay payment order ready: ${payload.paymentOrder?.id || 'N/A'}`);
        await refresh();
      } catch (error) {
        window.alert(error.message || 'Unable to start online payment');
      }
      return;
    }

    const viewBtn = target.closest('.order-view-btn');
    if (!viewBtn) return;
    const row = currentOrders.find((item) => Number(item.id) === Number(viewBtn.dataset.id));
    if (!row) return;
    window.alert(
      `Order #${row.id}\nItem: ${row.listingTitle}\nStatus: ${prettyStatus(row.status)}\nPayment: ${row.paymentMode} (${row.paymentState})\nPayable: ${formatInr(row.payableTotal || row.totalPrice)}`
    );
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
