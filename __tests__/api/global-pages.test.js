/**
 * __tests__/api/global-pages.test.js
 * Tests für POST /api/global-pages — insbesondere, dass die neue WIDGET-
 * Rolle erstellbar ist (lib/globalPageStore.js), aber das tote MOBILE-Gleis
 * weiterhin nicht.
 */

jest.disableAutomock();

const mockGlobalPageStore = {
  GLOBAL_PAGE_ROLES: [
    { id: 'FOOTER', label: 'Footer', exclusiveActive: true, alwaysActive: false },
    { id: 'MAIN', label: 'Hauptnavigation', exclusiveActive: true, alwaysActive: false },
    { id: 'PAGE', label: 'Seitennavigation', exclusiveActive: false, alwaysActive: true },
    { id: 'MOBILE', label: 'Mobile-Navigation', exclusiveActive: true, alwaysActive: false },
    { id: 'WIDGET', label: 'Widget', exclusiveActive: false, alwaysActive: true },
  ],
  listGlobalPages: jest.fn().mockReturnValue([]),
  getGlobalPageById: jest.fn(),
  getActiveGlobalPages: jest.fn().mockReturnValue([]),
  saveGlobalPage: jest.fn((args) => ({ id: 'new-id', createdAt: '', updatedAt: '', ...args })),
  deleteGlobalPage: jest.fn(),
};
jest.mock('../../lib/globalPageStore', () => mockGlobalPageStore);
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const mockRequireAuth = jest.fn().mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
jest.mock('../../lib/auth', () => ({ requireAuth: (...args) => mockRequireAuth(...args) }));

const handler = require('../../pages/api/global-pages').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/global-pages', () => {
  test('creates a WIDGET entry, always active', async () => {
    const req = { method: 'POST', body: { name: 'Sidebar', role: 'WIDGET', code: '<aside></aside>' } };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockGlobalPageStore.saveGlobalPage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'WIDGET', isActive: true })
    );
  });

  test('rejects the dead MOBILE role', async () => {
    const req = { method: 'POST', body: { name: 'x', role: 'MOBILE', code: '<nav></nav>' } };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGlobalPageStore.saveGlobalPage).not.toHaveBeenCalled();
  });

  test('accepts the pre-existing FOOTER/MAIN/PAGE roles too', async () => {
    for (const role of ['FOOTER', 'MAIN', 'PAGE']) {
      jest.clearAllMocks();
      mockRequireAuth.mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
      const req = { method: 'POST', body: { name: 'x', role, code: '<div></div>' } };
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    }
  });
});
