import { el, hideModal, showModal } from './ui.js';

export function initPwa() {
  const installBtn = el('installBtn');
  const applyUpdateBtn = el('applyUpdateBtn');
  const dismissUpdateBtn = el('dismissUpdateBtn');
  let deferredPrompt = null;
  let pendingRegistration = null;

  function showUpdateDialog(registration) {
    pendingRegistration = registration;
    showModal('updateModal');
  }

  function hideUpdateDialog() {
    hideModal('updateModal');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const onWaiting = () => {
          if (registration.waiting) {
            showUpdateDialog(registration);
          }
        };

        onWaiting();

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              onWaiting();
            }
          });
        });

        setInterval(() => {
          registration.update().catch(() => null);
        }, 5 * 60 * 1000);
      })
      .catch(() => null);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installBtn) installBtn.hidden = false;
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  applyUpdateBtn?.addEventListener('click', () => {
    if (!pendingRegistration?.waiting) return;
    pendingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    hideUpdateDialog();
  });

  dismissUpdateBtn?.addEventListener('click', () => {
    hideUpdateDialog();
  });
}
