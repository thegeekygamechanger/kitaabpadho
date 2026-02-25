import { api } from './api.js';
import { el, escapeHtml, setText } from './ui.js';

export function initProfile({ state, openAuthModal, onUserUpdated }) {
  const panel = el('profilePanel');
  const navLink = el('profileNavLink');
  const profileForm = el('profileForm');
  const passwordForm = el('profilePasswordForm');
  const totpSetupBtn = el('totpSetupBtn');
  const totpEnableForm = el('totpEnableForm');
  const totpDisableBtn = el('totpDisableBtn');

  function isAuthed() {
    return Boolean(state.user?.id);
  }

  function render() {
    const visible = isAuthed();
    if (panel) panel.classList.toggle('hidden', !visible);
    if (navLink) navLink.hidden = !visible;
    if (!visible) {
      setText('profileSummary', 'Login to manage profile.');
      setText('totpSecretView', '');
      return;
    }

    if (profileForm?.fullName) profileForm.fullName.value = state.user.fullName || '';
    setText(
      'profileSummary',
      `${escapeHtml(state.user.fullName || '')} | ${escapeHtml(state.user.email || '')} | role: ${escapeHtml(
        state.user.role || 'student'
      )} | TOTP: ${state.user.totpEnabled ? 'enabled' : 'disabled'}`
    );
  }

  async function refreshUser() {
    const result = await api.authMe();
    state.user = result.authenticated ? result.user : null;
    onUserUpdated?.(state.user);
    render();
  }

  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    const form = event.currentTarget;
    setText('profileStatus', 'Saving profile...');
    try {
      const result = await api.updateProfile({ fullName: form.fullName.value.trim() });
      state.user = result.user;
      onUserUpdated?.(state.user);
      render();
      setText('profileStatus', 'Profile updated.');
    } catch (error) {
      setText('profileStatus', error.message || 'Unable to update profile');
    }
  });

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    const form = event.currentTarget;
    setText('profilePasswordStatus', 'Updating password...');
    try {
      await api.changePassword({
        currentPassword: form.currentPassword.value || undefined,
        totpCode: form.totpCode.value || undefined,
        newPassword: form.newPassword.value
      });
      setText('profilePasswordStatus', 'Password changed successfully.');
      form.reset();
    } catch (error) {
      setText('profilePasswordStatus', error.message || 'Unable to change password');
    }
  });

  totpSetupBtn?.addEventListener('click', async () => {
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    setText('totpStatus', 'Generating secret...');
    try {
      const data = await api.setupTotp();
      setText(
        'totpSecretView',
        `Secret: ${data.secret}\nAccount: ${data.accountName}\nIssuer: ${data.issuer}\nOTPAuth URL: ${data.otpauthUrl}`
      );
      setText('totpStatus', 'Secret generated. Add it to your authenticator and verify below.');
    } catch (error) {
      setText('totpStatus', error.message || 'Unable to setup TOTP');
    }
  });

  totpEnableForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    const form = event.currentTarget;
    setText('totpStatus', 'Enabling TOTP...');
    try {
      const result = await api.enableTotp(form.code.value.trim());
      state.user = result.user || state.user;
      onUserUpdated?.(state.user);
      render();
      form.reset();
      setText('totpStatus', 'TOTP enabled.');
    } catch (error) {
      setText('totpStatus', error.message || 'Unable to enable TOTP');
    }
  });

  totpDisableBtn?.addEventListener('click', async () => {
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }

    const currentPassword = window.prompt('Enter current password (leave blank to use TOTP code):') || '';
    let totpCode = '';
    if (!currentPassword) {
      totpCode = window.prompt('Enter 6-digit TOTP code:') || '';
    }

    setText('totpStatus', 'Disabling TOTP...');
    try {
      const result = await api.disableTotp({
        currentPassword: currentPassword || undefined,
        totpCode: totpCode || undefined
      });
      state.user = result.user || state.user;
      onUserUpdated?.(state.user);
      render();
      setText('totpStatus', 'TOTP disabled.');
    } catch (error) {
      setText('totpStatus', error.message || 'Unable to disable TOTP');
    }
  });

  render();

  return {
    onAuthChanged() {
      render();
    },
    refreshUser
  };
}
