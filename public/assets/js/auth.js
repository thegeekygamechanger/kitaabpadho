import { api } from './api.js';
import { el, hideModal, setText, showModal } from './ui.js';

export function initAuth({ state, onAuthChanged }) {
  const modalId = 'authModal';
  const openAuthBtn = el('openAuthBtn');
  const closeAuthBtn = el('closeAuthBtn');
  const logoutBtn = el('logoutBtn');
  const authBadge = el('authBadge');
  const authStatus = el('authStatus');
  const loginForm = el('loginForm');
  const registerForm = el('registerForm');

  function renderAuth() {
    if (state.user) {
      if (openAuthBtn) openAuthBtn.hidden = true;
      if (logoutBtn) logoutBtn.hidden = false;
      if (authBadge) authBadge.textContent = `Hi ${state.user.fullName}`;
    } else {
      if (openAuthBtn) openAuthBtn.hidden = false;
      if (logoutBtn) logoutBtn.hidden = true;
      if (authBadge) authBadge.textContent = 'Guest Mode';
    }
  }

  function openModal(message = '') {
    if (authStatus) authStatus.textContent = message;
    showModal(modalId);
  }

  function closeModal() {
    hideModal(modalId);
  }

  async function refreshUser() {
    try {
      const result = await api.authMe();
      state.user = result.authenticated ? result.user : null;
    } catch {
      state.user = null;
    }
    renderAuth();
    onAuthChanged?.(state.user);
  }

  async function login(payload) {
    const result = await api.authLogin(payload);
    state.user = result.user;
    renderAuth();
    onAuthChanged?.(state.user);
    setText('authStatus', 'Logged in successfully.');
    setTimeout(closeModal, 350);
  }

  async function register(payload) {
    const result = await api.authRegister(payload);
    state.user = result.user;
    renderAuth();
    onAuthChanged?.(state.user);
    setText('authStatus', 'Signup completed. You are logged in.');
    setTimeout(closeModal, 350);
  }

  openAuthBtn?.addEventListener('click', () => openModal());
  closeAuthBtn?.addEventListener('click', closeModal);

  logoutBtn?.addEventListener('click', async () => {
    try {
      await api.authLogout();
    } finally {
      state.user = null;
      renderAuth();
      onAuthChanged?.(state.user);
    }
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setText('authStatus', 'Logging in...');
    try {
      await login({
        email: form.email.value.trim(),
        password: form.password.value
      });
      form.reset();
    } catch (error) {
      setText('authStatus', error.message || 'Login failed');
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setText('authStatus', 'Creating your account...');
    try {
      await register({
        fullName: form.fullName.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value
      });
      form.reset();
    } catch (error) {
      setText('authStatus', error.message || 'Signup failed');
    }
  });

  return {
    openAuthModal: openModal,
    closeAuthModal: closeModal,
    renderAuth,
    refreshUser
  };
}
