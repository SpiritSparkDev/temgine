import { toKind } from '../common';

// WP-B7: nur lesend. Was Temgine an Variablen kennt, die ein Template nicht selbst deklariert:
// Seitenfelder (page.data.*, aus Vorlagen der Art PAGE_FIELDS), globale Variablen (global.*), Widgets (widget.*)
// und welche Navigations-Platzhalter (nav:*) definiert sind. Kern-Schnittstelle (server.js): core.context
// { globals(), widgets(), navigations() }; Seitenfeld-Vorlagen kommen aus core.store, Typen aus core.extractTypedVariables.
export const features = ['context'];

// Beispielwert je Feldtyp (Seitenfelder haben keinen eigenen Wert, der steht je Seite in Temgine)
export const FIELD_SAMPLES = { text: 'Beispieltext', textarea: 'Beispieltext über mehrere Zeilen', number: 42, url: 'https://example.com', image: '/uploads/beispiel.jpg', date: '2026-01-01', select: '', color: '#336699', array: [], checkbox: true };
const MAX_SAMPLE = 200;
const NAV_ORDER = ['main', 'page', 'mobile', 'auto'];

const clip = (v) => (typeof v === 'string' && v.length > MAX_SAMPLE ? `${v.slice(0, MAX_SAMPLE)}…` : v);

export function pageFields(core) {
  const typed = core.extractTypedVariables || ((code) => core.extractTemplateVariables(code).map((v) => ({ varName: typeof v === 'string' ? v : v.name, explicitType: null, group: null })));
  const byField = new Map();
  for (const t of core.store.listTemplates().filter((x) => toKind(x) === 'page-fields').sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
    for (const f of typed(t.code)) {
      const have = byField.get(f.varName);
      if (have) { have.templates.push(t.name); continue; }
      const type = f.explicitType || 'text';
      byField.set(f.varName, {
        name: `page.data.${f.varName}`, field: f.varName, type, group: f.group || null,
        ...(Array.isArray(f.options) && f.options.length ? { options: f.options } : {}),
        sample: type === 'select' && f.options?.length ? f.options[0].value : FIELD_SAMPLES[type] ?? '',
        templates: [t.name],
      });
    }
  }
  return [...byField.values()];
}

export const routes = ({ core, authed }) => ({
  'GET v1/context': authed('view', async (req, res, ctx) => {
    let out;
    try {
      const [globals, widgets, navs] = await Promise.all([core.context.globals(), core.context.widgets(), core.context.navigations()]);
      const list = (role) => navs.filter((n) => n.role === role);
      const defined = {
        main: list('MAIN').some((n) => n.isActive), // genau eine aktive Hauptnavigation wird eingebunden
        page: list('PAGE').length > 0,
        mobile: list('MOBILE').some((n) => n.isActive),
        auto: true, // entsteht beim Rendern aus dem Seitenbaum
      };
      out = {
        pageFields: pageFields(core),
        globals: globals.map((g) => ({ name: `global.${g.key}`, key: g.key, label: g.label || g.key, type: String(g.type || 'STRING').toLowerCase(), sample: clip(g.value) })),
        widgets: widgets.map((w) => ({ name: `widget.${w.slug}`, slug: w.slug, label: w.name })),
        navigations: NAV_ORDER.map((n) => ({ key: `nav:${n}`, defined: defined[n], count: n === 'auto' ? null : list(n.toUpperCase()).length })),
        namedNavigations: navs.filter((n) => n.key).map((n) => ({ key: n.key, name: n.name, role: n.role })),
      };
    } catch (e) { return ctx.fail(500, 'Kontext nicht lesbar', 'CONTEXT_FAILED'); }
    return res.status(200).json(out);
  }),
});
