const fs = require('fs');
const path = require('path');
const {
  listTemplates,
  getTemplateByName,
  saveTemplate,
  deleteTemplateByName,
} = require('../lib/templateStore');

// Uses a uniquely-prefixed name so a real, un-mocked filesystem can be
// touched safely — cleaned up in afterEach even if an assertion fails.
const TEST_BLOCK_NAME = '__jest_templateStore_block__';
const TEST_MASTER_NAME = '__jest_templateStore_master__';
const TEST_PREVIEW_NAME = '__jest_templateStore_preview__';

const ROOT = path.join(process.cwd(), 'public', 'assets');

function cleanup() {
  for (const name of [TEST_BLOCK_NAME]) {
    try { deleteTemplateByName(name); } catch (_e) {}
  }
  try { fs.rmSync(path.join(ROOT, 'template_blog', TEST_MASTER_NAME), { recursive: true, force: true }); } catch (_e) {}
}

describe('templateStore', () => {
  afterEach(cleanup);

  test('saves and reads a general block template', () => {
    saveTemplate({ name: TEST_BLOCK_NAME, code: '<p>hi</p>', type: 'BLOCK', blogRole: null, masterTemplateName: null });

    const filePath = path.join(ROOT, 'template', 'block', `${TEST_BLOCK_NAME}.html`);
    expect(fs.existsSync(filePath)).toBe(true);

    const found = getTemplateByName(TEST_BLOCK_NAME);
    expect(found).toMatchObject({ name: TEST_BLOCK_NAME, code: '<p>hi</p>', type: 'BLOCK', blogRole: null });

    expect(listTemplates().some((t) => t.name === TEST_BLOCK_NAME)).toBe(true);

    expect(deleteTemplateByName(TEST_BLOCK_NAME)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(getTemplateByName(TEST_BLOCK_NAME)).toBeNull();
  });

  test('master/preview roles map to a shared folder, derived from the path', () => {
    saveTemplate({ name: TEST_MASTER_NAME, code: '<h1>{{title}}</h1>', type: 'BLOCK', blogRole: 'master', masterTemplateName: null });
    saveTemplate({ name: TEST_PREVIEW_NAME, code: '<h2>{{title}}</h2>', type: 'BLOCK', blogRole: 'preview', masterTemplateName: TEST_MASTER_NAME });

    const masterPath = path.join(ROOT, 'template_blog', TEST_MASTER_NAME, '_master.html');
    const previewPath = path.join(ROOT, 'template_blog', TEST_MASTER_NAME, `${TEST_PREVIEW_NAME}.html`);
    expect(fs.existsSync(masterPath)).toBe(true);
    expect(fs.existsSync(previewPath)).toBe(true);

    const preview = getTemplateByName(TEST_PREVIEW_NAME);
    expect(preview.blogRole).toBe('preview');
    expect(preview.masterTemplateName).toBe(TEST_MASTER_NAME);

    const master = getTemplateByName(TEST_MASTER_NAME);
    expect(master.blogRole).toBe('master');
  });

  test('renaming moves the file and removes the old one', () => {
    saveTemplate({ name: TEST_BLOCK_NAME, code: '<p>v1</p>', type: 'BLOCK', blogRole: null, masterTemplateName: null });
    const oldPath = path.join(ROOT, 'template', 'block', `${TEST_BLOCK_NAME}.html`);
    expect(fs.existsSync(oldPath)).toBe(true);

    const renamed = `${TEST_BLOCK_NAME}_renamed`;
    saveTemplate({ name: renamed, code: '<p>v2</p>', type: 'BLOCK', blogRole: null, masterTemplateName: null }, TEST_BLOCK_NAME);

    expect(fs.existsSync(oldPath)).toBe(false);
    const newPath = path.join(ROOT, 'template', 'block', `${renamed}.html`);
    expect(fs.existsSync(newPath)).toBe(true);
    expect(getTemplateByName(TEST_BLOCK_NAME)).toBeNull();

    // cleanup the renamed file too (not covered by the shared cleanup() helper)
    deleteTemplateByName(renamed);
  });
});
