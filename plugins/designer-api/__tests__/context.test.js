import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';
import { toKind, fromKind } from '../lib/common';

// WP-B7: GET /context (Seitenfelder, globale Variablen, Widgets, Navigationen) und die Art page-fields.
function setup({ templates = [], globals = [], widgets = [], navs = [], role = 'ADMIN' } = {}) {
  const saved = [];
  const store = new Map(templates.map((t) => [t.name, t]));
  // wie Temgines extractTypedVariables, stark vereinfacht: {{name:typ(optionen)|Gruppe}}
  const typed = (code) => [...String(code).matchAll(/\{\{([^{}#^/!>]+)\}\}/g)].map((m) => {
    const [head, group] = m[1].split('|');
    const sel = /^([^:]+):select\((.*)\)$/.exec(head);
    if (sel) return { varName: sel[1], explicitType: 'select', group: group || null, options: sel[2].split(',').map((s) => ({ value: s.trim(), label: s.trim() })) };
    const [varName, explicitType] = head.split(':');
    return { varName, explicitType: explicitType || null, group: group || null };
  });
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async () => true },
    store: {
      listTemplates: () => [...store.values()],
      getTemplateByName: (n) => store.get(n) || null,
      saveTemplate: (t, prev) => { saved.push(t); if (prev) store.delete(prev); store.set(t.name, t); return t; },
      deleteTemplateByName: (n) => store.delete(n),
    },
    validatePreviewSubset: () => ({ ok: true, invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: (c) => typed(c).map((v) => v.varName),
    extractTypedVariables: typed,
    renderTemplate: (c) => c,
    sectionProviders: () => ({}),
    externCss: { list: () => [], normalize: (n) => n, write() {}, remove() {} },
    siteCss: { list: () => [] }, siteFonts: { list: () => [] }, listUploads: () => [],
    context: { globals: async () => globals, widgets: async () => widgets, navigations: async () => navs },
    audit: async () => {},
  };
  const routes = createRoutes(core);
  const call = async (key, { body, query = {}, auth = true } = {}) => {
    const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
    const token = signToken({ sub: 'u1', name: 'A', role }, 'geheim', undefined, 1_000_000).token;
    const req = { body, method: key.split(' ')[0], headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), 'x-designer-api': '1,2' } };
    await routes[key].handler(req, res, { params: key.includes(':name') ? { name: body?.name || 'X' } : {}, query, log: { error() {} } });
    return res;
  };
  return { routes, call, saved, store };
}

const PF = { name: 'Autor-Felder', type: 'PAGE_FIELDS', blogRole: null, masterTemplateName: null, category: null, code: '{{autor:text|Inhalt}}\n{{aufmacher:image}}\n{{farbe:select(rot, blau)}}\n{{notiz}}' };

test('GET /context: Seitenfelder aus PAGE_FIELDS-Vorlagen mit Typ, Gruppe, Optionen und Beispielwert', async () => {
  const { call } = setup({ templates: [PF, { name: 'Block', type: 'BLOCK', code: '{{nicht-dabei}}' }] });
  const r = await call('GET v1/context');
  expect(r.code).toBe(200);
  expect(r.body.pageFields.map((f) => f.name)).toEqual(['page.data.autor', 'page.data.aufmacher', 'page.data.farbe', 'page.data.notiz']);
  expect(r.body.pageFields[0]).toMatchObject({ field: 'autor', type: 'text', group: 'Inhalt', sample: 'Beispieltext', templates: ['Autor-Felder'] });
  expect(r.body.pageFields[1]).toMatchObject({ type: 'image', sample: '/uploads/beispiel.jpg' });
  expect(r.body.pageFields[2]).toMatchObject({ type: 'select', sample: 'rot' });
  expect(r.body.pageFields[3].type).toBe('text'); // ohne Typ: wie Temgine (text)
});

test('GET /context: dasselbe Feld in zwei Vorlagen erscheint einmal, mit beiden Vorlagennamen', async () => {
  const { call } = setup({ templates: [PF, { ...PF, name: 'Zweite', code: '{{autor:text}}' }] });
  const r = await call('GET v1/context');
  expect(r.body.pageFields.filter((f) => f.field === 'autor')).toHaveLength(1);
  expect(r.body.pageFields.find((f) => f.field === 'autor').templates).toEqual(['Autor-Felder', 'Zweite']);
});

test('GET /context: globale Variablen, Widgets und Navigationen', async () => {
  const { call } = setup({
    globals: [{ key: 'firma', label: 'Firma', type: 'STRING', value: 'Muster GmbH' }, { key: 'jahr', label: 'Jahr', type: 'NUMBER', value: 2026 }, { key: 'lang', label: 'Lang', type: 'STRING', value: 'x'.repeat(500) }],
    widgets: [{ name: 'Seitenleiste', slug: 'seitenleiste' }],
    navs: [{ name: 'Haupt', role: 'MAIN', isActive: true, key: 'nav:haupt' }, { name: 'Alt', role: 'MAIN', isActive: false, key: 'nav:alt' }, { name: 'Unterseiten', role: 'PAGE', isActive: true, key: 'nav:unterseiten' }],
  });
  const r = await call('GET v1/context');
  expect(r.body.globals[0]).toEqual({ name: 'global.firma', key: 'firma', label: 'Firma', type: 'string', sample: 'Muster GmbH' });
  expect(r.body.globals[1]).toMatchObject({ name: 'global.jahr', type: 'number', sample: 2026 });
  expect(r.body.globals[2].sample.length).toBe(201); // gekürzt auf 200 Zeichen plus …
  expect(r.body.widgets).toEqual([{ name: 'widget.seitenleiste', slug: 'seitenleiste', label: 'Seitenleiste' }]);
  expect(r.body.navigations).toEqual([
    { key: 'nav:main', defined: true, count: 2 }, { key: 'nav:page', defined: true, count: 1 },
    { key: 'nav:mobile', defined: false, count: 0 }, { key: 'nav:auto', defined: true, count: null },
  ]);
  expect(r.body.namedNavigations.map((n) => n.key)).toEqual(['nav:haupt', 'nav:alt', 'nav:unterseiten']);
});

test('GET /context: nur aktive Hauptnavigation zählt als definiert; ohne Navigationen sind main/page/mobile nicht definiert', async () => {
  let r = await setup({ navs: [{ name: 'Alt', role: 'MAIN', isActive: false, key: 'nav:alt' }] }).call('GET v1/context');
  expect(r.body.navigations.map((n) => n.defined)).toEqual([false, false, false, true]);
  r = await setup().call('GET v1/context');
  expect(r.body.navigations.map((n) => n.defined)).toEqual([false, false, false, true]);
  expect(r.body.pageFields).toEqual([]);
});

test('GET /context: Rolle ohne Ansichtsrecht 403, ohne Token 401, Kernfehler 500, Schreibmethoden gibt es nicht', async () => {
  expect((await setup({ role: 'EDITOR' }).call('GET v1/context')).code).toBe(403);
  expect((await setup().call('GET v1/context', { auth: false })).code).toBe(401);
  const s = setup();
  s.routes['GET v1/context'] && expect(Object.keys(s.routes).filter((k) => /v1\/context/.test(k))).toEqual(['GET v1/context']);
  const bad = setup({ navs: null });
  const r = await bad.call('GET v1/context');
  expect(r.code).toBe(500);
  expect(r.body.code).toBe('CONTEXT_FAILED');
});

test('GET /capabilities nennt das Feature "context" und die Art "page-fields"', async () => {
  const r = await setup().call('GET v1/capabilities');
  expect(r.body.features).toContain('context');
  expect(r.body.templateKinds).toContain('page-fields');
});

test('Art page-fields <-> Temgine-Typ PAGE_FIELDS', () => {
  expect(fromKind('page-fields')).toEqual({ type: 'PAGE_FIELDS', blogRole: null, masterTemplateName: null, category: null });
  expect(toKind({ type: 'PAGE_FIELDS' })).toBe('page-fields');
  expect(toKind({ type: 'BLOCK' })).toBe('block');
  expect(toKind({ type: 'SITE' })).toBe('site');
});

test('PUT /templates/:name mit kind page-fields speichert als PAGE_FIELDS, GET meldet kind page-fields', async () => {
  const { call, saved } = setup();
  const code = '{{autor:text}}\n';
  const put = await call('PUT v1/templates/:name', { body: { name: 'Autor', code, kind: 'page-fields' } });
  expect(put.code).toBe(200);
  expect(saved[0]).toMatchObject({ name: 'Autor', type: 'PAGE_FIELDS', code, blogRole: null, category: null });
  const list = await call('GET v1/templates');
  expect(list.body.find((t) => t.name === 'Autor').kind).toBe('page-fields');
});
