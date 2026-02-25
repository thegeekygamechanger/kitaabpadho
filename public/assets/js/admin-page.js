import { api } from './api.js';
import { initFormEnhancements } from './forms.js';
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
  deliveryJobs: [],
  banners: [],
  feedback: [],
  users: [],
  adminUser: null
};

initFormEnhancements();
try {
  localStorage.setItem('kp_active_portal', 'admin');
} catch {
  // ignore storage restriction
}

const ADMIN_TAB_IDS = ['adminMainPanel', 'adminBannerPanel', 'adminSupportPanel', 'adminProfilePanel'];
const ADMIN_TAB_LINK_IDS = {
  adminMainPanel: 'adminActionsNav',
  adminBannerPanel: 'adminBannerNav',
  adminSupportPanel: 'adminSupportNav',
  adminProfilePanel: 'adminProfileNav'
};

function syncAdminTabs() {
  const mainPanel = el('adminMainPanel');
  const isAdminSession = Boolean(mainPanel && !mainPanel.classList.contains('hidden'));
  const loginPanel = el('adminLoginPanel');
  if (!isAdminSession) {
    for (const id of ADMIN_TAB_IDS) {
      el(id)?.classList.add('view-hidden');
    }
    loginPanel?.classList.remove('view-hidden');
    for (const linkId of Object.values(ADMIN_TAB_LINK_IDS)) {
      el(linkId)?.classList.remove('active');
    }
    return;
  }

  const available = ADMIN_TAB_IDS.filter((id) => {
    const node = el(id);
    return Boolean(node && !node.classList.contains('hidden'));
  });
  const rawHash = String(window.location.hash || '').replace('#', '');
  const fallback = available[0] || 'adminMainPanel';
  const target = available.includes(rawHash) ? rawHash : fallback;

  loginPanel?.classList.add('view-hidden');
  for (const id of ADMIN_TAB_IDS) {
    const node = el(id);
    if (!node) continue;
    node.classList.toggle('view-hidden', id !== target || node.classList.contains('hidden'));
  }

  for (const [sectionId, linkId] of Object.entries(ADMIN_TAB_LINK_IDS)) {
    const link = el(linkId);
    if (!link) continue;
    link.classList.toggle('active', sectionId === target);
  }

  if (rawHash !== target) {
    window.history.replaceState(null, '', `#${target}`);
  }
}

function syncAdminHeader(authenticated, isAdmin) {
  const logoutBtn = el('adminLogoutBtn');
  if (logoutBtn) logoutBtn.hidden = !isAdmin;
  el('adminPortalNav')?.classList.toggle('hidden', !isAdmin);
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

function renderBannerList(items) {
  const node = el('adminBannerList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No banners found.</article>`;
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.scope || 'local')}</span>
            <span class="muted">${escapeHtml(item.source || 'manual')}</span>
            <span class="muted">${item.isActive ? 'active' : 'inactive'}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title || '')}</h3>
          <p class="muted">${escapeHtml(item.message || '')}</p>
          <div class="card-actions">
            <button class="kb-btn kb-btn-ghost admin-banner-action-btn" data-action="view" data-id="${item.id}" type="button">View</button>
            <button class="kb-btn kb-btn-dark admin-banner-action-btn" data-action="edit" data-id="${item.id}" type="button">Edit</button>
            <button class="kb-btn kb-btn-dark admin-banner-action-btn" data-action="delete" data-id="${item.id}" type="button">Delete</button>
          </div>
        </div>
      </article>`
    )
    .join('');
}

function renderFeedbackList(items) {
  const node = el('adminFeedbackList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No customer service queries found.</article>`;
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.sourcePortal || 'client')}</span>
            <span class="muted">${escapeHtml(item.senderRole || 'guest')}</span>
            <span class="muted">${escapeHtml(fmtTime(item.createdAt))}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.subject || '')}</h3>
          <p class="muted">${escapeHtml(item.message || '')}</p>
          <p class="muted">${escapeHtml(item.senderName || '')} | ${escapeHtml(item.senderEmail || '')}</p>
        </div>
      </article>`
    )
    .join('');
}

function renderUsersList(items) {
  const node = el('adminUsersList');
  if (!node) return;
  if (!Array.isArray(items) || !items.length) {
    node.innerHTML = `<article class="state-empty">No users found.</article>`;
    return;
  }
  node.innerHTML = items
    .map((item) => {
      return `<article class="card">
        <div class="card-body">
          <div class="card-meta">
            <span class="pill type-buy">${escapeHtml(item.role || 'student')}</span>
            <span class="muted">${item.totpEnabled ? 'totp:on' : 'totp:off'}</span>
            <span class="muted">${item.pushEnabled ? 'push:on' : 'push:off'}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.fullName || '')}</h3>
          <p class="muted">${escapeHtml(item.email || '')}</p>
          <p class="muted">${escapeHtml(item.phoneNumber || '-')}</p>
          <p class="muted">Joined: ${escapeHtml(fmtTime(item.createdAt))}</p>
          <div class="card-actions">
            <button class="kb-btn kb-btn-ghost admin-user-action-btn" data-action="view" data-id="${item.id}" type="button">View</button>
            <button class="kb-btn kb-btn-ghost admin-user-action-btn" data-action="history" data-id="${item.id}" type="button">History</button>
            <button class="kb-btn kb-btn-dark admin-user-action-btn" data-action="edit" data-id="${item.id}" type="button">Edit</button>
            <button class="kb-btn kb-btn-dark admin-user-action-btn" data-action="resetPassword" data-id="${item.id}" type="button">Reset Password</button>
            <button class="kb-btn kb-btn-dark admin-user-action-btn" data-action="delete" data-id="${item.id}" type="button">Delete</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function renderAdminProfile() {
  const form = el('adminProfileForm');
  if (!form || !crudState.adminUser) return;
  if (form.fullName) form.fullName.value = crudState.adminUser.fullName || '';
  if (form.email) form.email.value = crudState.adminUser.email || '';
  if (form.phoneNumber) form.phoneNumber.value = crudState.adminUser.phoneNumber || '';
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

async function refreshBannerData() {
  try {
    setText('adminBannerStatus', 'Loading banners...');
    const result = await api.listMyBanners({ limit: 120 });
    crudState.banners = result.data || [];
    renderBannerList(crudState.banners);
    setText('adminBannerStatus', `Banners: ${crudState.banners.length}`);
  } catch (error) {
    setText('adminBannerStatus', error.message || 'Unable to load banners');
  }
}

async function refreshFeedbackData() {
  try {
    const result = await api.listAdminFeedback({ limit: 60, offset: 0 });
    crudState.feedback = result.data || [];
    renderFeedbackList(crudState.feedback);
  } catch (error) {
    const node = el('adminFeedbackList');
    if (node) node.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message || 'Unable to load feedback')}</article>`;
  }
}

async function refreshUsersData() {
  try {
    const q = el('adminUsersSearchInput')?.value.trim() || '';
    const result = await api.listAdminUsers({ q: q || undefined, limit: 80, offset: 0 });
    crudState.users = Array.isArray(result.data) ? result.data : [];
    renderUsersList(crudState.users);
    setText('adminUsersStatus', `Users loaded: ${crudState.users.length}`);
  } catch (error) {
    setText('adminUsersStatus', error.message || 'Unable to load users');
  }
}

async function refreshDeliveryRateData() {
  try {
    const result = await api.getDeliveryRateSetting();
    const input = el('adminDeliveryRateInput');
    if (input) input.value = String(result.amountPer10Km ?? 20);
    setText('adminDeliveryRateStatus', `Current delivery rate: INR ${fmtNumber(result.amountPer10Km || 0)} per 10 KM`);
  } catch (error) {
    setText('adminDeliveryRateStatus', error.message || 'Unable to load delivery rate');
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

function findUserItem(id) {
  return crudState.users.find((item) => Number(item.id) === Number(id));
}

async function handleAdminUserAction(action, id) {
  const user = findUserItem(id);
  if (!user) {
    setText('adminUsersStatus', 'User not found.');
    return;
  }

  if (action === 'view') {
    const result = await api.adminUserById(user.id);
    const detail = result.user || user;
    window.alert(
      `User #${detail.id}\n${detail.fullName}\n${detail.email}\nRole: ${detail.role}\nPhone: ${detail.phoneNumber || '-'}\nTOTP: ${
        detail.totpEnabled ? 'enabled' : 'disabled'
      }\nPush: ${detail.pushEnabled ? 'enabled' : 'disabled'}`
    );
    return;
  }

  if (action === 'history') {
    const result = await api.adminUserHistory(user.id, { limit: 20, offset: 0 });
    const lines = (result.data || [])
      .slice(0, 20)
      .map((item) => `${fmtTime(item.createdAt)} | ${item.actionType} | ${item.summary}`)
      .join('\n');
    window.alert(`Recent actions for ${user.email}\n\n${lines || 'No actions found.'}`);
    return;
  }

  if (action === 'edit') {
    const nextName = window.prompt('Full name', user.fullName || '');
    if (nextName === null) return;
    const nextPhone = window.prompt('Phone number (10-15 digits)', user.phoneNumber || '');
    if (nextPhone === null) return;
    const nextRole = (window.prompt('Role: student, seller, delivery, admin', user.role || 'student') || '').trim().toLowerCase();
    if (!nextRole) return;
    if (!['student', 'seller', 'delivery', 'admin'].includes(nextRole)) {
      setText('adminUsersStatus', 'Invalid role.');
      return;
    }
    const nextEmail = window.prompt('Email', user.email || '');
    if (nextEmail === null) return;
    await api.adminUpdateUser(user.id, {
      fullName: nextName.trim(),
      phoneNumber: nextPhone.trim(),
      role: nextRole,
      email: nextEmail.trim()
    });
    await refreshUsersData();
    await refreshAdminData().catch(() => null);
    setText('adminUsersStatus', `User #${user.id} updated.`);
    return;
  }

  if (action === 'resetPassword') {
    const newPassword = window.prompt(`Enter new password for ${user.email} (min 8 chars)`, '');
    if (!newPassword) return;
    await api.adminResetUserPassword({
      email: user.email,
      newPassword
    });
    setText('adminUsersStatus', `Password reset for ${user.email}.`);
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Delete user "${user.email}"? This action is permanent.`)) return;
    await api.adminDeleteUser(user.id);
    await refreshUsersData();
    await refreshAdminData().catch(() => null);
    setText('adminUsersStatus', `User ${user.email} deleted.`);
  }
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
        areaCode: item.areaCode || 'unknown',
        serviceableAreaCodes: Array.isArray(item.serviceableAreaCodes) ? item.serviceableAreaCodes : [],
        serviceableCities: Array.isArray(item.serviceableCities) ? item.serviceableCities : [],
        publishIndia: Boolean(item.publishIndia),
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

function findBanner(id) {
  return crudState.banners.find((item) => Number(item.id) === Number(id));
}

async function handleBannerAction(action, id) {
  const item = findBanner(id);
  if (!item) {
    setText('adminBannerStatus', 'Banner not found.');
    return;
  }
  if (action === 'view') {
    window.alert(`${item.title}\n${item.message || ''}\n${item.linkUrl || '/#marketplace'}`);
    return;
  }
  if (action === 'edit') {
    const nextTitle = window.prompt('Banner title', item.title || '');
    if (nextTitle === null) return;
    const nextMessage = window.prompt('Banner message', item.message || '');
    if (nextMessage === null) return;
    const nextLink = window.prompt('Redirect URL', item.linkUrl || '/#marketplace');
    if (nextLink === null) return;
    await api.updateBanner(item.id, {
      title: nextTitle.trim(),
      message: nextMessage.trim(),
      linkUrl: nextLink.trim() || '/#marketplace'
    });
    await refreshBannerData();
    return;
  }
  if (action === 'delete') {
    if (!window.confirm(`Delete banner "${item.title}"?`)) return;
    await api.deleteBanner(item.id);
    await refreshBannerData();
  }
}

async function checkAdminSession() {
  try {
    const me = await api.authMe();
    const isAdmin = me.authenticated && me.user?.role === 'admin';
    syncAdminHeader(Boolean(me.authenticated), isAdmin);
    el('adminLoginPanel')?.classList.toggle('hidden', isAdmin);
    el('adminMainPanel')?.classList.toggle('hidden', !isAdmin);
    el('adminBannerPanel')?.classList.toggle('hidden', !isAdmin);
    el('adminSupportPanel')?.classList.toggle('hidden', !isAdmin);
    el('adminProfilePanel')?.classList.toggle('hidden', !isAdmin);
    syncAdminTabs();
    if (!me.authenticated) {
      crudState.adminUser = null;
      setText('adminLoginStatus', 'Login with an admin account to open this panel.');
      setText('adminStatus', 'Admin login required.');
      return;
    }
    if (!isAdmin) {
      crudState.adminUser = null;
      const role = me.user?.role || 'unknown';
      setText('adminLoginStatus', `Logged in as ${role}. Admin role is required.`);
      setText('adminStatus', 'Current account is not an admin account.');
      return;
    }
    crudState.adminUser = me.user;
    renderAdminProfile();
    setText('adminLoginStatus', `Admin session active: ${me.user?.email || ''}`);
    if (isAdmin) {
      await Promise.all([
        refreshAdminData(),
        refreshCrudData(),
        refreshBannerData(),
        refreshFeedbackData(),
        refreshUsersData(),
        refreshDeliveryRateData()
      ]);
    }
  } catch (error) {
    crudState.adminUser = null;
    syncAdminHeader(false, false);
    el('adminLoginPanel')?.classList.remove('hidden');
    el('adminMainPanel')?.classList.add('hidden');
    el('adminBannerPanel')?.classList.add('hidden');
    el('adminSupportPanel')?.classList.add('hidden');
    el('adminProfilePanel')?.classList.add('hidden');
    syncAdminTabs();
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

el('adminBannerRefreshBtn')?.addEventListener('click', () => {
  refreshBannerData().catch(() => null);
});

el('adminSupportRefreshBtn')?.addEventListener('click', () => {
  refreshFeedbackData().catch(() => null);
});

el('adminUsersRefreshBtn')?.addEventListener('click', () => {
  refreshUsersData().catch(() => null);
});

el('adminUsersSearchBtn')?.addEventListener('click', () => {
  refreshUsersData().catch(() => null);
});

el('adminUsersSearchInput')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  refreshUsersData().catch(() => null);
});

el('adminCreateUserForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminUsersStatus', 'Creating user...');
  try {
    await api.adminCreateUser({
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phoneNumber: form.phoneNumber.value.trim(),
      password: form.password.value,
      role: form.role.value
    });
    form.reset();
    setText('adminUsersStatus', 'User created.');
    await refreshUsersData();
    await refreshAdminData();
  } catch (error) {
    setText('adminUsersStatus', error.message || 'Unable to create user');
  }
});

el('adminDeliveryRateForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = el('adminDeliveryRateInput');
  const amount = Number(input?.value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    setText('adminDeliveryRateStatus', 'Enter a valid amount.');
    return;
  }
  setText('adminDeliveryRateStatus', 'Saving delivery rate...');
  try {
    await api.adminSetDeliveryRate(amount);
    await refreshDeliveryRateData();
    setText('adminDeliveryRateStatus', 'Delivery rate updated.');
  } catch (error) {
    setText('adminDeliveryRateStatus', error.message || 'Unable to save delivery rate');
  }
});

el('adminProfileForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminProfileStatus', 'Saving profile...');
  try {
    const payload = await api.updateProfile({
      fullName: form.fullName.value.trim(),
      phoneNumber: form.phoneNumber.value.trim()
    });
    crudState.adminUser = payload.user || crudState.adminUser;
    renderAdminProfile();
    setText('adminProfileStatus', 'Profile updated.');
  } catch (error) {
    setText('adminProfileStatus', error.message || 'Unable to update profile');
  }
});

el('adminPasswordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminPasswordStatus', 'Changing admin password...');
  try {
    const payload = await api.adminChangePassword({
      currentPassword: form.currentPassword.value,
      newPassword: form.newPassword.value
    });
    form.reset();
    setText(
      'adminPasswordStatus',
      payload?.reauthRequired ? 'Password changed. Please login again.' : 'Password changed.'
    );
    if (payload?.reauthRequired) {
      window.location.reload();
    }
  } catch (error) {
    setText('adminPasswordStatus', error.message || 'Unable to change admin password');
  }
});

el('adminUserResetForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminUserResetStatus', 'Resetting user password...');
  try {
    await api.adminResetUserPassword({
      email: form.email.value.trim(),
      newPassword: form.newPassword.value
    });
    form.reset();
    setText('adminUserResetStatus', 'User password reset done.');
  } catch (error) {
    setText('adminUserResetStatus', error.message || 'Unable to reset user password');
  }
});

el('adminMainPanel')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const crudButton = target.closest('.admin-crud-action-btn');
  const userButton = target.closest('.admin-user-action-btn');
  if (!crudButton && !userButton) return;
  try {
    if (crudButton) {
      setText('adminCrudStatus', 'Applying action...');
      await handleCrudAction(crudButton.dataset.kind, crudButton.dataset.action, crudButton.dataset.id);
      setText('adminCrudStatus', 'Action completed.');
      return;
    }
    if (userButton) {
      setText('adminUsersStatus', 'Applying user action...');
      await handleAdminUserAction(userButton.dataset.action, userButton.dataset.id);
      return;
    }
  } catch (error) {
    if (crudButton) {
      setText('adminCrudStatus', error.message || 'CRUD action failed');
    } else {
      setText('adminUsersStatus', error.message || 'User action failed');
    }
  }
});

el('adminBannerList')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.admin-banner-action-btn');
  if (!button) return;
  try {
    setText('adminBannerStatus', 'Applying action...');
    await handleBannerAction(button.dataset.action, button.dataset.id);
    setText('adminBannerStatus', 'Action completed.');
  } catch (error) {
    setText('adminBannerStatus', error.message || 'Banner action failed');
  }
});

el('adminBannerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setText('adminBannerStatus', 'Publishing banner...');
  try {
    let imageKey = '';
    let imageUrl = '';
    const file = form.image?.files?.[0];
    if (file && String(file.type || '').startsWith('image/')) {
      const uploaded = await api.uploadBannerImage(file);
      imageKey = uploaded.key || '';
      imageUrl = uploaded.url || '';
    }
    await api.createBanner({
      title: form.title.value.trim(),
      message: form.message.value.trim(),
      linkUrl: (form.linkUrl.value || '/#marketplace').trim(),
      buttonText: (form.buttonText.value || 'View').trim(),
      scope: form.scope.value || 'local',
      priority: Number(form.priority.value || 10),
      isActive: Boolean(form.isActive.checked),
      imageKey,
      imageUrl
    });
    form.reset();
    setText('adminBannerStatus', 'Banner published.');
    await refreshBannerData();
  } catch (error) {
    setText('adminBannerStatus', error.message || 'Unable to publish banner');
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
    Promise.all([
      refreshAdminData(),
      refreshCrudData(),
      refreshBannerData(),
      refreshFeedbackData(),
      refreshUsersData(),
      refreshDeliveryRateData()
    ]).catch(() => null);
  }
}, 20000);

window.addEventListener('hashchange', () => {
  syncAdminTabs();
});

checkAdminSession().catch(() => null);
