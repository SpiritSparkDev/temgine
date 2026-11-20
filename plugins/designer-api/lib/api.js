import { createKit } from './common';
import groups from './routes';

// Verteiler der Designer-API (Vertrag: docs/TEMGINE-API.md im Designer-Repo). Die Routen stehen in lib/routes/*.js,
// die Liste in lib/routes/index.js. Alle Kernabhängigkeiten kommen über `core` (server.js verdrahtet sie).
export { toKind } from './common';

export function createRoutes(core) {
  const kit = createKit(core);
  kit.features = [...new Set(groups.flatMap((g) => g.features || []))];
  const all = {};
  for (const g of groups) {
    for (const [key, route] of Object.entries(g.routes(kit))) {
      if (all[key]) throw new Error(`designer-api: Route doppelt definiert: ${key}`);
      all[key] = route;
    }
  }
  return all;
}
