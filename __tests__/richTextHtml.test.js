jest.mock('marked', () => ({ marked: { parse: (s) => `<p>${s}</p>\n` } }));
const { toEditorHtml, fromEditorHtml } = require('../lib/richTextHtml');

describe('richTextHtml', () => {
  it('lässt HTML unverändert, wandelt Markdown/Text', () => {
    expect(toEditorHtml('<h2>A</h2><p>b</p>')).toBe('<h2>A</h2><p>b</p>');
    expect(toEditorHtml('text')).toBe('<p>text</p>\n');
    expect(toEditorHtml('')).toBe('');
  });

  it('erhält Leerzeilen als <p><br></p>', () => {
    expect(fromEditorHtml('<p>a</p><p></p><p></p><p>b</p>')).toBe('<p>a</p><p><br></p><p><br></p><p>b</p>');
    expect(fromEditorHtml('<p></p>')).toBe('');
  });
});
