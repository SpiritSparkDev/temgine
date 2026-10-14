/**
 * __tests__/externFiles.test.js
 * lib/externFiles.js — gemeinsames Lesen/Schreiben der CSS-/JS-Manager-Dateien
 * für Projekttransfer-Export und -Import. Läuft gegen ein temporäres
 * Verzeichnis (root-Parameter), nie gegen public/ der Arbeitskopie.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadExternFiles, importExternFiles, mergeExternConfig, normalizeExternFilename } = require('../lib/externFiles');

let root;
const dirOf = (kind) => path.join(root, 'public', kind === 'js' ? 'extern_js' : 'extern_css');
const write = (kind, name, content) => {
  fs.mkdirSync(dirOf(kind), { recursive: true });
  fs.writeFileSync(path.join(dirOf(kind), name), content);
};
const order = (kind) => JSON.parse(fs.readFileSync(path.join(dirOf(kind), '.order.json'), 'utf-8')).order;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'temgine-extern-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('loadExternFiles', () => {
  test('returns files in .order.json order, unlisted files after, other extensions ignored', () => {
    write('js', 'b.js', 'B');
    write('js', 'a.js', 'A');
    write('js', 'c.js', 'C');
    write('js', 'notes.txt', 'x');
    write('js', '.order.json', JSON.stringify({ order: ['c.js', 'a.js', 'gone.js'] }));

    expect(loadExternFiles('js', root)).toEqual([
      { filename: 'c.js', content: 'C' },
      { filename: 'a.js', content: 'A' },
      { filename: 'b.js', content: 'B' },
    ]);
  });

  test('returns [] when the directory does not exist', () => {
    expect(loadExternFiles('css', root)).toEqual([]);
  });
});

describe('importExternFiles', () => {
  test('merge keeps existing files and appends new ones to the order', () => {
    write('js', 'keep.js', 'old');
    write('js', '.order.json', JSON.stringify({ order: ['keep.js'] }));

    const result = importExternFiles('js', [{ filename: 'tnt.js', content: 'new' }], 'merge', root);

    expect(result).toMatchObject({ imported: 1, errors: [], writtenFiles: ['tnt.js'] });
    expect(fs.readFileSync(path.join(dirOf('js'), 'keep.js'), 'utf-8')).toBe('old');
    expect(order('js')).toEqual(['keep.js', 'tnt.js']);
  });

  test('replace removes existing files of that kind and rewrites the order', () => {
    write('js', 'old.js', 'old');
    write('js', '.order.json', JSON.stringify({ order: ['old.js'] }));

    importExternFiles('js', [{ filename: 'b.js', content: 'B' }, { filename: 'a.js', content: 'A' }], 'replace', root);

    expect(fs.existsSync(path.join(dirOf('js'), 'old.js'))).toBe(false);
    expect(order('js')).toEqual(['b.js', 'a.js']);
  });

  test('normalizes names, strips directories and de-duplicates within one import', () => {
    const result = importExternFiles('js', [
      { filename: '../../etc/evil.js', content: '1' },
      { filename: 'menu', content: '2' },
      { filename: 'menu.js', content: '3' },
    ], 'merge', root);

    expect(result.writtenFiles).toEqual(['evil.js', 'menu.js', 'menu-2.js']);
    expect(fs.existsSync(path.join(root, 'etc'))).toBe(false);
  });
});

describe('normalizeExternFilename', () => {
  test('adds the extension and falls back for empty names', () => {
    expect(normalizeExternFilename('css', 'theme')).toBe('theme.css');
    expect(normalizeExternFilename('js', '')).toBe('script.js');
    expect(normalizeExternFilename('js', 'mein script.js')).toBe('mein_script.js');
  });
});

describe('mergeExternConfig', () => {
  test('unions disabled and merges JS categories per file (incoming wins)', () => {
    const merged = mergeExternConfig(
      { disabled: ['extern_js/a.js'], categories: { 'extern_js/a.js': 'statistics', 'extern_js/tnt.js': 'marketing' } },
      { disabled: ['extern_js/b.js'], categories: { 'extern_js/tnt.js': 'necessary' } },
    );
    expect(merged.disabled.sort()).toEqual(['extern_js/a.js', 'extern_js/b.js']);
    expect(merged.categories).toEqual({ 'extern_js/a.js': 'statistics', 'extern_js/tnt.js': 'necessary' });
  });

  test('CSS configs without categories stay without categories', () => {
    expect(mergeExternConfig({ disabled: ['x'] }, { disabled: ['y'] })).toEqual({ disabled: ['x', 'y'] });
  });
});
