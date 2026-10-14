/**
 * __tests__/pageTreeRepair.test.js
 * findSiblingSlugCollisions (lib/pageTreeRepair.js): gleicher Slug ist nur unter
 * DERSELBEN Elternseite eine Kollision – auch bei neuen Seiten ohne id.
 */

const { findSiblingSlugCollisions } = require('../lib/pageTreeRepair');

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
