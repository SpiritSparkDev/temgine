jest.disableAutomock();

const mockPrisma = {
  page: {
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ id: 'deleted-page' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 })
  },
  pageRevision: {
    create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 })
  },
  setting: {
    findUnique: jest.fn().mockResolvedValue(null)
  }
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const handler = require('../../pages/api/pages').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

describe('/api/pages slot sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalizes block.slot values recursively on single-page POST', async () => {
    mockPrisma.page.upsert.mockResolvedValue({
      id: 'page-1',
      slug: 'home',
      title: 'Home',
      blocks: [],
      children: [],
      status: 'DRAFT',
      publishAt: null,
      template: 'Landing',
      data: {}
    });

    const req = {
      method: 'POST',
      body: {
        slug: 'home',
        title: 'Home',
        template: 'Landing',
        blocks: [
          {
            template: 'HeroTemplate',
            slot: '  Hero Slot  ',
            props: { title: '<b>Hero</b>' },
            children: [
              {
                template: 'ChildTemplate',
                slot: '   ',
                props: { text: '<script>alert(1)</script>ok' }
              }
            ]
          }
        ],
        data: { pageHeader: 'Startseite' }
      }
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.page.upsert).toHaveBeenCalledTimes(1);

    const upsertArg = mockPrisma.page.upsert.mock.calls[0][0];
    const savedBlocks = upsertArg.create.blocks;

    expect(savedBlocks[0].slot).toBe('Hero-Slot');
    expect(savedBlocks[0].children[0].slot).toBeUndefined();
  });

  test('returns 400 when slug is missing on single-page POST', async () => {
    const req = { method: 'POST', body: { title: 'No Slug' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Slug erforderlich',
      code: 'VALIDATION_ERROR',
      details: { missing: ['slug'] }
    });
    expect(mockPrisma.page.upsert).not.toHaveBeenCalled();
  });
});
