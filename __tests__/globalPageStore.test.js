const fs = require('fs');
const path = require('path');
const {
  listGlobalPages,
  getGlobalPageById,
  getActiveGlobalPages,
  saveGlobalPage,
  deleteGlobalPage,
} = require('../lib/globalPageStore');

// Uses a uniquely-prefixed name so a real, un-mocked filesystem can be
// touched safely — cleaned up in afterEach even if an assertion fails.
const PREFIX = '__jest_globalPageStore__';
const ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'global');

function cleanup() {
  for (const entry of listGlobalPages()) {
    if (entry.name.startsWith(PREFIX)) {
      try { deleteGlobalPage(entry.id); } catch (_e) {}
    }
  }
}

describe('globalPageStore', () => {
  afterEach(cleanup);

  test('creates and reads a FOOTER entry', () => {
    const name = `${PREFIX}footer-a`;
    const saved = saveGlobalPage({ name, role: 'FOOTER', code: '<footer>a</footer>', isActive: false });

    expect(saved.role).toBe('FOOTER');

    const found = getGlobalPageById(saved.id);
    expect(found).toMatchObject({ name, role: 'FOOTER', code: '<footer>a</footer>', isActive: false });

    expect(deleteGlobalPage(saved.id)).toBe(true);
    expect(getGlobalPageById(saved.id)).toBeNull();
  });

  test('FOOTER and MAIN are exclusive-active: activating one deactivates the sibling', () => {
    const a = saveGlobalPage({ name: `${PREFIX}footer-x`, role: 'FOOTER', code: 'x', isActive: true });
    const b = saveGlobalPage({ name: `${PREFIX}footer-y`, role: 'FOOTER', code: 'y', isActive: true });

    expect(getGlobalPageById(a.id).isActive).toBe(false);
    expect(getGlobalPageById(b.id).isActive).toBe(true);
    expect(getActiveGlobalPages('FOOTER').map((e) => e.id)).toEqual([b.id]);
  });

  test('PAGE navigations are always active and coexist freely', () => {
    const a = saveGlobalPage({ name: `${PREFIX}page-a`, role: 'PAGE', code: 'a', isActive: false });
    const b = saveGlobalPage({ name: `${PREFIX}page-b`, role: 'PAGE', code: 'b', isActive: false });

    expect(a.isActive).toBe(true);
    expect(b.isActive).toBe(true);
    const activeIds = getActiveGlobalPages('PAGE').map((e) => e.id);
    expect(activeIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  test('WIDGET entries are always active and coexist freely', () => {
    const a = saveGlobalPage({ name: `${PREFIX}widget-a`, role: 'WIDGET', code: 'a', isActive: false });
    const b = saveGlobalPage({ name: `${PREFIX}widget-b`, role: 'WIDGET', code: 'b', isActive: false });

    expect(a.isActive).toBe(true);
    expect(b.isActive).toBe(true);
    const activeIds = getActiveGlobalPages('WIDGET').map((e) => e.id);
    expect(activeIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  test('different roles do not share exclusivity', () => {
    const footer = saveGlobalPage({ name: `${PREFIX}footer-z`, role: 'FOOTER', code: 'z', isActive: true });
    const main = saveGlobalPage({ name: `${PREFIX}main-z`, role: 'MAIN', code: 'z', isActive: true });

    expect(getGlobalPageById(footer.id).isActive).toBe(true);
    expect(getGlobalPageById(main.id).isActive).toBe(true);
  });

  test('id is preserved across a rename (update), and the old slug file is cleaned up', () => {
    const created = saveGlobalPage({ name: `${PREFIX}rename-before`, role: 'MAIN', code: 'v1', isActive: false });
    const renamed = saveGlobalPage({ id: created.id, name: `${PREFIX}rename-after`, code: 'v2' });

    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe(`${PREFIX}rename-after`);
    expect(renamed.code).toBe('v2');
    expect(renamed.role).toBe('MAIN'); // role is immutable on update, like the old stores

    const found = getGlobalPageById(created.id);
    expect(found.name).toBe(`${PREFIX}rename-after`);

    // Only one JSON file should exist for this id now.
    const dir = path.join(ROOT, 'main');
    const matches = fs.readdirSync(dir).filter((f) => {
      if (!f.endsWith('.json')) return false;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return meta.id === created.id;
    });
    expect(matches.length).toBe(1);
  });

  test('throws for an unknown role', () => {
    expect(() => saveGlobalPage({ name: `${PREFIX}bad`, role: 'BOGUS', code: 'x' })).toThrow();
  });
});
