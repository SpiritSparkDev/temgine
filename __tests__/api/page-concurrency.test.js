/**
 * __tests__/api/page-concurrency.test.js
 * Gleichzeitiges Bearbeiten im Backend: Niemand darf mit einem veralteten
 * Stand die Änderungen einer anderen Person überschreiben.
 *
 * Simuliert eine kleine In-Memory-DB, damit die Abfolge mehrerer Anfragen
 * (zwei Personen, ein Browser mit altem Stand) realistisch geprüft wird.
 */

jest.disableAutomock();

let clock = 1_000_000;
let rows = [];
let revisions = [];
let currentUser = { id: 'u-andre', name: 'Andre', email: 'andre@example.org', role: 'ADMIN' };

const clone = (v) => JSON.parse(JSON.stringify(v));
const withDates = (r) => ({ ...clone(r), updatedAt: new Date(r.updatedAt), createdAt: new Date(r.createdAt) });

const mockPrisma = {
  page: {
    findMany: jest.fn(async () => rows.map(withDates)),
    findUnique: jest.fn(async ({ where }) => {
      const r = rows.find(x => (where.id && x.id === where.id) || (where.slug && x.slug === where.slug));
      return r ? withDates(r) : null;
    }),
    update: jest.fn(async ({ where, data }) => {
      const r = rows.find(x => x.id === where.id);
      Object.assign(r, clone(data), { updatedAt: ++clock });
      return withDates(r);
    }),
    upsert: jest.fn(async ({ where, create, update }) => {
      let r = rows.find(x => x.slug === where.slug);
      if (r) {
        for (const [k, v] of Object.entries(update)) if (v !== undefined) r[k] = clone(v);
        r.updatedAt = ++clock;
      } else {
        r = { id: `new-${create.slug}`, ...clone(create), createdAt: ++clock, updatedAt: clock };
        rows.push(r);
      }
      return withDates(r);
    }),
    updateMany: jest.fn(async () => ({ count: 0 })),
    deleteMany: jest.fn(async ({ where }) => {
      const before = rows.length;
      rows = rows.filter(r => !where.slug.in.includes(r.slug));
      return { count: before - rows.length };
    }),
  },
  pageRevision: {
    create: jest.fn(async ({ data }) => { revisions.push(clone(data)); return { id: `rev-${revisions.length}` }; }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  setting: { findUnique: jest.fn(async () => null) },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/htmlSanitize', () => ({ sanitizeRecursive: (v) => v }));
jest.mock('../../lib/auth', () => ({
  PERMISSIONS: { PAGES_VIEW: ['ADMIN', 'MODERATOR', 'EDITOR'], PAGES_EDIT: ['ADMIN', 'EDITOR'], PAGES_CREATE: ['ADMIN', 'EDITOR'], PAGES_DELETE: ['ADMIN'], TEMPLATES_EDIT: ['ADMIN'] },
  requireAuth: jest.fn(async () => ({ authorized: true, user: currentUser })),
}));
// GET /api/pages prüft die Session (lib/pageAccess.js): standardmäßig Backend-Nutzer.
let sessionUser = () => ({ accountType: 'admin', role: currentUser.role });
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn(async () => (sessionUser() ? { user: sessionUser() } : null)) }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));

const handler = require('../../pages/api/pages').default;

function makeRes() {
  const r = { headers: {} };
  r.status = jest.fn((code) => { r.statusCode = code; return r; });
  r.json = jest.fn((body) => { r.body = body; return r; });
  r.setHeader = jest.fn((k, v) => { r.headers[k.toLowerCase()] = v; });
  r.end = jest.fn(() => r);
  return r;
}

async function call(method, { body, headers = {}, query = {} } = {}) {
  const res = makeRes();
  await handler({ method, body: clone(body ?? null), headers, query, cookies: {} }, res);
  return res;
}

const asFranzi = () => { currentUser = { id: 'u-franzi', name: 'Franzi', email: 'franzi@example.org', role: 'EDITOR' }; };
const asAndre = () => { currentUser = { id: 'u-andre', name: 'Andre', email: 'andre@example.org', role: 'ADMIN' }; };

beforeEach(() => {
  jest.clearAllMocks();
  sessionUser = () => ({ accountType: 'admin', role: currentUser.role });
  clock = 1_000_000;
  revisions = [];
  asAndre();
  rows = [
    { id: 'p-home', slug: 'home', title: 'Start', blocks: [], data: { _order: 0 }, template: null, status: 'PUBLISHED', publishAt: null, isHomepage: true, accessGroups: [], accessPasswordHash: null, children: [], createdAt: 1, updatedAt: 10 },
    {
      id: 'p-verband', slug: 'verband', title: 'Verband', blocks: [], data: { _order: 1, intro: 'Alt' }, template: 'seite', status: 'PUBLISHED', publishAt: null, isHomepage: false, accessGroups: [], accessPasswordHash: null, createdAt: 2, updatedAt: 11,
      children: [
        { id: 'p-vorstand', slug: 'vorstand', title: 'Vorstand', blocks: [], data: { text: 'Alt' }, status: 'PUBLISHED', accessGroups: [], accessPasswordHash: 'HASH', children: [] },
      ],
    },
  ];
});

async function loadTree() {
  const res = await call('GET', { query: { includeDrafts: 'true' } });
  return { tree: res.body, version: res.headers['x-pages-version'] };
}

const findNode = (nodes, id) => {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
};

describe('PUT /api/pages — einzelne Seite speichern', () => {
  test('ändert nur die eine Seite, nicht den Rest des Baums', async () => {
    const { tree } = await loadTree();
    const page = { ...findNode(tree, 'p-home'), title: 'Startseite' };
    const res = await call('PUT', { body: { page, expectedSavedAt: null } });
    expect(res.statusCode).toBe(200);
    expect(res.body.savedAt).toEqual(expect.any(String));
    expect(rows.find(r => r.id === 'p-home').title).toBe('Startseite');
    expect(rows.find(r => r.id === 'p-home').data._order).toBe(0);
    expect(rows.find(r => r.id === 'p-home').data._savedBy).toBe('Andre');
    expect(rows.find(r => r.id === 'p-verband').data.intro).toBe('Alt');
  });

  test('409, wenn jemand anderes dieselbe Seite inzwischen gespeichert hat', async () => {
    const { tree } = await loadTree();
    asFranzi();
    const franzi = await call('PUT', { body: { page: { ...findNode(tree, 'p-verband'), data: { intro: 'Von Franzi' } }, expectedSavedAt: null } });
    expect(franzi.statusCode).toBe(200);

    asAndre();
    const andre = await call('PUT', { body: { page: { ...findNode(tree, 'p-verband'), data: { intro: 'Von Andre (alter Stand)' } }, expectedSavedAt: null } });
    expect(andre.statusCode).toBe(409);
    expect(andre.body.code).toBe('PAGE_CONFLICT');
    expect(andre.body.details.savedBy).toBe('Franzi');
    expect(rows.find(r => r.id === 'p-verband').data.intro).toBe('Von Franzi');
  });

  test('gleichzeitiges Arbeiten an verschiedenen Seiten bleibt konfliktfrei', async () => {
    const { tree } = await loadTree();
    asFranzi();
    expect((await call('PUT', { body: { page: { ...findNode(tree, 'p-verband'), title: 'Verband (F)' }, expectedSavedAt: null } })).statusCode).toBe(200);
    asAndre();
    expect((await call('PUT', { body: { page: { ...findNode(tree, 'p-home'), title: 'Start (A)' }, expectedSavedAt: null } })).statusCode).toBe(200);
    expect(rows.find(r => r.id === 'p-verband').title).toBe('Verband (F)');
    expect(rows.find(r => r.id === 'p-home').title).toBe('Start (A)');
  });

  test('mehrfaches Speichern mit dem jeweils zurückgegebenen Stempel funktioniert', async () => {
    const { tree } = await loadTree();
    const first = await call('PUT', { body: { page: { ...findNode(tree, 'p-home'), title: 'Eins' }, expectedSavedAt: null } });
    const second = await call('PUT', { body: { page: { ...findNode(tree, 'p-home'), title: 'Zwei' }, expectedSavedAt: first.body.savedAt } });
    expect(second.statusCode).toBe(200);
    expect(rows.find(r => r.id === 'p-home').title).toBe('Zwei');
  });

  test('verschachtelte Seite: nur dieser Knoten ändert sich, Passwort-Hash bleibt', async () => {
    const { tree } = await loadTree();
    const node = { ...findNode(tree, 'p-vorstand'), data: { text: 'Neu' } };
    const res = await call('PUT', { body: { page: node, expectedSavedAt: null } });
    expect(res.statusCode).toBe(200);
    const parent = rows.find(r => r.id === 'p-verband');
    expect(parent.data.intro).toBe('Alt');
    expect(parent.children[0].data.text).toBe('Neu');
    expect(parent.children[0].data._savedBy).toBe('Andre');
    expect(parent.children[0].accessPasswordHash).toBe('HASH');
    expect(res.body.page.accessPasswordHash).toBeUndefined();
  });

  test('Revision enthält Template-Felder (data) und wer gespeichert hat', async () => {
    const { tree } = await loadTree();
    await call('PUT', { body: { page: { ...findNode(tree, 'p-verband'), data: { intro: 'Neu' } }, expectedSavedAt: null } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].createdBy).toBe('Andre');
    expect(revisions[0].data.data.intro).toBe('Neu');
    expect(revisions[0].data.template).toBe('seite');
  });

  test('unveränderte Seite erzeugt weder Schreibzugriff noch Revision', async () => {
    const { tree } = await loadTree();
    const res = await call('PUT', { body: { page: findNode(tree, 'p-home'), expectedSavedAt: null } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.page.update).not.toHaveBeenCalled();
    expect(revisions).toHaveLength(0);
  });

  test('404, wenn die Seite inzwischen gelöscht wurde', async () => {
    const res = await call('PUT', { body: { page: { id: 'gibts-nicht', slug: 'x', title: 'X' }, expectedSavedAt: null } });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/pages — Seitenbaum speichern', () => {
  test('409 bei veraltetem Baum: nichts wird überschrieben oder gelöscht', async () => {
    const { tree: staleTree, version: staleVersion } = await loadTree();

    // Franzi ändert zwischenzeitlich eine Seite
    asFranzi();
    await call('PUT', { body: { page: { ...findNode(staleTree, 'p-verband'), data: { intro: 'Von Franzi' } }, expectedSavedAt: null } });

    // Andre speichert eine Baum-Aktion mit seinem alten Stand
    asAndre();
    const reordered = [staleTree[1], staleTree[0]];
    const res = await call('POST', { body: reordered, headers: { 'x-pages-version': staleVersion } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PAGES_TREE_CONFLICT');
    expect(rows.find(r => r.id === 'p-verband').data.intro).toBe('Von Franzi');
    expect(mockPrisma.page.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.page.deleteMany).not.toHaveBeenCalled();
  });

  test('409 ohne Versions-Header (z. B. alter, noch geöffneter Admin-Tab)', async () => {
    const { tree } = await loadTree();
    const res = await call('POST', { body: tree });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.page.upsert).not.toHaveBeenCalled();
  });

  test('aktueller Baum wird gespeichert; neue Version kommt zurück', async () => {
    const { tree, version } = await loadTree();
    const res = await call('POST', { body: [tree[1], tree[0]], headers: { 'x-pages-version': version } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-pages-version']).toEqual(expect.any(String));
    expect(res.headers['x-pages-version']).not.toBe(version);
    const again = await loadTree();
    expect(again.version).toBe(res.headers['x-pages-version']);
  });

  test('Stempel: geänderte Knoten bekommen einen neuen, unveränderte behalten ihren', async () => {
    rows[0].data._savedAt = '2026-01-01T00:00:00.000Z';
    rows[0].data._savedBy = 'Franzi';
    const { tree, version } = await loadTree();
    const changed = clone(tree);
    findNode(changed, 'p-vorstand').title = 'Vorstand (neu)';
    const res = await call('POST', { body: changed, headers: { 'x-pages-version': version } });
    expect(res.statusCode).toBe(200);
    const home = rows.find(r => r.id === 'p-home');
    expect(home.data._savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(home.data._savedBy).toBe('Franzi');
    const vorstand = rows.find(r => r.id === 'p-verband').children[0];
    expect(vorstand.data._savedBy).toBe('Andre');
  });

  test('Passwort-Hash verschachtelter Seiten geht beim Baum-Speichern nicht verloren', async () => {
    const { tree, version } = await loadTree();
    expect(findNode(tree, 'p-vorstand').accessPasswordHash).toBeUndefined();
    await call('POST', { body: tree, headers: { 'x-pages-version': version } });
    expect(rows.find(r => r.id === 'p-verband').children[0].accessPasswordHash).toBe('HASH');
  });

  test('Revision nur für tatsächlich geänderte Seiten, vollständig mit data', async () => {
    const { tree, version } = await loadTree();
    const changed = clone(tree);
    findNode(changed, 'p-verband').data.intro = 'Neu';
    await call('POST', { body: changed, headers: { 'x-pages-version': version } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].data.slug).toBe('verband');
    expect(revisions[0].data.data.intro).toBe('Neu');
    expect(revisions[0].createdBy).toBe('Andre');
  });

  test('nach Baum-Speicherung erkennt ein offener Editor die Änderung', async () => {
    const { tree, version } = await loadTree();
    const editorBase = findNode(tree, 'p-home').data._savedAt || null;
    const changed = clone(tree);
    findNode(changed, 'p-home').title = 'Per Baum geändert';
    await call('POST', { body: changed, headers: { 'x-pages-version': version } });
    const res = await call('PUT', { body: { page: { ...findNode(tree, 'p-home'), title: 'Aus dem Editor' }, expectedSavedAt: editorBase } });
    expect(res.statusCode).toBe(409);
    expect(rows.find(r => r.id === 'p-home').title).toBe('Per Baum geändert');
  });
});

describe('GET /api/pages — Schutz geschützter Inhalte', () => {
  beforeEach(() => {
    rows[1].children[0].accessGroups = ['*'];
    rows[1].children[0].accessPasswordHash = null; // hier nur Mitgliederschutz, kein Passwort
    rows[1].children[0].data = { text: 'NUR FÜR MITGLIEDER' };
    rows.push({ id: 'p-draft', slug: 'entwurf', title: 'Entwurf', blocks: [{ props: { t: 'ENTWURF' } }], data: {}, status: 'DRAFT', isHomepage: false, accessGroups: [], children: [], createdAt: 3, updatedAt: 12 });
  });

  test('anonym: kein Inhalt geschützter Seiten, keine Entwürfe, keine Baum-Version', async () => {
    sessionUser = () => null;
    const res = await call('GET', { query: { includeDrafts: 'true' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('NUR FÜR MITGLIEDER');
    expect(body).not.toContain('ENTWURF');
    expect(findNode(res.body, 'p-vorstand')).toMatchObject({ accessRestricted: true, title: 'Vorstand' });
    expect(res.headers['x-pages-version']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('Mitglied: sieht den Inhalt', async () => {
    sessionUser = () => ({ accountType: 'member', memberGroups: [] });
    const res = await call('GET', {});
    expect(JSON.stringify(res.body)).toContain('NUR FÜR MITGLIEDER');
  });

  test('Backend: alles inkl. Entwürfe', async () => {
    const res = await call('GET', { query: { includeDrafts: 'true' } });
    const body = JSON.stringify(res.body);
    expect(body).toContain('NUR FÜR MITGLIEDER');
    expect(body).toContain('ENTWURF');
    expect(res.headers['x-pages-version']).toEqual(expect.any(String));
  });

  test('?slug= eines Entwurfs: 404 für Anonyme', async () => {
    sessionUser = () => null;
    mockPrisma.page.findUnique.mockImplementationOnce(async () => withDates(rows.find(r => r.id === 'p-draft')));
    const res = await call('GET', { query: { slug: 'entwurf', includeDrafts: 'true' } });
    expect(res.statusCode).toBe(404);
  });
});
