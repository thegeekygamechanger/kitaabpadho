function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function initRealtime({ state, marketplace, community, notifications }) {
  let source = null;
  const timers = new Map();

  function debounceRefresh(key, fn, waitMs = 220) {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      Promise.resolve(fn()).catch(() => null);
    }, waitMs);
    timers.set(key, timer);
  }

  function showBrowserNotification(title, body) {
    if (!state.user || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  function bindEvents(nextSource) {
    nextSource.addEventListener('listing.created', () => {
      debounceRefresh('listings', () => marketplace.refreshListings());
      debounceRefresh('notifications', () => notifications.refresh());
    });

    nextSource.addEventListener('community.updated', () => {
      debounceRefresh('community', () => community.refreshPosts());
      debounceRefresh('notifications', () => notifications.refresh());
    });

    nextSource.addEventListener('delivery.updated', () => {
      debounceRefresh('notifications', () => notifications.refresh());
    });

    nextSource.addEventListener('notifications.invalidate', (event) => {
      const payload = safeJsonParse(event.data || '{}');
      debounceRefresh('notifications', () => notifications.refresh(), 120);
      if (payload?.source === 'community.comment') {
        showBrowserNotification('Community update', 'New comment received on your discussion.');
      }
      if (payload?.source === 'listing.create') {
        showBrowserNotification('New arrival', 'New listing available in marketplace.');
      }
    });
  }

  function connect() {
    if (source) source.close();
    source = new EventSource('/api/events/stream');
    bindEvents(source);
  }

  connect();

  return {
    onAuthChanged() {
      connect();
    }
  };
}
