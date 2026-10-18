import { canMove, moveBlock, duplicateBlock, flattenTree, filterPaths, ancestorPaths, getBlockAt, blockSummary } from '../lib/blockTree';
import { blockSearchText } from '../lib/blockDiff';

const mk = () => [
  { template: 'A', children: [{ template: 'A0' }, { template: 'A1', children: [{ template: 'A1a' }] }] },
  { template: 'B' },
  { template: 'C', children: [{ template: 'C0' }] },
];
const names = (items) => items.map((b) => (b.children ? `${b.template}[${names(b.children)}]` : b.template)).join(',');

test('getBlockAt / ancestorPaths', () => {
  expect(getBlockAt(mk(), '0.1.0').template).toBe('A1a');
  expect(getBlockAt(mk(), '5')).toBeNull();
  expect(ancestorPaths('0.1.0')).toEqual(['0', '0.1']);
});

test('canMove verhindert Zyklen und ungültige Ziele', () => {
  const b = mk();
  expect(canMove(b, '0', '0', 'inside')).toBe(false);
  expect(canMove(b, '0', '0.1.0', 'before')).toBe(false);
  expect(canMove(b, '0', '1', 'after')).toBe(true);
  expect(canMove(b, '0', '9', 'after')).toBe(false);
  expect(canMove(b, '0.1', '0', 'inside')).toBe(true); // eigener Vorfahre ist erlaubt
  expect(canMove(b, '1', '0.10', 'after')).toBe(false);
});

test('moveBlock: Geschwister davor/dahinter, Quelle unverändert', () => {
  const b = mk();
  const before = JSON.stringify(b);
  expect(names(moveBlock(b, '0', '2', 'after').blocks)).toBe('B,C[C0],A[A0,A1[A1a]]');
  expect(moveBlock(b, '0', '2', 'after').path).toBe('2');
  expect(moveBlock(b, '2', '0', 'before').path).toBe('0');
  expect(moveBlock(b, '2', '1', 'before').path).toBe('1');
  expect(JSON.stringify(b)).toBe(before);
});

test('moveBlock: verschachteln (inside) mit Indexkorrektur', () => {
  const r = moveBlock(mk(), '0', '2', 'inside'); // Ziel C rückt auf Index 1
  expect(names(r.blocks)).toBe('B,C[C0,A[A0,A1[A1a]]]');
  expect(r.path).toBe('1.1');
  const r2 = moveBlock(mk(), '1', '0.1', 'inside');
  expect(names(r2.blocks)).toBe('A[A0,A1[A1a,B]],C[C0]');
  expect(r2.path).toBe('0.1.1');
});

test('moveBlock: entschachteln', () => {
  const r = moveBlock(mk(), '0.1.0', '1', 'after');
  expect(names(r.blocks)).toBe('A[A0,A1[]],B,A1a,C[C0]');
  expect(r.path).toBe('2');
  const r2 = moveBlock(mk(), '0.1', '2', 'before');
  expect(names(r2.blocks)).toBe('A[A0],B,A1[A1a],C[C0]');
  expect(r2.path).toBe('2');
});

test('moveBlock: no-op und Zyklus liefern null', () => {
  expect(moveBlock(mk(), '1', '0', 'after')).toBeNull(); // bleibt an Index 1
  expect(moveBlock(mk(), '1', '2', 'before')).toBeNull();
  expect(moveBlock(mk(), '0', '0.1', 'inside')).toBeNull();
});

test('duplicateBlock', () => {
  const r = duplicateBlock(mk(), '0.1');
  expect(names(r.blocks)).toBe('A[A0,A1[A1a],A1[A1a]],B,C[C0]');
  expect(r.path).toBe('0.2');
  expect(duplicateBlock(mk(), '9')).toBeNull();
});

test('flattenTree: Tiefe, Linien-Info, Einklappen', () => {
  const rows = flattenTree(mk());
  expect(rows.map((r) => r.path)).toEqual(['0', '0.0', '0.1', '0.1.0', '1', '2', '2.0']);
  const a1a = rows.find((r) => r.path === '0.1.0');
  expect(a1a.depth).toBe(2);
  expect(a1a.guides).toEqual([true, false]); // A hat Nachfolger, A1 ist letztes Kind
  expect(flattenTree(mk(), new Set(['0'])).map((r) => r.path)).toEqual(['0', '1', '2', '2.0']);
  expect(flattenTree(mk(), new Set(['0'])).find((r) => r.path === '0').expanded).toBe(false);
});

test('filterPaths: Treffer plus Vorfahren, nur eigener Text', () => {
  const v = filterPaths(mk(), 'a1a', blockSearchText);
  expect([...v].sort()).toEqual(['0', '0.1', '0.1.0']);
  expect(filterPaths(mk(), '', blockSearchText)).toBeNull();
  expect(flattenTree(mk(), new Set(), v).map((r) => r.path)).toEqual(['0', '0.1', '0.1.0']);
});

test('blockSummary überspringt URLs', () => {
  expect(blockSummary({ props: { img: '/uploads/a.jpg', t: '<b>Hallo</b> Welt' } })).toBe('Hallo Welt');
});
