import { initAi } from './ai.js';
import { initAuth } from './auth.js';
import { initCommunity } from './community.js';
import { initLocation } from './location.js';
import { initMarketplace } from './marketplace.js';
import { initPwa } from './pwa.js';
import { state } from './state.js';
import { el, hideModal } from './ui.js';

function wireModalDismiss() {
  ['authModal', 'listingDetailModal', 'communityDetailModal'].forEach((modalId) => {
    const modal = el(modalId);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) hideModal(modalId);
    });
  });
}

function boot() {
  const marketplace = initMarketplace({
    state,
    openAuthModal: (message) => auth.openAuthModal(message)
  });

  const community = initCommunity({
    state,
    openAuthModal: (message) => auth.openAuthModal(message)
  });

  const auth = initAuth({
    state,
    onAuthChanged: async () => {
      await Promise.all([marketplace.refreshListings(), community.refreshPosts()]);
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
      await Promise.all([marketplace.refreshListings(), community.refreshPosts()]);
    });
}

boot();
