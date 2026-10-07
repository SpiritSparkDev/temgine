/**
 * lib/picgineRuntime.js
 *
 * Client-side handling for Picgine galleries rendered via {{#picgine:name}} sections
 * (see help/picgine-galerien.md). Template authors write plain markup:
 *   form[data-picgine-unlock="<slug>"]  — fields "password" (+ "email" for viewer login)
 *   [data-picgine-error]               — inside the form, receives the error text
 *   [data-picgine-logout]              — click logs the viewer out
 * After a successful unlock/logout the page re-renders via `rerender()` (no page reload);
 * once the new HTML is hydrated, `picgine:rendered` is dispatched on document.
 */

let rerenderPending = false;

// Lädt die Galerie-Daten (Slug → Daten) über den Temgine-Proxy. Ein Fehler lässt nur
// die betroffene Section leer, die Seite rendert trotzdem.
export async function loadPicgineContents(slugs) {
  const out = {};
  await Promise.all((slugs || []).map(async (slug) => {
    try {
      const res = await fetch(`/api/picgine/galleries/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      if (res.ok) out[slug] = await res.json();
      else console.warn(`Picgine-Galerie "${slug}" konnte nicht geladen werden (HTTP ${res.status})`);
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
