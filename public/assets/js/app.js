import { initAi } from './ai.js';
import { initAuth } from './auth.js';
import { initCommunity } from './community.js';
import { initLocation } from './location.js';
import { initMarketplace } from './marketplace.js';
import { initNotifications } from './notifications.js';
import { initProfile } from './profile.js';
import { initPwa } from './pwa.js';
import { initRealtime } from './realtime.js';
import { state } from './state.js';
import { el, hideModal } from './ui.js';

function wireModalDismiss() {
  ['authModal', 'listingDetailModal', 'communityDetailModal', 'updateModal'].forEach((modalId) => {
    const modal = el(modalId);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) hideModal(modalId);
    });
  });
}

function boot() {
  let auth;
  const viewIds = ['marketplace', 'community', 'ai', 'notificationsPanel', 'profilePanel'];

  function syncTabView() {
    const rawTarget = String(window.location.hash || '#marketplace').replace('#', '');
    const requested = viewIds.includes(rawTarget) ? rawTarget : 'marketplace';
    const target =
      (requested === 'profilePanel' || requested === 'notificationsPanel') && !state.user
        ? 'marketplace'
        : requested;

    const hero = el('heroSection');
    if (hero) hero.classList.toggle('view-hidden', target !== 'marketplace');

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
    }
  }

  const marketplace = initMarketplace({ state });

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

  const realtime = initRealtime({
    state,
    marketplace,
    community,
    notifications
  });

  auth = initAuth({
    state,
    onAuthChanged: async () => {
      await Promise.all([
        marketplace.refreshListings(),
        community.refreshPosts(),
        profile.onAuthChanged(),
        notifications.onAuthChanged(),
        realtime.onAuthChanged()
      ]);
      syncTabView();
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
    }
  });

  initAi({ state });
  initPwa();
  wireModalDismiss();
  syncTabView();
  window.addEventListener('hashchange', syncTabView);

  el('globalSearchForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = el('globalSearchInput')?.value.trim() || '';
    marketplace.setSearchQuery(query);
    await marketplace.refreshListings();
    document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  Promise.all([auth.refreshUser(), community.loadCategories()])
    .catch(() => null)
    .finally(async () => {
      await Promise.all([
        marketplace.refreshListings(),
        community.refreshPosts(),
        profile.refreshUser(),
        notifications.refresh(),
        realtime.onAuthChanged()
      ]);
      syncTabView();
    });
}

boot();
