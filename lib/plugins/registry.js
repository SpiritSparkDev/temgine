/**
 * lib/plugins/registry.js — Server-Registry des Plugin-Systems (nur serverseitig).
 *
 * Ein Plugin = gültiges Manifest (lib/plugins/manifest.js) + Server-Hooks aus
 * plugins/index.server.js. Aktiv ist ein Plugin, wenn das Setting plugin_<id>_enabled
 * "true" ist (Standard: aus). Tests injizieren Manifest-Ordner und Hooks per _setPluginSource().
 */
import { prisma } from '../prisma';
import serverPlugins from '../../plugins/index.server';
import { loadManifests, enabledKey } from './manifest';

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
    if (def.type !== 'secret' && settings[key] !== undefined) out[key] = settings[key];
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
  return getPlugins().flatMap((p) => Object.keys(p.settings).filter((k) => p.settings[k].type === 'secret'));
}

// Schreibbare Keys aller bekannten Plugins (Allow-List von PUT /api/settings).
export function pluginSettingKeys() {
  return getPlugins().flatMap((p) => [enabledKey(p.id), ...Object.keys(p.settings)]);
}
