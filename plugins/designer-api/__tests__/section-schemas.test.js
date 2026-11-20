import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';

// WP-B6: GET /capabilities liefert je Section-Provider Präfix, Anzeigename, Parameter und Kontextfelder.
function setup(providers) {
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async () => true },
    store: { listTemplates: () => [], getTemplateByName: () => null, saveTemplate: () => {}, deleteTemplateByName: () => {} },
    validatePreviewSubset: () => ({ ok: true, invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: () => [], renderTemplate: (c) => c,
    sectionProviders: () => providers,
    externCss: { list: () => [], normalize: (n) => n, write() {}, remove() {} },
    listUploads: () => [], audit: async () => {},
  };
  return createRoutes(core);
}

async function caps(routes, version = '1,2') {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
  const token = signToken({ sub: 'u1', name: 'A', role: 'ADMIN' }, 'geheim', undefined, 1_000_000).token;
  await routes['GET v1/capabilities'].handler({ body: undefined, headers: { authorization: `Bearer ${token}`, 'x-designer-api': version } }, res, { params: {}, query: {}, log: { error() {} } });
  return res;
}

test('capabilities: folder und picgine mit Standard-Schema, Plugin-Schema mit Vorrang, ohne Schema leerer Kontext', async () => {
  const routes = setup({
    folder: {}, picgine: { editorFieldLabel: 'Picgine-Galerie' },
    karten: { editorFieldLabel: 'Karten', schema: { args: 'id', list: true, context: [{ name: 'titel', type: 'text', example: 'A' }] } },
    plain: { editorFieldLabel: 'Plain' },
  });
  const r = await caps(routes);
  expect(r.code).toBe(200);
  const by = Object.fromEntries(r.body.sectionProviders.map((p) => [p.prefix, p]));
  expect(Object.keys(by)).toEqual(['folder', 'picgine', 'karten', 'plain']);
  expect(by.folder).toMatchObject({ label: 'Ordner', args: 'name', list: true });
  expect(by.folder.context.map((f) => f.name)).toEqual(['name', 'slug', 'url', 'path', 'ext', 'size', 'modified', 'isImage']);
  expect(by.folder.context[0]).toEqual({ name: 'name', type: 'text', example: 'bild-01.jpg' });
  expect(by.picgine.label).toBe('Picgine-Galerie');
  expect(by.picgine.context.find((f) => f.name === 'images').children.map((c) => c.name)).toContain('thumb');
  expect(by.karten).toEqual({ prefix: 'karten', label: 'Karten', args: 'id', list: true, context: [{ name: 'titel', type: 'text', example: 'A' }] });
  expect(by.plain).toEqual({ prefix: 'plain', label: 'Plain', args: 'name', list: false, context: [] });
  expect(r.body.features).toContain('section-schema');
});

test('capabilities: auch v1-Clients (ohne Header) bekommen die Provider-Liste mit Präfix', async () => {
  const r = await caps(setup({ folder: {} }), '1');
  expect(r.body.sectionProviders[0]).toMatchObject({ prefix: 'folder', label: 'Ordner' });
});
