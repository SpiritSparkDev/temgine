/**
 * lib/liveRebuild.js: Snapshot-Neubau entprellt, nie parallel, nur im statischen Modus
 * (ctx.rebuildSnapshot() der Plugins, z. B. Webhooks).
 */
jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/liveSnapshot', () => ({ renderLiveSnapshot: jest.fn() }));

const { renderLiveSnapshot } = require('../lib/liveSnapshot');
const { rebuildLiveSnapshot } = require('../lib/liveRebuild');

beforeEach(() => jest.clearAllMocks());

test('debounces bursts into one rebuild and queues exactly one more while running', async () => {
  jest.useFakeTimers();
  try {
    let finish;
    const rebuild = jest.fn(() => new Promise((r) => { finish = r; }));
    for (let i = 0; i < 5; i++) rebuildLiveSnapshot({ rebuild, delayMs: 1000 });
    await jest.advanceTimersByTimeAsync(1000);
    expect(rebuild).toHaveBeenCalledTimes(1);

    rebuildLiveSnapshot({ rebuild, delayMs: 1000 });
    rebuildLiveSnapshot({ rebuild, delayMs: 1000 });
    finish();
    await jest.advanceTimersByTimeAsync(1000);
    expect(rebuild).toHaveBeenCalledTimes(2);
    finish();
    await jest.advanceTimersByTimeAsync(2000);
    expect(rebuild).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('manual rebuild runs immediately, never in parallel, and lets a queued rebuild follow', async () => {
  jest.useFakeTimers();
  try {
    let finish;
    const manual = jest.fn(() => new Promise((r) => { finish = r; }));
    const hook = jest.fn(async () => {});
    const first = rebuildLiveSnapshot({ immediate: true, rebuild: manual });
    expect(manual).toHaveBeenCalledTimes(1);
    await expect(rebuildLiveSnapshot({ immediate: true, rebuild: manual })).resolves.toBeNull();
    rebuildLiveSnapshot({ rebuild: hook, delayMs: 10 });
    await jest.advanceTimersByTimeAsync(10);
    expect(hook).not.toHaveBeenCalled();
    finish({ renderedRoutes: 1 });
    await expect(first).resolves.toEqual({ renderedRoutes: 1 });
    await jest.advanceTimersByTimeAsync(10);
    expect(hook).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('rebuilds the snapshot only in static mode', async () => {
  jest.useFakeTimers();
  try {
    renderLiveSnapshot.mockResolvedValue({ renderedRoutes: 3, errors: [] });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'dynamic' });
    rebuildLiveSnapshot({ delayMs: 10 });
    await jest.advanceTimersByTimeAsync(10);
    expect(renderLiveSnapshot).not.toHaveBeenCalled();

    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'static' });
    rebuildLiveSnapshot({ delayMs: 10 });
    await jest.advanceTimersByTimeAsync(10);
    expect(renderLiveSnapshot).toHaveBeenCalledTimes(1);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'liveRenderLastStatus' } }));
  } finally {
    jest.useRealTimers();
  }
});
