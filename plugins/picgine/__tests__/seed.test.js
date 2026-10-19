/**
 * @jest-environment node
 *
 * seed.cjs: einmalige Aktivierungs-Migration (picgine_url gesetzt → plugin_picgine_enabled=true).
 */
const seed = require('../seed.cjs');

const fakePrisma = (rows) => {
  const map = new Map(Object.entries(rows));
  return {
    map,
    setting: {
      findUnique: async ({ where }) => (map.has(where.key) ? { key: where.key, value: map.get(where.key) } : null),
      create: async ({ data }) => { map.set(data.key, data.value); },
    },
  };
};

test('enables the plugin when picgine_url was set', async () => {
  const prisma = fakePrisma({ picgine_url: 'https://pics.example.com' });
  await expect(seed(prisma)).resolves.toEqual({ migrated: true });
  expect(prisma.map.get('plugin_picgine_enabled')).toBe('true');
});

test('does nothing without picgine_url (new plugin stays off)', async () => {
  for (const rows of [{}, { picgine_url: '  ' }]) {
    const prisma = fakePrisma(rows);
    await expect(seed(prisma)).resolves.toEqual({ migrated: false });
    expect(prisma.map.has('plugin_picgine_enabled')).toBe(false);
  }
});

test('is idempotent and never overrides an explicit choice', async () => {
  const prisma = fakePrisma({ picgine_url: 'https://pics.example.com', plugin_picgine_enabled: 'false' });
  await expect(seed(prisma)).resolves.toEqual({ migrated: false });
  expect(prisma.map.get('plugin_picgine_enabled')).toBe('false');
});
