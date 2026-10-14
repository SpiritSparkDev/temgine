import { diffBlocks, diffFields, blockSearchText } from '../lib/blockDiff';

test('diffBlocks: hinzugefügt, entfernt, geändert', () => {
  const a = [{ template: 'hero', props: { t: 'A' } }, { template: 'text', props: { t: 'x' } }];
  const b = [{ template: 'hero', props: { t: 'B' } }];
  const r = diffBlocks(a, b);
  expect(r.map((x) => x.status)).toEqual(['changed', 'removed']);
  expect(r[0].fields).toEqual([{ key: 't', old: 'A', new: 'B' }]);
  expect(diffBlocks([], b)[0].status).toBe('added');
  expect(diffBlocks(b, b)[0].status).toBe('same');
});

test('diffBlocks: Pairing über id bei Umsortierung', () => {
  const a = [{ id: 1, template: 'x', props: {} }, { id: 2, template: 'y', props: {} }];
  expect(diffBlocks(a, [a[1], a[0]]).every((x) => x.status === 'same')).toBe(true);
});

test('diffFields und blockSearchText', () => {
  expect(diffFields({ template: 'a', props: { k: 1 } }, { template: 'b', props: { k: 1 } })[0].key).toBe('Template');
  expect(blockSearchText({ template: 'Hero', props: { t: '<b>Hallo</b> Welt' }, children: [{ props: { z: 'Tief' } }] })).toContain('hallo');
  expect(blockSearchText({ props: { z: 1 }, children: [{ props: { z: 'Tief' } }] })).toContain('tief');
});
