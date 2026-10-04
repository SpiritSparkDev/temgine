const bcrypt = require('bcryptjs');
const { hashPageAccessPasswords, stripPageAccessPasswords, findPageHashById } = require('../lib/pageAccessPassword');

describe('hashPageAccessPasswords', () => {
  test('hashes newAccessPassword into accessPasswordHash and removes the plaintext field', async () => {
    const node = { id: '1', newAccessPassword: 'geheim123' };
    await hashPageAccessPasswords(node);
    expect(node.newAccessPassword).toBeUndefined();
    expect(node.accessPasswordHash).toBeTruthy();
    expect(await bcrypt.compare('geheim123', node.accessPasswordHash)).toBe(true);
  });

  test('clearAccessPassword nulls the hash and removes the flag', async () => {
    const node = { id: '1', accessPasswordHash: 'old-hash', clearAccessPassword: true };
    await hashPageAccessPasswords(node);
    expect(node.accessPasswordHash).toBeNull();
    expect(node.clearAccessPassword).toBeUndefined();
  });

  test('leaves accessPasswordHash untouched when neither field is set', async () => {
    const node = { id: '1', title: 'Seite' };
    await hashPageAccessPasswords(node);
    expect('accessPasswordHash' in node).toBe(false);
  });

  test('recurses into nested children', async () => {
    const tree = { id: 'top', children: [{ id: 'nested', newAccessPassword: 'kinder-pw' }] };
    await hashPageAccessPasswords(tree);
    expect(tree.children[0].newAccessPassword).toBeUndefined();
    expect(await bcrypt.compare('kinder-pw', tree.children[0].accessPasswordHash)).toBe(true);
  });
});

describe('stripPageAccessPasswords', () => {
  test('replaces the raw hash with a boolean flag', () => {
    const node = { id: '1', accessPasswordHash: 'some-hash', title: 'x' };
    const stripped = stripPageAccessPasswords(node);
    expect(stripped.accessPasswordHash).toBeUndefined();
    expect(stripped.passwordProtected).toBe(true);
    expect(stripped.title).toBe('x');
  });

  test('passwordProtected is false when no hash is set', () => {
    const stripped = stripPageAccessPasswords({ id: '1', accessPasswordHash: null });
    expect(stripped.passwordProtected).toBe(false);
  });

  test('recurses into nested children', () => {
    const tree = { id: 'top', children: [{ id: 'nested', accessPasswordHash: 'hash' }] };
    const stripped = stripPageAccessPasswords(tree);
    expect(stripped.children[0].passwordProtected).toBe(true);
    expect(stripped.children[0].accessPasswordHash).toBeUndefined();
  });
});

describe('findPageHashById', () => {
  const tree = [
    { id: 'a', accessPasswordHash: 'hash-a', children: [{ id: 'a-1', accessPasswordHash: 'hash-a-1', children: [] }] },
    { id: 'b', accessPasswordHash: null, children: [] },
  ];

  test('finds a top-level page by id', () => {
    expect(findPageHashById(tree, 'a')).toBe('hash-a');
  });

  test('finds a nested page by id', () => {
    expect(findPageHashById(tree, 'a-1')).toBe('hash-a-1');
  });

  test('returns null for an unknown id', () => {
    expect(findPageHashById(tree, 'unknown')).toBeNull();
  });
});
