/**
 * lib/picgineRuntime.js
 *
 * Client-side handling for Picgine galleries rendered via {{#picgine:name}} sections
 * (see help/picgine-galerien.md). Template authors write plain markup:
 *   form[data-picgine-unlock="<slug>"]  — fields "password" (+ "email" for viewer login)
 *   [data-picgine-error]               — inside the form, receives the error text
 *   [data-picgine-logout]              — click logs the viewer out
 *   form[data-picgine-reset]           — field "email"; neutral notice in [data-picgine-message]
 * After a successful unlock/logout the page re-renders via `rerender()` (no page reload);
 * once the new HTML is hydrated, `picgine:rendered` is dispatched on document.
 */

let rerenderPending = false;

const RESET_MESSAGE = 'Falls ein Konto existiert, wurde eine E-Mail verschickt.';
// wie isValidSlug in lib/picgine.js (serverseitig, dort mit Prisma — hier nicht importierbar)
const SLUG_RE = /^[A-Za-z0-9_-]+$/;

// ?picgine=<slug> der aktuellen URL (Unterordner-Navigation), null wenn fehlend/ungültig.
export function readPicgineParam(search = typeof window !== 'undefined' ? window.location.search : '') {
  const slug = new URLSearchParams(search).get('picgine');
  return slug && SLUG_RE.test(slug) ? slug : null;
}

async function fetchGallery(slug, within) {
  const query = within ? `?within=${encodeURIComponent(within)}` : '';
  const res = await fetch(`/api/picgine/galleries/${encodeURIComponent(slug)}${query}`, { cache: 'no-store' });
  if (res.ok) return res.json();
  // 404 bei within: Unterordner liegt nicht in dieser Galerie — kein Fehler
  if (!(within && res.status === 404)) console.warn(`Picgine-Galerie "${slug}" konnte nicht geladen werden (HTTP ${res.status})`);
  return null;
}

// Lädt die Galerie-Daten (Wurzel-Slug → Daten) über den Temgine-Proxy. Mit `subSlug`
// (?picgine=) wird für jede Galerie, die ihn enthält, stattdessen der Unterordner geladen
// (Prüfung über ?within=). Ein Fehler lässt nur die betroffene Section leer.
export async function loadPicgineContents(slugs, subSlug = null) {
  const out = {};
  await Promise.all((slugs || []).map(async (slug) => {
    try {
      const data = (subSlug && subSlug !== slug && await fetchGallery(subSlug, slug)) || await fetchGallery(slug);
      if (data) out[slug] = data;
    } catch (e) {
      console.warn(`Picgine-Galerie "${slug}" konnte nicht geladen werden:`, e.message);
    }
  }));
  return out;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
}

export function hydratePicgine(container, rerender) {
  if (rerenderPending) {
    rerenderPending = false;
    document.dispatchEvent(new CustomEvent('picgine:rendered'));
  }
  if (!container) return;

  const refresh = () => {
    rerenderPending = true;
    rerender();
  };

  container.querySelectorAll('form[data-picgine-unlock]').forEach((form) => {
    if (form.dataset.picgineBound) return;
    form.dataset.picgineBound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = form.querySelector('[data-picgine-error]');
      if (errorEl) errorEl.textContent = '';
      const body = { slug: form.getAttribute('data-picgine-unlock'), password: form.elements.password?.value || '' };
      if (form.elements.email) body.email = form.elements.email.value;
      let error;
      try {
        error = await post('/api/picgine/unlock', body);
      } catch (_e) {
        error = 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
      }
      if (!error) return refresh();
      if (errorEl) errorEl.textContent = error;
    });
  });

  container.querySelectorAll('form[data-picgine-reset]').forEach((form) => {
    if (form.dataset.picgineBound) return;
    form.dataset.picgineBound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = form.querySelector('[data-picgine-error]');
      const messageEl = form.querySelector('[data-picgine-message]');
      if (errorEl) errorEl.textContent = '';
      if (messageEl) messageEl.textContent = '';
      let error;
      try {
        error = await post('/api/picgine/reset-request', { email: form.elements.email?.value || '' });
      } catch (_e) {
        error = 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
      }
      if (error) {
        if (errorEl) errorEl.textContent = error;
      } else if (messageEl) {
        messageEl.textContent = RESET_MESSAGE;
      }
    });
  });

  container.querySelectorAll('[data-picgine-logout]').forEach((el) => {
    if (el.dataset.picgineBound) return;
    el.dataset.picgineBound = '1';
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await post('/api/picgine/logout');
      } catch (_e) { /* Cookie bleibt — Rerender zeigt den aktuellen Stand */ }
      refresh();
    });
  });
}
