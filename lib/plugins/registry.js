/**
 * lib/plugins/registry.js — Server-Registry des Plugin-Systems (nur serverseitig).
 *
 * Ein Plugin = gültiges Manifest (lib/plugins/manifest.js) + Server-Hooks aus
 * plugins/index.server.js. Aktiv ist ein Plugin, wenn das Setting plugin_<id>_enabled
 * "true" ist (Standard: aus). Tests injizieren Manifest-Ordner und Hooks per _setPluginSource().
 */
import { prisma } from '../prisma';
import serverPlugins from '../../plugins/index.server';
import { loadManifests, enabledKey, isSecretSetting } from './manifest';
import * as pluginCrypto from '../pluginCrypto';

let source = { dir: undefined, server: serverPlugins };
let cache = null;

export function _setPluginSource({ dir, server = {} } = {}) {
  source = { dir, server };
  cache = null;
}

export function getPlugins() {
  if (!cache) cache = loadManifests(source.dir).map((m) => ({ ...m, server: source.server[m.id] || {} }));
  return cache;
}

export function getPlugin(id) {
  return getPlugins().find((p) => p.id === id) || null;
}

async function readSettings(keys) {
  if (!keys.length) return {};
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getActivePlugins() {
  const plugins = getPlugins();
  if (!plugins.length) return [];
  const map = await readSettings(plugins.map((p) => enabledKey(p.id)));
  return plugins.filter((p) => map[enabledKey(p.id)] === 'true');
}

export async function getActivePlugin(id) {
  const plugin = getPlugin(id);
  if (!plugin) return null;
  const map = await readSettings([enabledKey(id)]);
  return map[enabledKey(id)] === 'true' ? plugin : null;
}

// Alle Settings des Plugins inklusive Secrets — nur serverseitig verwenden (ctx.settings).
export function getPluginSettings(plugin) {
  return readSettings(Object.keys(plugin.settings));
}

// Nur Nicht-Secrets — das, was der Browser sehen darf.
export function publicSettings(plugin, settings) {
  const out = {};
  for (const [key, def] of Object.entries(plugin.settings)) {
    if (!isSecretSetting(def) && settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

// { <id>: publicSettings } aller aktiven Plugins — für clientInit/hydrate im Browser.
export async function getActivePublicSettings() {
  const active = await getActivePlugins();
  const all = await readSettings(active.flatMap((p) => Object.keys(p.settings)));
  return Object.fromEntries(active.map((p) => [p.id, publicSettings(p, all)]));
}

// Secret-Keys aller bekannten Plugins (für die Maskierung in GET /api/settings).
export function pluginSecretKeys() {
  return getPlugins().flatMap((p) => Object.keys(p.settings).filter((k) => isSecretSetting(p.settings[k])));
}

// Keys vom Typ "json" (PUT /api/settings prüft, dass der Wert gültiges JSON ist).
export function pluginJsonKeys() {
  return getPlugins().flatMap((p) => Object.keys(p.settings).filter((k) => p.settings[k].type === 'json'));
}

// Schreibbare Keys aller bekannten Plugins (Allow-List von PUT /api/settings).
export function pluginSettingKeys() {
  return getPlugins().flatMap((p) => [enabledKey(p.id), ...Object.keys(p.settings)]);
}

export function makePluginLog(id) {
  const tag = `[plugin:${id}]`;
  return { info: (...a) => console.log(tag, ...a), warn: (...a) => console.warn(tag, ...a), error: (...a) => console.error(tag, ...a) };
}

// Kontext für Hooks außerhalb von Routen (Kontaktformular-Hooks, Jobs): settings (inkl. Secrets),
// prisma, crypto ({ encrypt, decrypt }), log. Nur serverseitig. `extra` wird ergänzt (z. B. clientIp).
export async function makePluginCtx(plugin, extra = {}) {
  return { settings: await getPluginSettings(plugin), prisma, crypto: pluginCrypto, log: makePluginLog(plugin.id), ...extra };
}

const HOOK_TIMEOUT_MS = 10000;
const withTimeout = (promise) => {
  let timer;
  return Promise.race([promise, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timeout')), HOOK_TIMEOUT_MS); })]).finally(() => clearTimeout(timer));
};

/**
 * Kontaktformular-Hooks aktiver Plugins (pages/api/contact.js).
 *   runContactHooks('before', input) → { ok: true } | { ok: false, status, errors, error?, retryAfter? }
 *     Erste Ablehnung gewinnt. Wirft ein Hook, gilt er als "ok" (Fehler wird geloggt; die Absendung
 *     scheitert nie an einem Plugin-Fehler).
 *   runContactHooks('after', submission) → undefined; Fehler/Timeouts (10 s) werden nur geloggt.
 */
export async function runContactHooks(phase, payload, clientIp) {
  const name = phase === 'before' ? 'beforeContactSubmission' : 'onContactSubmission';
  let plugins = [];
  try {
    plugins = (await getActivePlugins()).filter((p) => typeof p.server.hooks?.[name] === 'function');
  } catch (e) {
    console.error('[plugins] Aktive Plugins nicht lesbar:', e.message);
  }
  for (const plugin of plugins) {
    try {
      const ctx = await makePluginCtx(plugin, { clientIp });
      const result = await withTimeout(Promise.resolve(plugin.server.hooks[name](ctx, payload)));
      if (phase === 'before' && result && result.ok === false) {
        return { ok: false, status: Number(result.status) || 400, errors: result.errors || {}, error: result.error, retryAfter: result.retryAfter };
      }
    } catch (e) {
      console.error(`[plugin:${plugin.id}] ${name} fehlgeschlagen:`, e?.message);
    }
  }
  return phase === 'before' ? { ok: true } : undefined;
}
