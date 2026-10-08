const { listHelpDocs, readHelpDoc } = require('../lib/helpDocs');

describe('helpDocs', () => {
  it('listet die Anleitungen aus help/ mit Titel, Templates zuerst', () => {
    const docs = listHelpDocs();
    expect(docs[0]).toEqual({ name: 'templates', title: 'Templates in Temgine' });
    expect(docs.map(d => d.name)).toEqual(expect.arrayContaining(['navigationen', 'picgine-galerien']));
  });

  it('liefert Markdown für bekannte Namen, null für alles andere (kein Pfad-Zugriff)', () => {
    expect(readHelpDoc('templates')).toContain('## Checkbox');
    expect(readHelpDoc('../package')).toBeNull();
    expect(readHelpDoc('..%2Fpackage')).toBeNull();
    expect(readHelpDoc('gibt-es-nicht')).toBeNull();
  });

  it('jede Überschrift, zu der die Kurzreferenz springt, existiert', () => {
    const md = readHelpDoc('templates');
    ['## Variablen', '### Gruppen', '## Checkbox', '## Select (Dropdown)', '## Bedingungen', '## Wiederholungen', '## Dateien eines Ordners'].forEach(h => {
      expect(md).toContain(h);
    });
  });
});
