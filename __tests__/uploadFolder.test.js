const fs = require('fs');
const path = require('path');
const os = require('os');

// lib/uploadFolder.js resolves UPLOAD_DIR from process.cwd() at import time, so point
// process.cwd() at a throwaway directory before requiring it — mirrors how this module
// is only ever used server-side against the real public/uploads/ tree.
let scratchRoot;
let originalCwd;

beforeAll(() => {
  scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uploadFolder-test-'));
  fs.mkdirSync(path.join(scratchRoot, 'public', 'uploads', 'produkte', 'bilder'), { recursive: true });
  fs.writeFileSync(path.join(scratchRoot, 'public', 'uploads', 'produkte', 'bilder', 'Sommer Kollektion.jpg'), 'x');
  fs.writeFileSync(path.join(scratchRoot, 'public', 'uploads', 'produkte', 'doc.pdf'), 'x');
  fs.mkdirSync(path.join(scratchRoot, 'public', 'uploads', 'leer'), { recursive: true });

  originalCwd = process.cwd;
  process.cwd = () => scratchRoot;
  jest.resetModules();
});

afterAll(() => {
  process.cwd = originalCwd;
  fs.rmSync(scratchRoot, { recursive: true, force: true });
});

describe('listFolderItemsRecursive', () => {
  it('lists files recursively including nested subfolders', () => {
    const { listFolderItemsRecursive } = require('../lib/uploadFolder');
    const items = listFolderItemsRecursive('produkte');
    const paths = items.map(i => i.path).sort();
    expect(paths).toEqual(['bilder/Sommer Kollektion.jpg', 'doc.pdf']);
  });

  it('derives name/slug/url/ext/isImage per item', () => {
    const { listFolderItemsRecursive } = require('../lib/uploadFolder');
    const items = listFolderItemsRecursive('produkte');
    const jpg = items.find(i => i.path === 'bilder/Sommer Kollektion.jpg');
    expect(jpg).toMatchObject({
      name: 'Sommer Kollektion.jpg',
      slug: 'sommer-kollektion',
      url: '/uploads/produkte/bilder/Sommer Kollektion.jpg',
      ext: 'jpg',
      isImage: true,
    });
    const pdf = items.find(i => i.path === 'doc.pdf');
    expect(pdf).toMatchObject({ name: 'doc.pdf', slug: 'doc', ext: 'pdf', isImage: false });
  });

  it('returns an empty array for an empty folder', () => {
    const { listFolderItemsRecursive } = require('../lib/uploadFolder');
    expect(listFolderItemsRecursive('leer')).toEqual([]);
  });

  it('returns an empty array for a non-existent folder', () => {
    const { listFolderItemsRecursive } = require('../lib/uploadFolder');
    expect(listFolderItemsRecursive('does-not-exist')).toEqual([]);
  });

  it('neutralizes a path-traversal attempt and returns no items outside UPLOAD_DIR', () => {
    const { listFolderItemsRecursive } = require('../lib/uploadFolder');
    expect(listFolderItemsRecursive('../../etc')).toEqual([]);
  });
});
