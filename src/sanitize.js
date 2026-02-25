function sanitizeText(input, maxLength) {
  const source = String(input ?? '');
  const withoutScripts = source.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<\/?[^>]+>/g, ' ');
  const withoutControls = withoutTags.replace(/[\u0000-\u001F\u007F]/g, ' ');
  const compact = withoutControls.replace(/\s+/g, ' ').trim();
  if (!maxLength) return compact;
  return compact.slice(0, maxLength);
}

module.exports = { sanitizeText };
