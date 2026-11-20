/**
 * __tests__/pageTreeRepair.test.js
 * findSiblingSlugCollisions (lib/pageTreeRepair.js): gleicher Slug ist nur unter
 * DERSELBEN Elternseite eine Kollision – auch bei neuen Seiten ohne id.
 */

const { findSiblingSlugCollisions, findDuplicateBlockIds, reassignBlockId } = require('../lib/pageTreeRepair');

describe('findSiblingSlugCollisions', () => {
  test('same child slug under two different NEW top-level pages (no ids) is not a collision', () => {
    const tree = [
      { slug: 'team-a', title: 'Team A', children: [{ slug: 'lydia', title: 'Lydia A' }] },
      { slug: 'team-b', title: 'Team B', children: [{ slug: 'lydia', title: 'Lydia B' }] },
    ];
    expect(findSiblingSlugCollisions(tree)).toEqual([]);
  });

  test('same child slug under two different deeper parents is not a collision', () => {
    const tree = [
      { id: 'p1', slug: 'shows', children: [
        { slug: 'feuer', children: [{ slug: 'galerie' }] },
        { slug: 'licht', children: [{ slug: 'galerie' }] },
      ] },
    ];
    expect(findSiblingSlugCollisions(tree)).toEqual([]);
  });

  test('same slug under the same parent is a collision (with and without ids)', () => {
    expect(findSiblingSlugCollisions([
      { slug: 'team', children: [{ slug: 'lydia' }, { slug: 'lydia' }] },
    ]).map((c) => c.slug)).toEqual(['lydia']);

    expect(findSiblingSlugCollisions([
      { id: 't1', slug: 'team', children: [{ id: 'a', slug: 'lydia' }, { id: 'b', slug: 'lydia' }] },
    ]).map((c) => c.slug)).toEqual(['lydia']);
  });

  test('duplicate top-level slugs are a collision', () => {
    expect(findSiblingSlugCollisions([{ slug: 'home' }, { slug: 'home' }]).map((c) => c.slug)).toEqual(['home']);
  });
});

describe('geteilte Block-IDs', () => {
  const tree = [{ id: 't', slug: 'software', blocks: [], children: [
    { slug: 'a', blocks: [{ id: 'gf-project', children: [{ id: 'x' }] }] },
    { slug: 'b', blocks: [{ id: 'gf-project' }, { id: 'only-b' }] },
  ] }];

  test('meldet nur ids, die auf mehreren Seiten vorkommen', () => {
    const r = findDuplicateBlockIds(tree);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('gf-project');
    expect(r[0].occurrences.map((o) => o.slug)).toEqual(['a', 'b']);
  });

  test('reassignBlockId ändert nur die gewählte id, auch in Kindern', () => {
    const out = reassignBlockId([{ id: 'g', children: [{ id: 'g' }, { id: 'k' }] }], 'g', () => 'new');
    expect(out).toEqual([{ id: 'new', children: [{ id: 'new' }, { id: 'k' }] }]);
  });
});
