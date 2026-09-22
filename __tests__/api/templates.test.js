/**
 * __tests__/api/templates.test.js
 * Tests scope filtering on GET /api/templates (normal vs. contact), which
 * backs both the generic Templates admin view and the dedicated
 * Kontaktformulare section.
 */

jest.disableAutomock();

const { saveTemplate, deleteTemplateByName } = require('../../lib/templateStore');

const handler = require('../../pages/api/templates').default;

const TEST_NORMAL_NAME = '__jest_api_templates_normal__';
const TEST_CONTACT_NAME = '__jest_api_templates_contact__';

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /api/templates scope filter', () => {
  beforeEach(() => {
    saveTemplate({ name: TEST_NORMAL_NAME, code: '<p>x</p>', type: 'BLOCK' });
    saveTemplate({ name: TEST_CONTACT_NAME, code: '<form></form>', type: 'BLOCK', category: 'contact' });
  });

  afterEach(() => {
    deleteTemplateByName(TEST_NORMAL_NAME);
    deleteTemplateByName(TEST_CONTACT_NAME);
  });

  test('scope=contact returns only contact-category templates', async () => {
    const req = { method: 'GET', query: { scope: 'contact', type: 'BLOCK' } };
    const res = makeRes();
    await handler(req, res);

    const [body] = res.json.mock.calls[0];
    const names = body.map((t) => t.name);
    expect(names).toContain(TEST_CONTACT_NAME);
    expect(names).not.toContain(TEST_NORMAL_NAME);
  });

  test('scope=normal excludes contact-category templates', async () => {
    const req = { method: 'GET', query: { scope: 'normal', type: 'BLOCK' } };
    const res = makeRes();
    await handler(req, res);

    const [body] = res.json.mock.calls[0];
    const names = body.map((t) => t.name);
    expect(names).toContain(TEST_NORMAL_NAME);
    expect(names).not.toContain(TEST_CONTACT_NAME);
  });

  test('no scope returns both (block-template dropdown in the page editor needs all of them)', async () => {
    const req = { method: 'GET', query: { type: 'BLOCK' } };
    const res = makeRes();
    await handler(req, res);

    const [body] = res.json.mock.calls[0];
    const names = body.map((t) => t.name);
    expect(names).toContain(TEST_NORMAL_NAME);
    expect(names).toContain(TEST_CONTACT_NAME);
  });
});
