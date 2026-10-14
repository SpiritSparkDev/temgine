const fs = require('fs'); const os = require('os'); const path = require('path')
const { applyRetention, isDue, validateBackup } = require('../lib/backupTools')

test('Aufbewahrung löscht nur alte Auto-Backups', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'))
  ;['temgine-auto-2026-01-01.json', 'temgine-auto-2026-01-02.json', 'temgine-auto-2026-01-03.json', 'temgine-backup-manual.json']
    .forEach((f) => fs.writeFileSync(path.join(d, f), '{}'))
  expect(applyRetention(2, d)).toEqual(['temgine-auto-2026-01-01.json'])
  expect(fs.readdirSync(d)).toContain('temgine-backup-manual.json')
})
test('isDue', () => {
  expect(isDue({ enabled: false })).toBe(false)
  expect(isDue({ enabled: true, interval: 'daily', lastRunAt: null })).toBe(true)
  expect(isDue({ enabled: true, interval: 'daily', lastRunAt: new Date().toISOString() })).toBe(false)
})
test('validateBackup', () => {
  expect(validateBackup('x').ok).toBe(false)
  const good = JSON.stringify({ metadata: {}, pages: [{ id: 1, slug: 'a' }], blogChannels: [{ id: 'c' }], blogPosts: [{ channelId: 'c' }] })
  expect(validateBackup(good).ok).toBe(true)
  const bad = JSON.stringify({ metadata: {}, pages: [{ id: 1, slug: 'a' }, { id: 2, slug: 'a' }], blogChannels: [], blogPosts: [{ channelId: 'x' }] })
  expect(validateBackup(bad).errors.length).toBe(2)
})
