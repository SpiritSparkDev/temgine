/**
 * lib/sections/server.js — Section-Daten serverseitig laden (loadServer, Spezifikation §3.2/§4),
 * z. B. für den Live-Snapshot. Kern-Provider plus Server-Hooks aktiver Plugins
 * (hooks.sections[<prefix>].loadServer, nur für im Manifest deklarierte Präfixe).
 */
import { loadSections } from './index';
import { listFolderItemsRecursive } from '../uploadFolder';
import { getActivePlugins } from '../plugins/registry';
import picgine from './picgine.server';

const CORE = {
  folder: { loadServer: async (paths) => Object.fromEntries(paths.map((p) => [p, listFolderItemsRecursive(p)])) },
  picgine,
};

export async function loadSectionDataServer(keys, ctx = {}) {
  const loaders = {};
  for (const [prefix, p] of Object.entries(CORE)) loaders[prefix] = p.loadServer;
  for (const plugin of await getActivePlugins()) {
    for (const [prefix, p] of Object.entries(plugin.server?.sections || {})) {
      if (!loaders[prefix] && plugin.sections.includes(prefix) && p?.loadServer) loaders[prefix] = p.loadServer;
    }
  }
  return loadSections(loaders, keys, ctx);
}
