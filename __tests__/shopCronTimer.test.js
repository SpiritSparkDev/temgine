/** @jest-environment node */
const { startShopCron } = require('../lib/shopCronTimer')

beforeEach(() => jest.useFakeTimers())
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

test('erste Ausführung nach Verzögerung, dann im Intervall; Fehler und 404 stürzen nicht ab', async () => {
  const request = jest.fn().mockResolvedValueOnce(200).mockRejectedValueOnce(new Error('down')).mockResolvedValue(404)
  const err = jest.spyOn(console, 'error').mockImplementation(() => {})
  const t = startShopCron({ port: 3000, token: 'SECRET', intervalMs: 1000, firstDelayMs: 100, request })
  expect(request).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(100)
  expect(request).toHaveBeenCalledWith({ port: 3000, token: 'SECRET' })
  await jest.advanceTimersByTimeAsync(1000)
  await jest.advanceTimersByTimeAsync(1000)
  expect(request).toHaveBeenCalledTimes(3)
  expect(err).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(err.mock.calls)).not.toContain('SECRET')
  t.stop()
  await jest.advanceTimersByTimeAsync(5000)
  expect(request).toHaveBeenCalledTimes(3)
})
