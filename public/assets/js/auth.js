import { api } from './api.js';
import { el, hideModal, setText, showModal } from './ui.js';

export function initAuth({ state, onAuthChanged }) {
  const modalId = 'authModal';
  const openAuthBtn = el('openAuthBtn');
  const closeAuthBtn = el('closeAuthBtn');
  const logoutBtn = el('logoutBtn');
  const authBadge = el('authBadge');
  const communityNavLink = el('communityNavLink');
  const aiNavLink = el('aiNavLink');
  const supportNavLink = el('supportNavLink');
  const authStatus = el('authStatus');
  const loginForm = el('loginForm');
  const registerForm = el('registerForm');
  const signupTotpSetupBtn = el('signupTotpSetupBtn');
  const signupTotpQr = el('signupTotpQr');

  function renderAuth() {
    if (state.user) {
      if (openAuthBtn) openAuthBtn.hidden = true;
      if (logoutBtn) logoutBtn.hidden = false;
      if (communityNavLink) communityNavLink.hidden = false;
      if (aiNavLink) aiNavLink.hidden = false;
      if (supportNavLink) supportNavLink.hidden = false;
      if (authBadge) {
        authBadge.textContent = `Hi ${state.user.fullName}`;
        authBadge.classList.add('is-user');
        authBadge.title = `${state.user.email} | role: ${state.user.role}${state.user.totpEnabled ? ' | 2FA enabled' : ''}`;
      }
    } else {
      if (openAuthBtn) openAuthBtn.hidden = false;
      if (logoutBtn) logoutBtn.hidden = true;
      if (communityNavLink) communityNavLink.hidden = true;
      if (aiNavLink) aiNavLink.hidden = true;
      if (supportNavLink) supportNavLink.hidden = true;
      if (authBadge) {
        authBadge.textContent = 'Guest Mode';
        authBadge.classList.remove('is-user');
        authBadge.title = '';
      }
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
    const password = form.password.value || '';
    const totpCode = form.totpCode.value.trim() || '';
    if (form.password?.setCustomValidity) form.password.setCustomValidity('');
    if (!password && !totpCode) {
      if (form.password?.setCustomValidity) {
        form.password.setCustomValidity('Enter password or TOTP code to login.');
        form.password.reportValidity();
      }
      setText('authStatus', 'Enter password or TOTP code to login.');
      return;
    }
    setText('authStatus', 'Logging in...');
    try {
      const payload = {
        email: form.email.value.trim()
      };
      if (password) payload.password = password;
      if (totpCode) payload.totpCode = totpCode;
      await login(payload);
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
      const phoneNumber = form.phoneNumber.value.trim();
      if (!phoneNumber) {
        setText('authStatus', 'Phone number is required.');
        return;
      }
      const payload = {
        fullName: form.fullName.value.trim(),
        email: form.email.value.trim(),
        phoneNumber,
        password: form.password.value,
        role: form.role?.value || 'student'
      };
      const totpSecret = form.totpSecret.value.trim().toUpperCase();
      const totpCode = form.totpCode.value.trim();
      if (totpSecret || totpCode) {
        payload.totpSecret = totpSecret;
        payload.totpCode = totpCode;
      }
      await register(payload);
      form.reset();
      if (signupTotpQr) {
        signupTotpQr.src = '';
        signupTotpQr.classList.add('hidden');
      }
    } catch (error) {
      setText('authStatus', error.message || 'Signup failed');
    }
  });

  signupTotpSetupBtn?.addEventListener('click', async () => {
    if (!registerForm) return;
    const fullName = registerForm.fullName.value.trim();
    const email = registerForm.email.value.trim();
    if (!fullName || !email) {
      setText('authStatus', 'Enter full name and email first.');
      return;
    }
    setText('authStatus', 'Generating TOTP QR...');
    try {
      const result = await api.signupTotpSetup({ fullName, email });
      if (registerForm.totpSecret) registerForm.totpSecret.value = result.secret || '';
      if (signupTotpQr) {
        signupTotpQr.src = result.qrDataUrl || '';
        signupTotpQr.classList.toggle('hidden', !result.qrDataUrl);
      }
      setText('authStatus', 'Scan QR using authenticator app, then enter TOTP code and submit signup.');
    } catch (error) {
      setText('authStatus', error.message || 'Unable to generate TOTP QR');
    }
  });

  return {
    openAuthModal: openModal,
    closeAuthModal: closeModal,
    renderAuth,
    refreshUser
  };
}
