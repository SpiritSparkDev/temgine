import { findSharedChanges, applyShared, countPlacements, findBlockById } from '../lib/sharedBlocks';
import { ensureBlockIds, duplicateBlock } from '../lib/blockTree';

const banner = (title, hidden) => ({ id: 'ban', template: 'Banner', props: { title }, children: [{ id: 'k1', template: 'Btn', props: { t: 'x' } }], ...(hidden ? { hidden } : {}) });

test('ensureBlockIds ergänzt nur fehlende IDs, gleiche IDs bleiben (geteilt)', () => {
  const b = ensureBlockIds([{ id: 'x' }, { id: 'x', children: [{}] }]);
  expect([b[0].id, b[1].id]).toEqual(['x', 'x']);
  expect(b[1].children[0].id).toMatch(/^b_/);
});

test('duplicateBlock erzeugt neue IDs (unabhängige Kopie)', () => {
  const r = duplicateBlock([banner('A')], '0');
  expect(r.blocks[1].id).not.toBe('ban');
  expect(r.blocks[1].children[0].id).not.toBe('k1');
});

test('Änderung wird in alle Stellen übernommen, inkl. Unterblöcken', () => {
  const before = [banner('A'), { id: 'o', template: 'T' }, banner('A')];
  const after = [banner('B'), { id: 'o', template: 'T' }, banner('A')];
  const changes = findSharedChanges(before, after);
  expect([...changes.keys()]).toEqual(['ban']);
  const r = applyShared(after, changes);
  expect(r.changed).toBe(true);
  expect(r.blocks[2].props.title).toBe('B');
  expect(r.blocks).toHaveLength(3);
});

test('Anzahl und Position der Stellen bleiben unberührt, hidden gilt je Stelle', () => {
  const other = [banner('A', true), banner('A')];
  const r = applyShared(other, new Map([['ban', banner('Neu')]]));
  expect(r.blocks).toHaveLength(2);
  expect(r.blocks[0]).toMatchObject({ hidden: true, props: { title: 'Neu' } });
  expect(r.blocks[1].hidden).toBeUndefined();
});

test('Löschen einer Stelle ist keine Änderung des geteilten Blocks', () => {
  const before = [banner('A'), banner('A')];
  const after = [banner('A')];
  expect(findSharedChanges(before, after).size).toBe(0);
});

test('hidden allein zählt nicht als Änderung', () => {
  expect(findSharedChanges([banner('A')], [banner('A', true)]).size).toBe(0);
});

test('countPlacements und findBlockById über den Seitenbaum', () => {
  const pages = [{ id: 'p1', blocks: [banner('A')], children: [{ id: 'p2', blocks: [banner('A')], children: [] }] }];
  expect(countPlacements(pages, [banner('A')], 'p1').get('ban')).toBe(2);
  expect(findBlockById('k1', [], pages).template).toBe('Btn');
});
