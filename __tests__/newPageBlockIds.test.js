/**
 * prepareTreeForWrite (lib/pageConcurrency.js): neu angelegte Seiten (Duplikat, Import, API)
 * bekommen eigene Block-IDs – nur bestehende Seiten behalten ihre (ggf. bewusst geteilten) IDs.
 */
const { prepareTreeForWrite } = require('../lib/pageConcurrency');

const cta = () => ({ id: 'b_cta', children: [{ id: 'b_inner' }] });
const db = [{ id: 't1', slug: 'orig', blocks: [cta()], children: [{ id: 'c1', slug: 'sub', blocks: [cta()], children: [] }], data: {} }];

test('Duplikat (neue Top-Level-Seite ohne id) erbt keine Block-IDs', () => {
  const tree = [{ id: 't1', slug: 'orig', blocks: [cta()], children: db[0].children, data: {} }, { slug: 'orig-kopie', blocks: [cta()], children: [], data: {} }];
  prepareTreeForWrite(tree, db, null);
  expect(tree[0].blocks[0].id).toBe('b_cta');
  expect(tree[1].blocks[0].id).not.toBe('b_cta');
  expect(tree[1].blocks[0].children[0].id).not.toBe('b_inner');
});

test('neue Unterseite (id unbekannt) bekommt eigene Block-IDs, bestehende behält sie', () => {
  const tree = [{ id: 't1', slug: 'orig', blocks: [cta()], data: {}, children: [
    { id: 'c1', slug: 'sub', blocks: [cta()], children: [] },
    { id: 'tmp123', slug: 'sub-kopie', blocks: [cta()], children: [] },
  ] }];
  prepareTreeForWrite(tree, db, null);
  expect(tree[0].children[0].blocks[0].id).toBe('b_cta');
  expect(tree[0].children[1].blocks[0].id).not.toBe('b_cta');
});

test('Top-Level ohne id, aber bekannter Slug, gilt als bestehend (API-Clients ohne ids)', () => {
  const tree = [{ slug: 'orig', blocks: [cta()], children: [], data: {} }];
  prepareTreeForWrite(tree, db, null);
  expect(tree[0].blocks[0].id).toBe('b_cta');
});
