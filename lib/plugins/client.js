/**
 * lib/plugins/client.js — Client-Seite des Plugin-Systems (läuft im Browser).
 *
 * Welche Plugins aktiv sind und ihre öffentlichen Settings (ohne Secrets) liefert
 * GET /api/plugins — einmal pro Seitenaufruf. Ohne registrierte Client-Plugins
 * (plugins/index.client.js) gibt es keinen Request. Tests injizieren per _setClientPlugins().
 */
import clientPlugins from '../../plugins/index.client';
import { getConsent, isAllowed } from '../cookieConsentRuntime';

let hooks = clientPlugins;
let active = null;
const initialized = new Set();

export function _setClientPlugins(map) {
  hooks = map;
  active = null;
  initialized.clear();
}

export function getClientPlugins() {
  return hooks;
}

// [{ id, hooks, settings }] der aktiven Plugins, die Client-Hooks haben.
export function getActiveClientPlugins() {
  if (!Object.keys(hooks).length) return Promise.resolve([]);
  if (!active) {
    active = fetch('/api/plugins')
      .then((r) => (r.ok ? r.json() : {}))
      .then(({ plugins = {} }) => Object.keys(plugins).filter((id) => hooks[id]).map((id) => ({ id, hooks: hooks[id], settings: plugins[id] })))
      .catch(() => []);
  }
  return active;
}

// clientInit.run(publicSettings) jedes aktiven Plugins, höchstens einmal pro Seitenaufruf;
// mit consent-Kategorie erst nach Zustimmung (erneuter Aufruf bei temgine:consent-changed).
export async function runClientInit() {
  const list = await getActiveClientPlugins();
  const consent = getConsent();
  for (const p of list) {
    const init = p.hooks.clientInit;
    if (!init || initialized.has(p.id)) continue;
    if (init.consent && !isAllowed(init.consent, consent)) continue;
    initialized.add(p.id);
    try {
      init.run(p.settings);
    } catch (e) {
      console.error(`[plugin:${p.id}] clientInit fehlgeschlagen:`, e);
    }
  }
}

// hydrate(container, { rerender }) jedes aktiven Plugins, danach das Event temgine:rendered.
export async function hydratePlugins(container, rerender) {
  const list = await getActiveClientPlugins();
  if (container) {
    for (const p of list) {
      if (typeof p.hooks.hydrate !== 'function') continue;
      try {
        p.hooks.hydrate(container, { rerender });
      } catch (e) {
        console.error(`[plugin:${p.id}] hydrate fehlgeschlagen:`, e);
      }
    }
  }
  document.dispatchEvent(new CustomEvent('temgine:rendered'));
}
