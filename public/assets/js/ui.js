export function el(id) {
  return document.getElementById(id);
}

export function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

export function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatInr(value) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function showModal(id) {
  const node = el(id);
  if (!node) return;
  node.classList.remove('hidden');
  node.setAttribute('aria-hidden', 'false');
}

export function hideModal(id) {
  const node = el(id);
  if (!node) return;
  node.classList.add('hidden');
  node.setAttribute('aria-hidden', 'true');
}

export function renderEmpty(message) {
  return `<article class="state-empty">${escapeHtml(message)}</article>`;
}
