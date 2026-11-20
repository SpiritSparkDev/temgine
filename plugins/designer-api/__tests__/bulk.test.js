import crypto from 'crypto';
import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Fake-Kern mit Dateien im Speicher; failOn(name) lässt das Schreiben dieser Datei scheitern (Template-Name oder CSS-Dateiname)
function fakeCore({ failOn = () => false, failUndo = () => false } = {}) {
  const templates = new Map();
  const css = new Map();
  const orderBox = { raw: null }; // wie Temgines .order.json: wird beim Schreiben ergänzt
  const audits = [];
  const guard = (n, undo) => { if (failOn(n) && !undo) throw new Error(`Platte voll bei ${n}`); if (undo && failUndo(n)) throw new Error('undo kaputt'); };
  let undoing = false;
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async () => true },
    store: {
      listTemplates: () => [...templates.values()],
      getTemplateByName: (n) => [...templates.values()].find((t) => t.name.toLowerCase() === String(n).toLowerCase()) || null,
      saveTemplate: (t, prev) => { guard(t.name, undoing); if (prev) templates.delete(prev); templates.set(t.name, { ...t }); return t; },
      deleteTemplateByName: (n) => { guard(n, undoing); templates.delete(n); },
    },
    validatePreviewSubset: (code, masterCode) => ({ ok: !code.includes('{{fremd}}') || masterCode.includes('{{fremd}}'), invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: () => [],
    renderTemplate: (c) => c,
    sectionProviders: () => ({}),
    externCss: {
      list: () => [...css].map(([filename, content]) => ({ filename, content })),
      normalize: (n) => (n.endsWith('.css') ? n : `${n}.css`),
      write: (f, c) => { guard(f, undoing); css.set(f, c); orderBox.raw = JSON.stringify([...css.keys()]); },
      remove: (f) => { guard(f, undoing); css.delete(f); },
      orderState: () => orderBox.raw,
      restoreOrder: (raw) => { orderBox.raw = raw; },
    },
    listUploads: () => [],
    audit: async (a) => audits.push(a),
  };
  // Rückgängig-Schritte laufen nach dem Fehler: ab dem ersten Fehler gilt `undoing`
  const origSave = core.store.saveTemplate;
  core.store.saveTemplate = (t, p) => { try { return origSave(t, p); } catch (e) { undoing = true; throw e; } };
  const origWrite = core.externCss.write;
  core.externCss.write = (f, c) => { try { return origWrite(f, c); } catch (e) { undoing = true; throw e; } };
  return { core, templates, css, audits, orderBox };
}

function call(routes, body, { query = {}, role = 'ADMIN' } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const token = signToken({ sub: 'u1', name: 'A', role }, 'geheim', undefined, 1_000_000).token;
  const req = { method: 'POST', body, headers: { authorization: `Bearer ${token}`, 'x-designer-api': '1,2' } };
  return routes['POST v1/bulk'].handler(req, res, { params: {}, query, log: { error() {} } }).then(() => res);
}

const snapshot = ({ templates, css, orderBox }) => JSON.stringify([[...templates].sort(), [...css].sort(), orderBox.raw]);
const five = () => ({
  css: [{ filename: 'designer-a.css', content: '.a{}' }],
  templates: ['T1', 'T2', 'T3', 'T4'].map((n) => ({ name: n, code: `<p>${n}</p>`, kind: 'block' })),
});

test('Erfolg: alle Dateien geschrieben, Bericht je Datei, ein Audit-Eintrag', async () => {
  const c = fakeCore();
  const r = createRoutes(c.core);
  const out = await call(r, five());
  expect(out.code).toBe(200);
  expect(out.body).toMatchObject({ ok: true, dryRun: false, written: 5 });
  expect(out.body.results.map((x) => [x.type, x.name, x.action, x.status])).toEqual([
    ['css', 'designer-a.css', 'create', 'ok'], ['template', 'T1', 'create', 'ok'], ['template', 'T2', 'create', 'ok'], ['template', 'T3', 'create', 'ok'], ['template', 'T4', 'create', 'ok'],
  ]);
  expect(out.body.results[1].hash).toBe(sha('<p>T1</p>'));
  expect(c.templates.size).toBe(4);
  expect(c.css.get('designer-a.css')).toBe('.a{}');
  expect(c.audits).toHaveLength(1);
  expect(c.audits[0]).toMatchObject({ action: 'designer.bulk', details: { templates: 4, css: 1, written: 5 } });
});

test('Plan-Fehler im dritten von fünf: nichts geschrieben, Bericht nennt den Fehler, die übrigen als not-written', async () => {
  const c = fakeCore();
  c.templates.set('T1', { name: 'T1', code: 'alt1', type: 'BLOCK' });
  const r = createRoutes(c.core);
  const b = five();
  b.templates[1].expectedHash = 'falsch'; // = dritte Datei (css, T1, T2 ...)
  c.templates.set('T2', { name: 'T2', code: 'alt2', type: 'BLOCK' });
  const before2 = snapshot(c);
  const out = await call(r, b);
  expect(out.code).toBe(409);
  expect(out.body).toMatchObject({ code: 'BULK_FAILED', written: 0, rolledBack: false });
  expect(out.body.results.map((x) => x.status)).toEqual(['not-written', 'not-written', 'error', 'not-written', 'not-written']);
  expect(out.body.results[2]).toMatchObject({ name: 'T2', code: 'TEMPLATE_CHANGED', path: 'templates[1]' });
  expect(out.body.errors).toHaveLength(1);
  expect(snapshot(c)).toBe(before2);
  expect(c.audits).toHaveLength(0);
});

test('Validierung: ungültiger Name, doppelte Namen, Blog-Vorschau ohne Master -> 400, nichts geschrieben; Master in derselben Anfrage ist erlaubt', async () => {
  const c = fakeCore();
  const r = createRoutes(c.core);
  const out = await call(r, { templates: [
    { name: 'ok', code: '<p/>', kind: 'block' }, { name: 'a/b', code: '<p/>', kind: 'block' }, { name: 'ok', code: 'x', kind: 'block' },
    { name: 'V', code: 'x', kind: 'blog-preview', master: 'Fehlt' }, { name: 'Z', code: ' ', kind: 'block' }, { name: 'K', code: 'x', kind: 'komisch' },
  ] });
  expect(out.code).toBe(400);
  expect(out.body.results.map((x) => x.code || null)).toEqual([null, 'VALIDATION_ERROR', 'DUPLICATE', 'MASTER_TEMPLATE_NOT_FOUND', 'CODE_REQUIRED', 'KIND_INVALID']);
  expect(c.templates.size).toBe(0);

  const ok = await call(r, { templates: [{ name: 'M', code: '<p>{{a}}</p>', kind: 'blog-master' }, { name: 'V', code: '<p>{{a}}</p>', kind: 'blog-preview', master: 'm' }] });
  expect(ok.code).toBe(200);
  expect(c.templates.get('V')).toMatchObject({ blogRole: 'preview', masterTemplateName: 'm' });
  const mism = await call(r, { templates: [{ name: 'M2', code: '<p>{{a}}</p>', kind: 'blog-master' }, { name: 'V2', code: '{{fremd}}', kind: 'blog-preview', master: 'M2' }] });
  expect(mism.body.results[1]).toMatchObject({ code: 'PREVIEW_PLACEHOLDER_MISMATCH' });
});

test('CSS: nur designer-*, Hash-Konflikt, Inhalt Pflicht', async () => {
  const c = fakeCore();
  c.css.set('designer-x.css', 'alt');
  const r = createRoutes(c.core);
  const out = await call(r, { css: [{ filename: 'fremd.css', content: 'a' }, { filename: 'designer-x', content: 'neu', expectedHash: 'falsch' }, { filename: 'designer-y', content: 5 }] });
  expect(out.code).toBe(400);
  expect(out.body.results.map((x) => x.code)).toEqual(['VALIDATION_ERROR', 'CSS_CHANGED', 'VALIDATION_ERROR']);
  expect(c.css.get('designer-x.css')).toBe('alt');
  expect((await call(r, { css: [{ filename: 'designer-x', content: 'neu', expectedHash: sha('alt') }] })).code).toBe(200);
  expect(c.css.get('designer-x.css')).toBe('neu');
});

test('Schreibfehler im dritten von fünf: alle schon geschriebenen werden zurückgesetzt (Aktualisierung und Neuanlage), Rückgängig-Information', async () => {
  const c = fakeCore({ failOn: (n) => n === 'T2' });
  c.templates.set('T1', { name: 'T1', code: 'alt1', type: 'BLOCK', blogRole: null, masterTemplateName: null, category: null });
  c.css.set('designer-a.css', 'altcss');
  const before = snapshot(c);
  const r = createRoutes(c.core);
  const out = await call(r, five());
  expect(out.code).toBe(500);
  expect(out.body).toMatchObject({ code: 'BULK_FAILED', rolledBack: true, written: 0, undo: { failed: [] } });
  expect(out.body.undo.restored.sort()).toEqual(['T1', 'designer-a.css']);
  expect(out.body.results.map((x) => x.status)).toEqual(['rolled-back', 'rolled-back', 'error', 'not-written', 'not-written']);
  expect(out.body.results[2]).toMatchObject({ code: 'WRITE_FAILED', name: 'T2' });
  expect(snapshot(c)).toBe(before);
  expect(c.audits.map((a) => a.action)).toEqual(['designer.bulk.failed']);
});

test('Rückgängig scheitert teilweise: rolledBack false, betroffene Datei als rollback-failed gemeldet', async () => {
  const c = fakeCore({ failOn: (n) => n === 'T2', failUndo: (n) => n === 'T1' });
  const r = createRoutes(c.core);
  const out = await call(r, five());
  expect(out.code).toBe(500);
  expect(out.body.rolledBack).toBe(false);
  expect(out.body.undo.failed).toEqual([{ name: 'T1', message: 'undo kaputt' }]);
  expect(out.body.results.map((x) => x.status)).toEqual(['rolled-back', 'rollback-failed', 'error', 'not-written', 'not-written']);
});

test('Trockenlauf: Prüfung wie echt, nichts geschrieben, kein Audit; unveränderte Dateien als unchanged', async () => {
  const c = fakeCore();
  c.templates.set('T1', { name: 'T1', code: '<p>T1</p>', type: 'BLOCK', blogRole: null, masterTemplateName: null, category: null });
  const r = createRoutes(c.core);
  const out = await call(r, { ...five(), dryRun: true });
  expect(out.body).toMatchObject({ ok: true, dryRun: true, written: 0 });
  expect(out.body.results.map((x) => x.action)).toEqual(['create', 'unchanged', 'create', 'create', 'create']);
  expect(c.templates.size).toBe(1);
  expect(c.css.size).toBe(0);
  expect(c.audits).toHaveLength(0);
  const real = await call(r, five());
  expect(real.body.written).toBe(4); // T1 unverändert, nicht geschrieben
});

test('Grenzen und Rechte: leer, zu viele, Nicht-Listen, falsche Rolle', async () => {
  const r = createRoutes(fakeCore().core);
  expect((await call(r, {})).code).toBe(400);
  expect((await call(r, { templates: 'x' })).code).toBe(400);
  const many = Array.from({ length: 101 }, (_, i) => ({ name: `T${i}`, code: 'x', kind: 'block' }));
  expect((await call(r, { templates: many })).body).toMatchObject({ code: 'BULK_TOO_LARGE' });
  expect((await call(r, { templates: many.slice(0, 100) })).code).toBe(200);
  expect((await call(r, five(), { role: 'EDITOR' })).code).toBe(403);
});
