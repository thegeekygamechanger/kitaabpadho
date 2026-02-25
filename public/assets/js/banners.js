import { api } from './api.js';
import { el, escapeHtml } from './ui.js';

function resolveTarget(linkUrl = '') {
  const raw = String(linkUrl || '').trim();
  if (!raw) return '/#marketplace';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  if (raw.startsWith('#')) return `/${raw}`;
  return `/${raw}`;
}

export function initBanners({ state }) {
  const strip = el('promoBanners');
  const status = el('promoBannerStatus');
  let timer = null;
  let current = 0;
  let items = [];

  function setStatus(message = '') {
    if (status) status.textContent = message;
  }

  function renderSlides() {
    if (!strip) return;
    if (!items.length) {
      strip.innerHTML = `<article class="promo-banner empty">
        <strong>Nearby marketplace updates</strong>
        <p>Use GPS to load active local and India-wide announcements.</p>
      </article>`;
      setStatus('');
      return;
    }

    strip.innerHTML = items
      .map((item, index) => {
        const active = index === current ? 'is-active' : '';
        const target = resolveTarget(item.linkUrl);
        const image = item.imageUrl
          ? `<div class="promo-banner-image"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || 'Banner image')}" /></div>`
          : '';
        return `<a class="promo-banner ${active}" href="${escapeHtml(target)}">
          ${image}
          <div class="promo-banner-copy">
            <p class="promo-banner-kicker">${escapeHtml((item.scope || 'local').toUpperCase())} MARKET</p>
            <h3>${escapeHtml(item.title || 'Latest update')}</h3>
            <p>${escapeHtml(item.message || '')}</p>
            <span class="promo-banner-cta">${escapeHtml(item.buttonText || 'Open')}</span>
          </div>
        </a>`;
      })
      .join('');
  }

  function startRotation() {
    if (timer) clearInterval(timer);
    if (items.length < 2) return;
    timer = setInterval(() => {
      current = (current + 1) % items.length;
      renderSlides();
    }, 5000);
  }

  async function refresh() {
    const scope = state.marketplace.scope || 'local';
    try {
      const result = await api.listBanners({ scope, limit: 8 });
      items = Array.isArray(result.data) ? result.data : [];
      current = 0;
      renderSlides();
      setStatus(items.length ? `Showing ${items.length} active banner(s)` : '');
      startRotation();
    } catch (error) {
      items = [];
      renderSlides();
      setStatus(error.message || 'Unable to load banners');
    }
  }

  renderSlides();

  return {
    refresh
  };
}
