// marked ships ESM-only, which this repo's jest config doesn't transform
// (unrelated pre-existing gap — see __tests__/api/auth-admin-login.test.js
// for the same issue with next-auth). Stub it; our test data is already
// HTML, so mdToHtml's "already HTML" branch never actually calls marked.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { renderPage } = require('../lib/templateEngine');

describe('renderPage navigation slots', () => {
  const page = {
    title: 'Test',
    slug: 'test',
    blocks: [
      { template: 'Text', props: {} },
    ],
  };
  // {{{nav:mobile}}} must be in the template code itself — navHtml is merged
  // onto blockData before rendering, it isn't interpolated into prop values.
  const blockTemplates = { Text: '<div class="mobile-nav-slot">{{{nav:mobile}}}</div>' };

  it('renders {{{nav:mobile}}} when a mobile nav is provided', () => {
    const navigations = { mobile: { code: '<nav id="m">Mobile</nav>', data: {} } };
    const html = renderPage(page, blockTemplates, {}, navigations);
    expect(html).toContain('<nav id="m">Mobile</nav>');
  });

  it('renders an empty slot for {{{nav:mobile}}} when no mobile nav is configured', () => {
    const html = renderPage(page, blockTemplates, {}, {});
    expect(html).toContain('<div class="mobile-nav-slot"></div>');
  });
});

describe('renderPage HTML-value auto-upgrade (double → triple brace)', () => {
  it('still upgrades a plain {{key}} reference when its value contains HTML', () => {
    const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: { body: '<strong>bold</strong>' } }] };
    const blockTemplates = { Text: '<div>{{body}}</div>' };
    const html = renderPage(page, blockTemplates, {});
    // Unescaped: the raw <strong> tag must survive, not become &lt;strong&gt;
    expect(html).toContain('<div><strong>bold</strong></div>');
  });

  it('does not corrupt an already-triple {{{key}}} reference into {{{{key}}}}', () => {
    const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: { body: '<strong>bold</strong>' } }] };
    const blockTemplates = { Text: '<div>{{{body}}}</div>' };
    const html = renderPage(page, blockTemplates, {});
    expect(html).toContain('<div><strong>bold</strong></div>');
    expect(html).not.toContain('{{{');
    expect(html).not.toContain('}}}');
  });
});
