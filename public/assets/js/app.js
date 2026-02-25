import { initAi } from './ai.js';
import { initAuth } from './auth.js';
import { initBanners } from './banners.js';
import { initCommunity } from './community.js';
import { initFeedback } from './feedback.js';
import { initFormEnhancements } from './forms.js';
import { initLocation } from './location.js';
import { initMarketplace } from './marketplace.js';
import { initNotifications } from './notifications.js';
import { initOrders } from './orders.js';
import { initProfile } from './profile.js';
import { initPwa } from './pwa.js';
import { initRealtime } from './realtime.js';
import { unlockNotificationSound } from './sound.js';
import { state } from './state.js';
import { el, hideModal } from './ui.js';

function wireModalDismiss() {
  ['authModal', 'listingDetailModal', 'communityDetailModal', 'orderSuccessModal', 'orderRatingModal', 'updateModal']
    .forEach((modalId) => {
      const modal = el(modalId);
      modal?.addEventListener('click', (event) => {
        if (event.target === modal) hideModal(modalId);
      });
    });
}

function boot() {
  try {
    localStorage.setItem('kp_active_portal', 'client');
  } catch {
    // ignore storage restrictions
  }
  initFormEnhancements();
  let auth;
  const viewIds = ['marketplace', 'community', 'ai', 'ordersPanel', 'notificationsPanel', 'profilePanel', 'supportPanel'];
  const gatedGuestViews = ['community', 'ai', 'ordersPanel', 'notificationsPanel', 'profilePanel', 'supportPanel'];
  const guestPromptSessionKey = 'kp_guest_login_prompt_v1';
  let guestPromptBound = false;

  function onGuestScrollPrompt() {
    if (state.user) {
      if (guestPromptBound) {
        window.removeEventListener('scroll', onGuestScrollPrompt);
        guestPromptBound = false;
      }
      return;
    }
    if (window.scrollY < 620) return;
    sessionStorage.setItem(guestPromptSessionKey, '1');
    if (guestPromptBound) {
      window.removeEventListener('scroll', onGuestScrollPrompt);
      guestPromptBound = false;
    }
    auth?.openAuthModal?.('Login / Signup to unlock Community, Ask PadhAI, notifications, and full buyer actions.');
  }

  function syncGuestPromptWatch() {
    if (state.user || sessionStorage.getItem(guestPromptSessionKey) === '1') {
      if (guestPromptBound) {
        window.removeEventListener('scroll', onGuestScrollPrompt);
        guestPromptBound = false;
      }
      return;
    }
    if (!guestPromptBound) {
      window.addEventListener('scroll', onGuestScrollPrompt, { passive: true });
      guestPromptBound = true;
    }
  }

  function syncTabView({ promptForAuth = true } = {}) {
    const rawTarget = String(window.location.hash || '#marketplace').replace('#', '');
    const requested = viewIds.includes(rawTarget) ? rawTarget : 'marketplace';
    const blockedForGuest = !state.user && gatedGuestViews.includes(requested);
    const target = blockedForGuest ? 'marketplace' : requested;

    const hero = el('heroSection');
    if (hero) hero.classList.toggle('view-hidden', target !== 'marketplace');
    const promo = el('promoBannerSection');
    if (promo) promo.classList.toggle('view-hidden', target !== 'marketplace');

    for (const id of viewIds) {
      const section = el(id);
      if (!section) continue;
      section.classList.toggle('view-hidden', id !== target);
    }

    document.querySelectorAll('.kb-nav a[href^="#"]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${target}`);
    });

    const notificationsBtn = el('notificationsBtn');
    if (notificationsBtn) notificationsBtn.classList.toggle('active', target === 'notificationsPanel');

    if (requested !== target) {
      window.history.replaceState(null, '', `#${target}`);
      if (blockedForGuest && promptForAuth) {
        auth?.openAuthModal?.('Login / Signup to access Community, Ask PadhAI, and notifications.');
      }
    }
  }

  const marketplace = initMarketplace({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });
  const banners = initBanners({ state });

  const community = initCommunity({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });

  const profile = initProfile({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message),
    onUserUpdated: (user) => {
      state.user = user;
      auth?.renderAuth?.();
    }
  });

  const notifications = initNotifications({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });

  const orders = initOrders({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });

  const feedback = initFeedback({
    portal: 'client',
    getUser: () => state.user,
    formId: 'supportForm',
    statusId: 'supportStatus',
    listId: 'supportList',
    refreshBtnId: 'supportRefreshBtn',
    onAuthRequired: (message) => auth?.openAuthModal(message)
  });

  const realtime = initRealtime({
    state,
    marketplace,
    banners,
    community,
    notifications,
    feedback,
    orders
  });

  auth = initAuth({
    state,
    onAuthChanged: async () => {
      if (!state.user && !state.marketplace.category) state.marketplace.category = 'stationery';
      await Promise.all([
        marketplace.refreshListings(),
        banners.refresh(),
        state.user ? community.loadCategories().then(() => community.refreshPosts()) : Promise.resolve(),
        profile.onAuthChanged(),
        orders.onAuthChanged(),
        notifications.onAuthChanged(),
        feedback.onAuthChanged(),
        realtime.onAuthChanged()
      ]);
      syncTabView({ promptForAuth: false });
      syncGuestPromptWatch();
    }
  });

  initLocation({
    state,
    onLocationChanged: async (coords) => {
      marketplace.onLocationChanged(coords);
      await marketplace.refreshListings();
    },
    onAreaChanged: async ({ areaCode, city }) => {
      marketplace.setAreaCode(areaCode);
      marketplace.setCityFromArea(city);
      await marketplace.refreshListings();
    },
    onGeoOptionsChanged: ({ nearbyCities, localityOptions }) => {
      marketplace.setGeoFilterOptions({ nearbyCities, localityOptions });
    }
  });

  initAi({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });
  initPwa();
  wireModalDismiss();
  syncTabView({ promptForAuth: false });
  window.addEventListener('hashchange', () => syncTabView());

  el('globalSearchForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = el('globalSearchInput')?.value.trim() || '';
    marketplace.setSearchQuery(query);
    window.location.hash = '#marketplace';
    await marketplace.refreshListings().catch(() => null);
    document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('#listingScopeTabs .tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      banners.refresh().catch(() => null);
    });
  });

  Promise.all([auth.refreshUser()])
    .catch(() => null)
    .finally(async () => {
      if (!state.user && !state.marketplace.category) state.marketplace.category = 'stationery';
      if (state.user) {
        await community.loadCategories().catch(() => null);
      }
      await Promise.all([
        marketplace.refreshListings(),
        banners.refresh(),
        state.user ? community.refreshPosts() : Promise.resolve(),
        profile.refreshUser(),
        orders.refresh(),
        notifications.refresh(),
        feedback.refreshMyFeedback(),
        realtime.onAuthChanged()
      ]);
      syncTabView({ promptForAuth: false });
      syncGuestPromptWatch();
    });

  window.addEventListener('pointerdown', unlockNotificationSound, { once: true });
  window.addEventListener('keydown', unlockNotificationSound, { once: true });
}

boot();
