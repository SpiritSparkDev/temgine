/**
 * __tests__/api/page-save.test.js
 * Kernpfad-Tests für das Speichern von Seiten: POST /api/pages
 *
 * Testet: Single-Save, Array-Save, Validierung, Status-Persistenz, Slug-Pflicht
 */

jest.disableAutomock();

const mockPrisma = {
  page: {
    upsert:     jest.fn(),
    findMany:   jest.fn().mockResolvedValue([]),
    delete:     jest.fn().mockResolvedValue({ id: 'deleted' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  pageRevision: {
    create:     jest.fn().mockResolvedValue({ id: 'rev-1' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  setting: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/audit',  () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const handler = require('../../pages/api/pages').default;

function makeRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  r.end    = jest.fn().mockReturnValue(r);
  return r;
}

const basePage = {
  id: 'page-1', slug: 'home', title: 'Home',
  blocks: [], children: [], status: 'DRAFT',
  publishAt: null, template: null, data: {},
};

describe('POST /api/pages — Single-Page-Save', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 und upsert bei vollständigen Daten', async () => {
    mockPrisma.page.upsert.mockResolvedValue(basePage);
    const req = { method: 'POST', body: { slug: 'home', title: 'Home', status: 'DRAFT' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.page.upsert).toHaveBeenCalledTimes(1);
  });

  test('400 wenn slug fehlt', async () => {
    const req = { method: 'POST', body: { title: 'Kein Slug' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mockPrisma.page.upsert).not.toHaveBeenCalled();
  });

  test('Status REVIEW wird korrekt persistiert', async () => {
    mockPrisma.page.upsert.mockResolvedValue({ ...basePage, status: 'REVIEW' });
    const req = { method: 'POST', body: { slug: 'home', title: 'Home', status: 'REVIEW' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const call = mockPrisma.page.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('REVIEW');
  });

  test('Status PUBLISHED wird korrekt persistiert', async () => {
    mockPrisma.page.upsert.mockResolvedValue({ ...basePage, status: 'PUBLISHED' });
    const req = { method: 'POST', body: { slug: 'home', title: 'Home', status: 'PUBLISHED' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const call = mockPrisma.page.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('PUBLISHED');
  });

  test('400 bei ungültigem Status-Wert', async () => {
    const req = { method: 'POST', body: { slug: 'home', status: 'UNGUELTIG' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Revision wird nach erfolgreichem Upsert erstellt', async () => {
    mockPrisma.page.upsert.mockResolvedValue(basePage);
    const req = { method: 'POST', body: { slug: 'home', title: 'Home' } };
    const res = makeRes();
    await handler(req, res);
    expect(mockPrisma.pageRevision.create).toHaveBeenCalledTimes(1);
  });

  test('isHomepage wird korrekt gespeichert', async () => {
    mockPrisma.page.upsert.mockResolvedValue({ ...basePage, isHomepage: true });
    const req = { method: 'POST', body: { slug: 'home', title: 'Home', isHomepage: true } };
    const res = makeRes();
    await handler(req, res);
    const call = mockPrisma.page.upsert.mock.calls[0][0];
    expect(call.create.isHomepage).toBe(true);
  });
});

describe('POST /api/pages — Array-Save (Batch)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 und mehrfache upserts bei Array-Eingabe', async () => {
    mockPrisma.page.upsert
      .mockResolvedValueOnce({ ...basePage, slug: 'home' })
      .mockResolvedValueOnce({ ...basePage, id: 'page-2', slug: 'about' });

    const req = {
      method: 'POST',
      body: [
        { slug: 'home', title: 'Startseite' },
        { slug: 'about', title: 'Über uns' },
      ],
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.page.upsert).toHaveBeenCalledTimes(2);
  });

  test('Seiten ohne slug werden in Array übersprungen', async () => {
    mockPrisma.page.upsert.mockResolvedValue(basePage);
    const req = {
      method: 'POST',
      body: [
        { slug: 'home', title: 'Home' },
        { title: 'Kein Slug — wird übersprungen' },
      ],
    };
    const res = makeRes();
    await handler(req, res);
    expect(mockPrisma.page.upsert).toHaveBeenCalledTimes(1);
  });

  test('_order wird in data eingebettet für Sort-Erhalt', async () => {
    mockPrisma.page.upsert.mockResolvedValue(basePage);
    const req = {
      method: 'POST',
      body: [
        { slug: 'page-a', title: 'A' },
        { slug: 'page-b', title: 'B' },
      ],
    };
    const res = makeRes();
    await handler(req, res);
    const firstCall = mockPrisma.page.upsert.mock.calls[0][0];
    expect(firstCall.create.data._order).toBe(0);
    const secondCall = mockPrisma.page.upsert.mock.calls[1][0];
    expect(secondCall.create.data._order).toBe(1);
  });
});

describe('GET /api/pages', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 und leeres Array wenn keine Seiten vorhanden', async () => {
    mockPrisma.page.findMany.mockResolvedValue([]);
    const req = { method: 'GET', query: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test('GET mit slug gibt einzelne Seite zurück (PUBLISHED)', async () => {
    const page = { ...basePage, status: 'PUBLISHED' };
    mockPrisma.page.findMany.mockResolvedValue([]);
    // findUnique wird für slug-Abfragen verwendet
    mockPrisma.page.findUnique = jest.fn().mockResolvedValue(page);
    const req = { method: 'GET', query: { slug: 'home', includeDrafts: 'true' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
