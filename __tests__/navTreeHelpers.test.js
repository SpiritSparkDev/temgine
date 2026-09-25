const { findChildPagesById } = require('../lib/navTreeHelpers');

const TREE = [
  {
    id: 'top-1',
    slug: 'ueber-uns',
    children: [
      { id: 'child-1', slug: 'ueber-uns/team', children: [] },
      { id: 'child-2', slug: 'ueber-uns/geschichte', children: [] },
    ],
  },
  {
    id: 'top-2',
    slug: 'leistungen',
    children: [
      {
        id: 'grandchild-parent',
        slug: 'leistungen/beratung',
        children: [
          { id: 'grandchild-1', slug: 'leistungen/beratung/erstgespraech', children: [] },
        ],
      },
    ],
  },
];

describe('findChildPagesById', () => {
  it('returns the direct children of a top-level page', () => {
    const result = findChildPagesById(TREE, 'top-1');
    expect(result.map((n) => n.id)).toEqual(['child-1', 'child-2']);
  });

  it('finds a deeply nested page and returns its children', () => {
    const result = findChildPagesById(TREE, 'grandchild-parent');
    expect(result.map((n) => n.id)).toEqual(['grandchild-1']);
  });

  it('returns an empty array for a leaf page (no children)', () => {
    expect(findChildPagesById(TREE, 'child-1')).toEqual([]);
  });

  it('returns an empty array when the id is not found anywhere in the tree', () => {
    expect(findChildPagesById(TREE, 'does-not-exist')).toEqual([]);
  });

  it('returns an empty array for a falsy id (e.g. homepage lookup with no id yet)', () => {
    expect(findChildPagesById(TREE, undefined)).toEqual([]);
    expect(findChildPagesById(TREE, '')).toEqual([]);
  });

  it('does not throw on an empty tree', () => {
    expect(findChildPagesById([], 'top-1')).toEqual([]);
  });
});
