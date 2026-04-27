/**
 * __tests__/api/workflow.test.js
 * Integrationstests für POST /api/pages/workflow (D-01/D-02)
 *
 * Testet: Validierung, Auth-Guard, Workflow-Übergänge, Fehlerbehandlung
 */

jest.disableAutomock();

// ── Prisma Mock ──────────────────────────────────────────────────────────────
const mockPrisma = {
  page: {
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  pageWorkflowEvent: {
    create: jest.fn().mockResolvedValue({ id: 'event-1' }),
  },
  pageRevision: {
    create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
  },
};

jest.mock('../../lib/prisma',   () => ({ prisma: mockPrisma }));
jest.mock('../../lib/audit',    () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
// Rate-Limiter immer erlauben (nicht blockieren)
jest.mock('../../lib/rateLimit', () => ({
  rateLimit: () => ({ check: () => ({ ok: true, remaining: 99 }) }),
}));

// Auth: kann pro Test konfiguriert werden
const mockRequireAuth = jest.fn();
jest.mock('../../lib/auth', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
}));

const handler = require('../../pages/api/pages/workflow').default;

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
function makeRes() {
  const res = {};
  res.status    = jest.fn().mockReturnValue(res);
  res.json      = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

function authAs(role = 'ADMIN', email = 'admin@example.com') {
  mockRequireAuth.mockResolvedValue({
    authorized: true,
    user: { id: 'user-1', email, role },
  });
}

function authDenied(status = 403) {
  mockRequireAuth.mockResolvedValue({ authorized: false, status, error: 'Zugriff verweigert' });
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/pages/workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Methoden-Check ────────────────────────────────────────────────────────

  test('405 bei GET-Anfrage', async () => {
    const req = { method: 'GET', body: {}, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  // ── Auth-Guard ────────────────────────────────────────────────────────────

  test('403 wenn nicht autorisiert', async () => {
    authDenied(403);
    const req = { method: 'POST', body: { pageId: 'p1', toStatus: 'PUBLISHED' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ── Eingabe-Validierung ───────────────────────────────────────────────────

  test('400 wenn pageId fehlt', async () => {
    authAs('ADMIN');
    const req = { method: 'POST', body: { toStatus: 'DRAFT' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveProperty('pageId');
  });

  test('400 wenn toStatus fehlt', async () => {
    authAs('ADMIN');
    const req = { method: 'POST', body: { pageId: 'p1' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.details).toHaveProperty('toStatus');
  });

  test('400 bei ungültigem toStatus', async () => {
    authAs('ADMIN');
    const req = { method: 'POST', body: { pageId: 'p1', toStatus: 'UNGUELTIG' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Seite nicht gefunden ──────────────────────────────────────────────────

  test('404 wenn Seite nicht gefunden', async () => {
    authAs('ADMIN');
    mockPrisma.page.findUnique.mockResolvedValue(null);
    const req = { method: 'POST', body: { pageId: 'nonexistent', toStatus: 'PUBLISHED' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const [body] = res.json.mock.calls[0];
    expect(body.code).toBe('PAGE_NOT_FOUND');
  });

  // ── Workflow-Übergänge ───────────────────────────────────────────────────

  test('200 EDITOR kann DRAFT → REVIEW durchführen', async () => {
    authAs('EDITOR', 'editor@example.com');
    const page = { id: 'p1', slug: 'test', title: 'Test', status: 'DRAFT' };
    mockPrisma.page.findUnique.mockResolvedValue(page);
    mockPrisma.page.update.mockResolvedValue({ ...page, status: 'REVIEW' });

    const req = { method: 'POST', body: { pageId: 'p1', toStatus: 'REVIEW' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.page.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'REVIEW' },
    }));
  });

  test('200 ADMIN kann APPROVED → PUBLISHED durchführen', async () => {
    authAs('ADMIN');
    const page = { id: 'p2', slug: 'about', title: 'About', status: 'APPROVED' };
    mockPrisma.page.findUnique.mockResolvedValue(page);
    mockPrisma.page.update.mockResolvedValue({ ...page, status: 'PUBLISHED' });

    const req = { method: 'POST', body: { pageId: 'p2', toStatus: 'PUBLISHED' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('403 EDITOR kann DRAFT nicht direkt zu PUBLISHED machen', async () => {
    authAs('EDITOR');
    const page = { id: 'p3', slug: 'news', title: 'News', status: 'DRAFT' };
    mockPrisma.page.findUnique.mockResolvedValue(page);

    const req = { method: 'POST', body: { pageId: 'p3', toStatus: 'PUBLISHED' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    const [body] = res.json.mock.calls[0];
    expect(body.code).toBe('WORKFLOW_TRANSITION_FORBIDDEN');
  });

  test('speichert WorkflowEvent beim erfolgreichen Übergang', async () => {
    authAs('MODERATOR', 'mod@example.com');
    const page = { id: 'p4', slug: 'blog', title: 'Blog', status: 'DRAFT' };
    mockPrisma.page.findUnique.mockResolvedValue(page);
    mockPrisma.page.update.mockResolvedValue({ ...page, status: 'PUBLISHED' });

    const req = {
      method: 'POST',
      body: { pageId: 'p4', toStatus: 'PUBLISHED', note: 'Geprüft und freigegeben' },
      headers: {},
      socket: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.pageWorkflowEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pageId:     'p4',
        fromStatus: 'DRAFT',
        toStatus:   'PUBLISHED',
        comment:    'Geprüft und freigegeben',
        createdBy:  'mod@example.com',
      }),
    }));
  });

  test('Notiz mit mehr als 1000 Zeichen wird abgelehnt', async () => {
    authAs('ADMIN');
    const longNote = 'x'.repeat(1001);
    const req = {
      method: 'POST',
      body: { pageId: 'p5', toStatus: 'DRAFT', note: longNote },
      headers: {},
      socket: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.details).toHaveProperty('note');
  });

  test('toStatus wird zu Großbuchstaben normalisiert', async () => {
    authAs('ADMIN');
    const page = { id: 'p6', slug: 'home', title: 'Home', status: 'DRAFT' };
    mockPrisma.page.findUnique.mockResolvedValue(page);
    mockPrisma.page.update.mockResolvedValue({ ...page, status: 'REVIEW' });

    const req = { method: 'POST', body: { pageId: 'p6', toStatus: 'review' }, headers: {}, socket: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
