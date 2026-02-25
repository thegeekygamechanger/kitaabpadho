import { initAi } from './ai.js';
import { initAdmin } from './admin.js';
import { initAuth } from './auth.js';
import { initCommunity } from './community.js';
import { initLocation } from './location.js';
import { initMarketplace } from './marketplace.js';
import { initNotifications } from './notifications.js';
import { initProfile } from './profile.js';
import { initPwa } from './pwa.js';
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

  const marketplace = initMarketplace({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });

  const community = initCommunity({
    state,
    openAuthModal: (message) => auth?.openAuthModal(message)
  });

  const admin = initAdmin({
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

  auth = initAuth({
    state,
    onAuthChanged: async () => {
      await Promise.all([
        marketplace.refreshListings(),
        community.refreshPosts(),
        admin.onAuthChanged(),
        profile.onAuthChanged(),
        notifications.onAuthChanged()
      ]);
    }
  });

  initLocation({
    state,
    onLocationChanged: async (coords) => {
      marketplace.onLocationChanged(coords);
      await marketplace.refreshListings();
    },
    onAreaChanged: async (areaCode) => {
      marketplace.setAreaCode(areaCode);
      await marketplace.refreshListings();
    }
  });

  initAi();
  initPwa();
  wireModalDismiss();

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
        admin.refresh(),
        profile.refreshUser(),
        notifications.refresh()
      ]);
    });
}

boot();
