let audioContext = null;

function getAudioContext() {
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioContext = new Ctx();
  }
  return audioContext;
}

export function unlockNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => null);
  }
}

export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') return;

  const startAt = ctx.currentTime;
  const createTone = (frequency, delay, duration, gainValue) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt + delay);
    gain.gain.setValueAtTime(0.0001, startAt + delay);
    gain.gain.exponentialRampToValueAtTime(gainValue, startAt + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + delay + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt + delay);
    oscillator.stop(startAt + delay + duration + 0.02);
  };

  createTone(880, 0, 0.14, 0.045);
  createTone(1180, 0.15, 0.16, 0.04);
}
