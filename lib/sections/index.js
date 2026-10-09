/**
 * lib/sections/index.js — Section-Provider-Registry (Plugin-System P2, Spezifikation §4).
 *
 * Ein Provider bedient Template-Sections {{#<prefix>:<feld>}}…{{/<prefix>:<feld>}} bzw.
 * {{#<prefix>:<feld>=<festerWert>}}…{{/<prefix>:<feld>}} (und die Kurzform {{#<prefix>}}, Feld = Präfix).
 * Client-Hook-Form (§3.3):
 *   loadClient(keys, ctx)        → { <wert>: daten }  (im Browser; ctx = { basePath, query })
 *   toContext(data, ctx)         → Mustache-Kontext der Section (ctx = { fieldName, value, basePath, query })
 *   EditorField                  → React-Komponente ({ value, onChange, fieldName, fieldLabel, editor })
 *   editorFieldLabel             → Zusatz am Feld-Label im Seiteneditor, z. B. "Picgine-Galerie"
 *   editorType                   → Feldtyp in der Template-Vorschau (TemplatePickerModal)
 *   requiresDynamic({ html, query }) → true = Seite nicht aus dem statischen Snapshot ausliefern
 * Server-Laden (loadServer) steht in lib/sections/server.js.
 *
 * Kern-Provider: folder, picgine (P3 verschiebt picgine nach plugins/picgine/). Plugin-Provider
 * kommen aus plugins/index.client.js (hooks.sections). Läuft im Browser und auf dem Server.
 */
import { getClientPlugins, getActiveClientPlugins } from '../plugins/client';
import folder from './folder';
import picgine from './picgine';

const CORE = { folder, picgine };
// Kern-Syntax (siehe templateParser/templateEngine) — kein Plugin darf diese Präfixe belegen.
const RESERVED = ['each', 'if', 'nav'];
export const SECTION_TIMEOUT_MS = 5000;

let cache = { hooks: null, providers: null };

// { <prefix>: provider } — Kern zuerst, dann Plugins in Registry-Reihenfolge.
// Nur Kern-Provider dürfen `trusted` sein (Daten laufen dann durch die normale
// Markdown-/HTML-Verarbeitung wie Block-Props, siehe renderPage).
export function getSectionProviders() {
  const hooks = getClientPlugins();
  if (cache.hooks === hooks) return cache.providers;
  const providers = { ...CORE };
  for (const [id, plugin] of Object.entries(hooks || {})) {
    for (const [prefix, provider] of Object.entries(plugin?.sections || {})) {
      if (!/^[a-z][a-z0-9-]*$/.test(prefix) || RESERVED.includes(prefix) || providers[prefix]) {
        console.error(`[plugins] ${id}: Section-Präfix "${prefix}" ist reserviert oder belegt — ausgelassen`);
        continue;
      }
      providers[prefix] = { ...provider, trusted: false, pluginId: id };
    }
  }
  cache = { hooks, providers };
  return providers;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ganze Section: Gruppen 1 = Präfix, 2 = Feld, 3 = fester Wert (named) bzw. 4 = Präfix (Kurzform).
// Das schließende Tag darf "=wert" wiederholen, muss aber nicht.
export function sectionRegex(prefixes = Object.keys(getSectionProviders())) {
  if (!prefixes.length) return /(?!)/g;
  const p = prefixes.map(escapeRe).join('|');
  return new RegExp(
    `\\{\\{#(${p}):([^{}=]+?)(?:=([^{}]*))?\\}\\}[\\s\\S]*?\\{\\{\\/\\1:\\2(?:=[^{}]*)?\\}\\}`
    + `|\\{\\{#(${p})\\}\\}[\\s\\S]*?\\{\\{\\/\\4\\}\\}`,
    'g'
  );
}

// Daten aller Provider parallel laden; Fehler oder Timeout → Section leer ({}), Seite rendert trotzdem.
// loaders = { <prefix>: (keys, ctx) => Promise<{ <wert>: daten }> }, keys = { <prefix>: [werte] }.
export async function loadSections(loaders, keys, ctx = {}) {
  const out = {};
  await Promise.all(Object.entries(keys || {}).map(async ([prefix, values]) => {
    const load = loaders[prefix];
    if (typeof load !== 'function' || !values?.length) return;
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout nach ${SECTION_TIMEOUT_MS / 1000} s`)), SECTION_TIMEOUT_MS);
      });
      const data = await Promise.race([Promise.resolve().then(() => load(values, ctx)), timeout]);
      out[prefix] = data && typeof data === 'object' ? data : {};
    } catch (e) {
      console.warn(`[sections] ${prefix}: Daten nicht geladen (${e?.message || e}) — Section bleibt leer`);
      out[prefix] = {};
    } finally {
      clearTimeout(timer);
    }
  }));
  return out;
}

// Browser: loadClient der Kern-Provider und der aktiven Plugins.
export async function loadSectionDataClient(keys, ctx) {
  const active = new Set((await getActiveClientPlugins()).map((p) => p.id));
  const loaders = {};
  for (const [prefix, p] of Object.entries(getSectionProviders())) {
    if (p.loadClient && (!p.pluginId || active.has(p.pluginId))) loaders[prefix] = p.loadClient;
  }
  return loadSections(loaders, keys, ctx);
}

// true, wenn irgendein Provider die Seite dynamisch gerendert haben will (Snapshot-Entscheidung).
export function sectionsRequireDynamic({ html = '', query = {} } = {}) {
  return Object.entries(getSectionProviders()).some(([prefix, p]) => {
    try {
      return typeof p.requiresDynamic === 'function' && !!p.requiresDynamic({ html: String(html || ''), query: query || {} });
    } catch (e) {
      console.warn(`[sections] ${prefix}: requiresDynamic fehlgeschlagen`, e);
      return false;
    }
  });
}
