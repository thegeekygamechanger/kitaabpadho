function humanize(raw = '') {
  return String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ignoredField(field) {
  if (!(field instanceof HTMLElement)) return true;
  if (
    field.matches(
      '[type="hidden"], [type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"]'
    )
  ) {
    return true;
  }
  return false;
}

function ensureFieldId(field, formId = 'form') {
  if (field.id) return field.id;
  const name = field.getAttribute('name') || field.getAttribute('placeholder') || 'field';
  const generated = `${formId}-${String(name).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}`;
  field.id = generated;
  return generated;
}

function labelText(field) {
  const explicit = field.getAttribute('data-label');
  if (explicit) return explicit.trim();
  const placeholder = field.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();
  const name = field.getAttribute('name');
  if (name) return humanize(name);
  return 'Field';
}

function ensureLabel(field, form) {
  if (ignoredField(field)) return;
  const fieldId = ensureFieldId(field, form.id || 'form');
  if (form.querySelector(`label[for="${fieldId}"]`)) return;
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = fieldId;
  label.textContent = labelText(field);
  field.parentElement?.insertBefore(label, field);
}

function isPasswordInput(field) {
  return field instanceof HTMLInputElement && field.type === 'password';
}

function ensurePasswordToggle(field) {
  if (!isPasswordInput(field)) return;
  if (field.dataset.passwordToggleReady === 'true') return;

  let wrapper = field.closest('.password-wrap');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'password-wrap';
    field.parentElement?.insertBefore(wrapper, field);
    wrapper.appendChild(field);
  }

  let button = wrapper.querySelector('.password-toggle-btn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle-btn';
    button.innerHTML = '<span aria-hidden="true">&#128065;</span>';
    button.setAttribute('aria-label', 'Show password');
    wrapper.appendChild(button);
  }

  button.addEventListener('click', () => {
    const visible = field.type === 'text';
    field.type = visible ? 'password' : 'text';
    button.classList.toggle('is-visible', !visible);
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  });

  field.dataset.passwordToggleReady = 'true';
}

function skipAutoLabeling(form) {
  if (!(form instanceof HTMLElement)) return false;
  return form.matches('[data-no-auto-label], .kb-search');
}

function ensureErrorNode(field) {
  const existing = field.parentElement?.querySelector(`.field-error[data-for="${field.id}"]`);
  if (existing) return existing;
  const node = document.createElement('small');
  node.className = 'field-error';
  node.setAttribute('data-for', field.id);
  field.insertAdjacentElement('afterend', node);
  return node;
}

function clearFieldError(field) {
  if (!(field instanceof HTMLElement)) return;
  field.classList.remove('field-invalid');
  const errorNode = field.parentElement?.querySelector(`.field-error[data-for="${field.id}"]`);
  if (errorNode) errorNode.textContent = '';
}

function showFieldError(field, message) {
  if (!(field instanceof HTMLElement)) return;
  const errorNode = ensureErrorNode(field);
  field.classList.add('field-invalid');
  if (errorNode) errorNode.textContent = message || field.validationMessage || 'Invalid value';
}

function wireValidation(form) {
  form.addEventListener(
    'invalid',
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement) || ignoredField(field)) return;
      showFieldError(field, field.validationMessage || 'Invalid value');
    },
    true
  );

  form.addEventListener(
    'input',
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement) || ignoredField(field)) return;
      if (field.checkValidity()) clearFieldError(field);
    },
    true
  );

  form.addEventListener(
    'change',
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement) || ignoredField(field)) return;
      if (field.checkValidity()) clearFieldError(field);
    },
    true
  );
}

export function initFormEnhancements(root = document) {
  const forms = Array.from(root.querySelectorAll('form'));
  for (const form of forms) {
    if (!skipAutoLabeling(form)) {
      const fields = form.querySelectorAll('input, select, textarea');
      fields.forEach((field) => ensureLabel(field, form));
      fields.forEach((field) => ensurePasswordToggle(field));
    }
    wireValidation(form);
  }

  return {
    clearFieldError,
    showFieldError
  };
}
