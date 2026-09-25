const { findRawPageNodeByPath, findRawPageNodeById } = require('../lib/navTreeHelpers');

// Roh, wie von /api/pages kommend — inkl. Entwürfe, kein Filtern. Absichtlich
// mit einer fehlenden/leeren id auf einem verschachtelten Knoten, wie es bei
// älteren/importierten Unterseiten vorkommen kann (siehe navTreeHelpers.js).
const RAW_TREE = [
  {
    id: 'top-1',
    slug: 'ueber-uns',
    status: 'PUBLISHED',
    children: [
      { id: 'child-1', slug: 'team', status: 'PUBLISHED', children: [] },
      { id: '', slug: 'geschichte', status: 'PUBLISHED', children: [] }, // fehlende id
    ],
  },
  {
    id: 'top-2',
    slug: 'leistungen',
    status: 'DRAFT', // z. B. eine noch unveröffentlichte Seite, die gerade in Vorschau betrachtet wird
    children: [
      {
        id: 'grandchild-parent',
        slug: 'beratung',
        status: 'PUBLISHED',
        children: [
          { id: 'grandchild-1', slug: 'erstgespraech', status: 'PUBLISHED', children: [] },
        ],
      },
    ],
  },
];

describe('findRawPageNodeByPath', () => {
  it('finds a top-level page by its own slug', () => {
    const result = findRawPageNodeByPath(RAW_TREE, 'ueber-uns');
    expect(result.node.id).toBe('top-1');
    expect(result.parentPath).toBe('ueber-uns');
  });

  it('finds a nested page by its full cumulated slug path', () => {
    const result = findRawPageNodeByPath(RAW_TREE, 'leistungen/beratung');
    expect(result.node.id).toBe('grandchild-parent');
    expect(result.parentPath).toBe('leistungen/beratung');
  });

  it('finds a page even when it is itself a DRAFT (not just its children)', () => {
    const result = findRawPageNodeByPath(RAW_TREE, 'leistungen');
    expect(result.node.status).toBe('DRAFT');
  });

  it('finds a nested page even without a usable id (path is authoritative, not id)', () => {
    const result = findRawPageNodeByPath(RAW_TREE, 'ueber-uns/geschichte');
    expect(result.node.slug).toBe('geschichte');
  });

  it('ignores a leading/trailing slash on the target path', () => {
    expect(findRawPageNodeByPath(RAW_TREE, '/ueber-uns/team/').node.id).toBe('child-1');
  });

  it('returns null for an empty or root path', () => {
    expect(findRawPageNodeByPath(RAW_TREE, '')).toBeNull();
    expect(findRawPageNodeByPath(RAW_TREE, '/')).toBeNull();
  });

  it('returns null when the path is not found anywhere in the tree', () => {
    expect(findRawPageNodeByPath(RAW_TREE, 'does/not/exist')).toBeNull();
  });

  it('does not throw on an empty tree', () => {
    expect(findRawPageNodeByPath([], 'ueber-uns')).toBeNull();
  });
});

describe('findRawPageNodeById', () => {
  it('finds a top-level page and reports its own (root) parentPath', () => {
    const result = findRawPageNodeById(RAW_TREE, 'top-1');
    expect(result.node.id).toBe('top-1');
    expect(result.parentPath).toBe('ueber-uns');
  });

  it('finds a nested page and computes its full cumulated slug path', () => {
    const result = findRawPageNodeById(RAW_TREE, 'grandchild-parent');
    expect(result.parentPath).toBe('leistungen/beratung');
  });

  it('finds a page even when it is itself a DRAFT', () => {
    const result = findRawPageNodeById(RAW_TREE, 'top-2');
    expect(result.node.status).toBe('DRAFT');
  });

  it('returns null when the id is not found anywhere in the tree', () => {
    expect(findRawPageNodeById(RAW_TREE, 'does-not-exist')).toBeNull();
  });

  it('returns null for a falsy id', () => {
    expect(findRawPageNodeById(RAW_TREE, undefined)).toBeNull();
    expect(findRawPageNodeById(RAW_TREE, '')).toBeNull();
  });

  it('does not throw on an empty tree', () => {
    expect(findRawPageNodeById([], 'top-1')).toBeNull();
  });
});
