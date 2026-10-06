const { htmlToMd } = require('../lib/richTextNormalize');

describe('htmlToMd', () => {
  it('returns plain markdown/text unchanged', () => {
    expect(htmlToMd('**bold** and *italic*')).toBe('**bold** and *italic*');
  });

  it('returns empty/falsy input as an empty string', () => {
    expect(htmlToMd('')).toBe('');
    expect(htmlToMd(null)).toBe('');
    expect(htmlToMd(undefined)).toBe('');
  });

  it('converts legacy <strong>/<b> to **bold**', () => {
    expect(htmlToMd('<strong>bold</strong>')).toBe('**bold**');
    expect(htmlToMd('<b>bold</b>')).toBe('**bold**');
  });

  it('converts legacy <em>/<i> to *italic*', () => {
    expect(htmlToMd('<em>italic</em>')).toBe('*italic*');
    expect(htmlToMd('<i>italic</i>')).toBe('*italic*');
  });

  it('converts <del>/<s> to ~~strike~~', () => {
    expect(htmlToMd('<del>gone</del>')).toBe('~~gone~~');
    expect(htmlToMd('<s>gone</s>')).toBe('~~gone~~');
  });

  it('converts <a href> to [label](url)', () => {
    expect(htmlToMd('<a href="https://example.com">Link</a>')).toBe('[Link](https://example.com)');
  });

  it('converts <li> items to a dash-prefixed list', () => {
    expect(htmlToMd('<li>one</li><li>two</li>')).toBe('- one\n- two');
  });

  it('converts <p> boundaries to newline-separated text', () => {
    expect(htmlToMd('<p>first</p><p>second</p>')).toBe('first\nsecond');
  });

  it('strips unknown tags and decodes basic entities', () => {
    expect(htmlToMd('<span>a &lt; b &amp; b &gt; a</span>')).toBe('a < b & b > a');
  });

  it('collapses more than two consecutive newlines', () => {
    expect(htmlToMd('<p>a</p><br><br><br><p>b</p>')).toBe('a\n\nb');
  });
});
