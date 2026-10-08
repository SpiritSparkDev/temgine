// Stub mimics marked for plain text: wraps in <p> and entity-escapes "&".
jest.mock('marked', () => ({ marked: { parse: (s) => '<p>' + s.replace(/&/g, '&amp;') + '</p>\n', setOptions: () => {} } }));

const { renderTemplate } = require('../lib/templateEngine');

describe('renderTemplate: plain text entities', () => {
  it('escapes & exactly once (no "&amp;amp;")', () => {
    expect(renderTemplate('<h1>{{title}}</h1>', { title: 'Feuershows & Lichtshows' })).toBe('<h1>Feuershows &amp; Lichtshows</h1>');
  });

  it('does not double-escape a value the admin already saved entity-escaped', () => {
    expect(renderTemplate('<h1>{{title}}</h1>', { title: 'Feuershows &amp; Lichtshows' })).toBe('<h1>Feuershows &amp; Lichtshows</h1>');
  });

  it('keeps stored &lt;script&gt; as visible text, never as markup', () => {
    expect(renderTemplate('<p>{{t}}</p>', { t: '&lt;script&gt;x&lt;/script&gt;' })).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });
});
