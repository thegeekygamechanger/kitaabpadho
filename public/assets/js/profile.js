import { api } from './api.js';
import { el, escapeHtml, setText } from './ui.js';

function toUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function initProfile({ state, openAuthModal, onUserUpdated }) {
  const panel = el('profilePanel');
  const navLink = el('profileNavLink');
  const profileForm = el('profileForm');
  const passwordForm = el('profilePasswordForm');
  const totpSetupBtn = el('totpSetupBtn');
  const totpEnableForm = el('totpEnableForm');
  const totpDisableBtn = el('totpDisableBtn');
  const pushToggle = el('pushToggle');
  const savePushToggleBtn = el('savePushToggleBtn');

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
      setText('pushStatus', '');
      return;
    }

    if (profileForm?.fullName) profileForm.fullName.value = state.user.fullName || '';
    if (profileForm?.email) profileForm.email.value = state.user.email || '';
    if (profileForm?.phoneNumber) profileForm.phoneNumber.value = state.user.phoneNumber || '';
    if (pushToggle) pushToggle.checked = Boolean(state.user.pushEnabled);
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
      const phoneNumber = form.phoneNumber.value.trim();
      if (!phoneNumber) {
        setText('profileStatus', 'Phone number is required.');
        return;
      }
      await api.updateProfile({
        fullName: form.fullName.value.trim(),
        phoneNumber
      });
      const refreshed = await api.authMe();
      state.user = refreshed.authenticated ? refreshed.user : null;
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
      const result = await api.changePassword({
        currentPassword: form.currentPassword.value || undefined,
        totpCode: form.totpCode.value || undefined,
        newPassword: form.newPassword.value
      });
      if (result.reauthRequired) {
        state.user = null;
        onUserUpdated?.(state.user);
        render();
        setText('profilePasswordStatus', 'Password changed. Please login again.');
      } else {
        setText('profilePasswordStatus', 'Password changed successfully.');
      }
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

  savePushToggleBtn?.addEventListener('click', async () => {
    if (!isAuthed()) {
      openAuthModal?.('Please login first.');
      return;
    }
    try {
      const wantsEnabled = Boolean(pushToggle?.checked);
      await api.pushToggle(wantsEnabled);

      if (!wantsEnabled) {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (existing) {
          await api.pushUnsubscribe(existing.endpoint);
          await existing.unsubscribe();
        }
        const me = await api.authMe();
        state.user = me.authenticated ? me.user : state.user;
        onUserUpdated?.(state.user);
        render();
        setText('pushStatus', 'Push notifications disabled.');
        return;
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setText('pushStatus', 'Push is not supported in this browser.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setText('pushStatus', 'Notification permission denied.');
        if (pushToggle) pushToggle.checked = false;
        await api.pushToggle(false);
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) registration = await navigator.serviceWorker.register('/sw.js');

      const keyResult = await api.pushPublicKey();
      const applicationServerKey = toUint8Array(String(keyResult.publicKey || ''));
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      await api.pushSubscribe({
        subscription: subscription.toJSON(),
        city: state.marketplace?.city || '',
        areaCode: state.location?.areaCode || '',
        lat: state.location?.coords?.lat,
        lon: state.location?.coords?.lon
      });

      const me = await api.authMe();
      state.user = me.authenticated ? me.user : state.user;
      onUserUpdated?.(state.user);
      render();
      setText('pushStatus', 'Push notifications enabled. Test notification sent.');
    } catch (error) {
      setText('pushStatus', error.message || 'Unable to update push preference');
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
