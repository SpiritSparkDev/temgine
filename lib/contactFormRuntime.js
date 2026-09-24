/**
 * lib/contactFormRuntime.js
 *
 * Generic, core (non-disableable) client-side handling for any
 * <form data-temgine-form="contact"> rendered inside a page's block HTML.
 * Block-template authors write plain markup — no per-template <script> needed.
 *
 * Reserved attributes (see development_docs/specs/2026-09-23-generic-contact-forms-design.md):
 *   data-temgine-form="contact"  on the <form>            — activates this runtime (required)
 *   data-temgine-status          on any element in the form — success/error text target (optional)
 *   data-temgine-success         on the <form>              — custom success text (optional)
 *   data-temgine-error           on the <form>              — custom error text prefix (optional)
 *
 * If the form contains an <altcha-widget>, the ALTCHA script is loaded
 * globally on demand (once), since browsers never execute <script> tags
 * inserted via innerHTML/dangerouslySetInnerHTML.
 */

const ALTCHA_SRC = 'https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js';
let altchaLoadStarted = false;

function loadAltchaScriptOnce() {
  if (typeof window === 'undefined' || altchaLoadStarted) return;
  if (window.customElements && window.customElements.get('altcha-widget')) return;
  altchaLoadStarted = true;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = ALTCHA_SRC;
  document.head.appendChild(script);
}

/**
 * Collects a form's fields into a plain JSON-serializable object.
 * Fields sharing a name (e.g. multiple checked checkboxes) become an array,
 * matching the merge behaviour pages/api/contact.js already expects.
 */
export function buildPayloadFromForm(form) {
  const formData = new FormData(form);
  const payload = {};
  formData.forEach((value, key) => {
    const normalized = typeof value === 'string' ? value : String(value || '');
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      if (Array.isArray(payload[key])) payload[key].push(normalized);
      else payload[key] = [payload[key], normalized];
    } else {
      payload[key] = normalized;
    }
  });
  return payload;
}

function setStatus(form, text, kind) {
  const statusEl = form.querySelector('[data-temgine-status]');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.hidden = false;
  statusEl.classList.toggle('form-status-error', kind === 'error');
  statusEl.classList.toggle('form-status-success', kind === 'success');
}

async function handleContactSubmit(event) {
  const form = event.currentTarget;
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // The <altcha-widget> renders its own <input type="hidden" name="altcha">
  // once solved (in light DOM, not shadow DOM) — no widget.value API exists
  // on the vanilla web component, so read the same input FormData will use.
  const hasAltchaWidget = !!form.querySelector('altcha-widget');
  const altchaInput = form.querySelector('input[name="altcha"]');
  if (hasAltchaWidget && !(altchaInput && altchaInput.value)) {
    setStatus(form, 'Bitte den Spam-Schutz abschließen.', 'error');
    return;
  }

  const payload = buildPayloadFromForm(form);

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus(form, 'Nachricht wird gesendet …', null);

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      const successText = form.getAttribute('data-temgine-success') || 'Danke! Deine Nachricht wurde versendet.';
      setStatus(form, successText, 'success');
      form.reset();
    } else {
      const fieldError = data.fields && Object.values(data.fields)[0];
      const message = fieldError || data.error || 'Senden fehlgeschlagen. Bitte später erneut versuchen.';
      const prefix = form.getAttribute('data-temgine-error');
      setStatus(form, prefix ? `${prefix} ${message}` : message, 'error');
    }
  } catch (e) {
    setStatus(form, 'Senden fehlgeschlagen. Bitte prüfe deine Internetverbindung.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

/**
 * Finds every unbound form[data-temgine-form="contact"] inside `container`
 * and wires it up. Safe to call repeatedly (e.g. on every render) — already
 * bound forms are skipped via a data-temgine-bound marker.
 */
export function hydrateContactForms(container) {
  if (!container) return;
  const forms = container.querySelectorAll('form[data-temgine-form="contact"]');
  forms.forEach((form) => {
    if (form.dataset.temgineBound) return;
    form.dataset.temgineBound = '1';
    if (form.querySelector('altcha-widget')) loadAltchaScriptOnce();
    form.addEventListener('submit', handleContactSubmit);
  });
}
