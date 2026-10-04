const { BACKUP_CATEGORIES, BACKUP_CATEGORY_KEYS, parseBackupCategories } = require('../lib/backupCategories');

describe('BACKUP_CATEGORIES', () => {
  test('every category has a unique key, label and group', () => {
    const keys = new Set();
    for (const cat of BACKUP_CATEGORIES) {
      expect(typeof cat.key).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(typeof cat.group).toBe('string');
      expect(keys.has(cat.key)).toBe(false);
      keys.add(cat.key);
    }
  });

  test('includes the new blog category', () => {
    expect(BACKUP_CATEGORY_KEYS).toContain('blog');
  });
});

describe('parseBackupCategories', () => {
  test('defaults to every category when omitted', () => {
    const result = parseBackupCategories(undefined);
    expect(result.size).toBe(BACKUP_CATEGORY_KEYS.length);
    for (const key of BACKUP_CATEGORY_KEYS) expect(result.has(key)).toBe(true);
  });

  test('parses a comma-separated subset', () => {
    const result = parseBackupCategories('pages,blog,snippets');
    expect(Array.from(result).sort()).toEqual(['blog', 'pages', 'snippets'].sort());
  });

  test('ignores unknown category keys', () => {
    const result = parseBackupCategories('pages,not-a-real-category');
    expect(Array.from(result)).toEqual(['pages']);
  });

  test('falls back to every category when the result would otherwise be empty', () => {
    const result = parseBackupCategories('not-a-real-category');
    expect(result.size).toBe(BACKUP_CATEGORY_KEYS.length);
  });

  test('falls back to every category for an empty string', () => {
    const result = parseBackupCategories('');
    expect(result.size).toBe(BACKUP_CATEGORY_KEYS.length);
  });
});
