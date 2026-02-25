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

const crudState = {
  listings: [],
  posts: [],
  comments: [],
  deliveryJobs: []
};

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
      ([label, value]) =>
        `<article class="admin-kpi"><strong>${escapeHtml(fmtNumber(value))}</strong><span>${escapeHtml(label)}</span></article>`
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

function rowActions(kind, id) {
  return `<div class="drawer-actions">
    <button class="kb-btn kb-btn-ghost admin-crud-action-btn" data-kind="${kind}" data-action="view" data-id="${id}" type="button">View</button>
    <button class="kb-btn kb-btn-dark admin-crud-action-btn" data-kind="${kind}" data-action="edit" data-id="${id}" type="button">Edit</button>
    <button class="kb-btn kb-btn-dark admin-crud-action-btn" data-kind="${kind}" data-action="delete" data-id="${id}" type="button">Delete</button>
  </div>`;
}

function renderCrudList(nodeId, items, renderItem) {
  const node = el(nodeId);
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No records found.</article>`;
    return;
  }
  node.innerHTML = `<div class="admin-mini-list">${items.map(renderItem).join('')}</div>`;
}

function renderCrudPanels() {
  renderCrudList('adminCrudListings', crudState.listings, (item) => {
    return `<article class="admin-mini-item">
      <h5>#${escapeHtml(String(item.id))} ${escapeHtml(item.title || '')}</h5>
      <p class="muted">${escapeHtml(item.city || '')} | ${escapeHtml(item.listingType || '')} | ${escapeHtml(
      String(item.price ?? 0)
    )}</p>
      ${rowActions('listing', item.id)}
    </article>`;
  });

  renderCrudList('adminCrudPosts', crudState.posts, (item) => {
    return `<article class="admin-mini-item">
      <h5>#${escapeHtml(String(item.id))} ${escapeHtml(item.title || '')}</h5>
      <p class="muted">${escapeHtml(item.categorySlug || '')} | ${escapeHtml(item.authorName || '')}</p>
      ${rowActions('post', item.id)}
    </article>`;
  });

  renderCrudList('adminCrudComments', crudState.comments, (item) => {
    return `<article class="admin-mini-item">
      <h5>#${escapeHtml(String(item.id))} (${escapeHtml(item.postTitle || `Post #${item.postId}`)})</h5>
      <p class="muted">${escapeHtml(String(item.content || '').slice(0, 120))}</p>
      ${rowActions('comment', item.id)}
    </article>`;
  });

  renderCrudList('adminCrudDelivery', crudState.deliveryJobs, (item) => {
    return `<article class="admin-mini-item">
      <h5>#${escapeHtml(String(item.id))} Listing #${escapeHtml(String(item.listingId || ''))}</h5>
      <p class="muted">${escapeHtml(item.status || '')} | ${escapeHtml(item.pickupCity || '')}</p>
      ${rowActions('delivery', item.id)}
    </article>`;
  });
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

async function refreshCrudData() {
  try {
    setText('adminCrudStatus', 'Loading resources...');

    const listingsPromise = api.listListings({ limit: 12, offset: 0, sort: 'newest' }).catch(() => ({ data: [] }));
    const postsPromise = api.listCommunityPosts({ limit: 8, offset: 0 }).catch(() => ({ data: [] }));
    const deliveryPromises = ['open', 'claimed', 'completed', 'cancelled'].map((status) =>
      api.listDeliveryJobs({ status, limit: 8, offset: 0 }).catch(() => ({ data: [] }))
    );

    const [listingsResult, postsResult, ...deliveryResults] = await Promise.all([
      listingsPromise,
      postsPromise,
      ...deliveryPromises
    ]);

    crudState.listings = listingsResult.data || [];
    crudState.posts = postsResult.data || [];

    const postDetails = await Promise.all(
      crudState.posts.slice(0, 6).map((post) => api.communityPostById(post.id).catch(() => null))
    );
    crudState.comments = postDetails
      .filter(Boolean)
      .flatMap((post) =>
        (post.comments || []).slice(0, 6).map((comment) => ({
          ...comment,
          postTitle: post.title
        }))
      )
      .slice(0, 16);

    const seenJobs = new Set();
    crudState.deliveryJobs = deliveryResults
      .flatMap((result) => result.data || [])
      .filter((job) => {
        const key = Number(job.id);
        if (seenJobs.has(key)) return false;
        seenJobs.add(key);
        return true;
      })
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 16);

    renderCrudPanels();
    setText(
      'adminCrudStatus',
      `Listings: ${crudState.listings.length} | Posts: ${crudState.posts.length} | Comments: ${crudState.comments.length} | Delivery: ${crudState.deliveryJobs.length}`
    );
  } catch (error) {
    setText('adminCrudStatus', error.message || 'Unable to load CRUD resources');
  }
}

function findCrudItem(kind, id) {
  const numericId = Number(id);
  if (kind === 'listing') return crudState.listings.find((item) => Number(item.id) === numericId);
  if (kind === 'post') return crudState.posts.find((item) => Number(item.id) === numericId);
  if (kind === 'comment') return crudState.comments.find((item) => Number(item.id) === numericId);
  if (kind === 'delivery') return crudState.deliveryJobs.find((item) => Number(item.id) === numericId);
  return null;
}

async function handleCrudAction(kind, action, id) {
  const item = findCrudItem(kind, id);
  if (!item) {
    setText('adminCrudStatus', 'Selected item not found.');
    return;
  }

  if (kind === 'listing') {
    if (action === 'view') {
      const full = await api.listingById(item.id);
      window.alert(
        `Listing #${full.id}\n${full.title}\n${full.city} | ${full.listingType}/${full.category}\nPrice: ${full.price}\n${full.description || ''}`
      );
      return;
    }
    if (action === 'edit') {
      const nextTitle = window.prompt('Update title', item.title || '');
      if (nextTitle === null) return;
      const nextDescription = window.prompt('Update description', item.description || '');
      if (nextDescription === null) return;
      const nextPriceRaw = window.prompt('Update price', String(item.price || 0));
      if (nextPriceRaw === null) return;
      const nextCity = window.prompt('Update city', item.city || '');
      if (nextCity === null) return;
      const nextPrice = Number(nextPriceRaw);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        setText('adminCrudStatus', 'Invalid price.');
        return;
      }
      await api.updateListing(item.id, {
        title: nextTitle.trim() || item.title,
        description: nextDescription.trim() || item.description,
        category: item.category,
        listingType: item.listingType,
        sellerType: item.sellerType || 'student',
        deliveryMode: item.deliveryMode || 'peer_to_peer',
        paymentModes: Array.isArray(item.paymentModes) && item.paymentModes.length ? item.paymentModes : ['cod'],
        price: nextPrice,
        city: nextCity.trim() || item.city || 'Unknown',
        areaCode: item.areaCode || 'other',
        serviceableAreaCodes: Array.isArray(item.serviceableAreaCodes) ? item.serviceableAreaCodes : [],
        serviceableCities: Array.isArray(item.serviceableCities) ? item.serviceableCities : [],
        latitude: Number(item.latitude),
        longitude: Number(item.longitude)
      });
      await refreshCrudData();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete listing #${item.id}?`)) return;
      await api.deleteListing(item.id);
      await refreshCrudData();
      return;
    }
  }

  if (kind === 'post') {
    if (action === 'view') {
      const post = await api.communityPostById(item.id);
      window.alert(
        `Post #${post.id}\n${post.title}\nCategory: ${post.categorySlug}\nAuthor: ${post.authorName}\n\n${post.content}`
      );
      return;
    }
    if (action === 'edit') {
      const post = await api.communityPostById(item.id);
      const nextTitle = window.prompt('Update post title', post.title || '');
      if (nextTitle === null) return;
      const nextContent = window.prompt('Update post content', post.content || '');
      if (nextContent === null) return;
      const nextCategory = window.prompt('Update category slug', post.categorySlug || '');
      if (nextCategory === null) return;
      await api.updateCommunityPost(item.id, {
        title: nextTitle.trim(),
        content: nextContent.trim(),
        categorySlug: nextCategory.trim()
      });
      await refreshCrudData();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete post #${item.id} and all comments?`)) return;
      await api.deleteCommunityPost(item.id);
      await refreshCrudData();
      return;
    }
  }

  if (kind === 'comment') {
    if (action === 'view') {
      window.alert(`Comment #${item.id}\nPost #${item.postId}\n\n${item.content || ''}`);
      return;
    }
    if (action === 'edit') {
      const nextContent = window.prompt('Update comment content', item.content || '');
      if (nextContent === null) return;
      await api.updateCommunityComment(item.id, { content: nextContent.trim() });
      await refreshCrudData();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete comment #${item.id}?`)) return;
      await api.deleteCommunityComment(item.id);
      await refreshCrudData();
      return;
    }
  }

  if (kind === 'delivery') {
    if (action === 'view') {
      const job = await api.deliveryJobById(item.id);
      window.alert(
        `Delivery Job #${job.id}\nListing #${job.listingId}\nStatus: ${job.status}\nPickup: ${job.pickupCity} (${job.pickupAreaCode})\nMode: ${job.deliveryMode}`
      );
      return;
    }
    if (action === 'edit') {
      const nextStatus = (window.prompt('Enter status: open, claimed, completed, cancelled', item.status || 'open') || '')
        .trim()
        .toLowerCase();
      if (!nextStatus) return;
      if (!['open', 'claimed', 'completed', 'cancelled'].includes(nextStatus)) {
        setText('adminCrudStatus', 'Invalid status.');
        return;
      }
      await api.updateDeliveryJobStatus(item.id, nextStatus);
      await refreshCrudData();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete delivery job #${item.id}?`)) return;
      await api.deleteDeliveryJob(item.id);
      await refreshCrudData();
    }
  }
}

async function checkAdminSession() {
  try {
    const me = await api.authMe();
    const isAdmin = me.authenticated && me.user?.role === 'admin';
    el('adminLoginPanel')?.classList.toggle('hidden', isAdmin);
    el('adminMainPanel')?.classList.toggle('hidden', !isAdmin);
    if (!me.authenticated) {
      setText('adminLoginStatus', 'Login with an admin account to open this panel.');
      setText('adminStatus', 'Admin login required.');
      return;
    }
    if (!isAdmin) {
      const role = me.user?.role || 'unknown';
      setText('adminLoginStatus', `Logged in as ${role}. Admin role is required.`);
      setText('adminStatus', 'Current account is not an admin account.');
      return;
    }
    setText('adminLoginStatus', `Admin session active: ${me.user?.email || ''}`);
    if (isAdmin) {
      await refreshAdminData();
      await refreshCrudData();
    }
  } catch (error) {
    el('adminLoginPanel')?.classList.remove('hidden');
    el('adminMainPanel')?.classList.add('hidden');
    setText('adminLoginStatus', error.message || 'Unable to validate admin session.');
    setText('adminStatus', 'Unable to load admin panel.');
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
    const me = await api.authMe();
    if (!me.authenticated || me.user?.role !== 'admin') {
      await api.authLogout();
      throw new Error('This account is not admin. Please login with admin credentials.');
    }
    form.reset();
    setText('adminLoginStatus', 'Logged in as admin.');
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

el('adminCrudRefreshBtn')?.addEventListener('click', () => {
  refreshCrudData().catch(() => null);
});

el('adminMainPanel')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.admin-crud-action-btn');
  if (!button) return;
  try {
    setText('adminCrudStatus', 'Applying action...');
    await handleCrudAction(button.dataset.kind, button.dataset.action, button.dataset.id);
    setText('adminCrudStatus', 'Action completed.');
  } catch (error) {
    setText('adminCrudStatus', error.message || 'CRUD action failed');
  }
});

el('adminLogoutBtn')?.addEventListener('click', async () => {
  try {
    await api.authLogout();
  } finally {
    window.location.reload();
  }
});

setInterval(() => {
  if (!el('adminMainPanel')?.classList.contains('hidden')) {
    Promise.all([refreshAdminData(), refreshCrudData()]).catch(() => null);
  }
}, 20000);

checkAdminSession().catch(() => null);
