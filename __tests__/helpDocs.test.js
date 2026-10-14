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

  it('liefert die Shop-Hilfe mit Webhook-URLs und Ereignissen', () => {
    expect(listHelpDocs().find(d => d.name === 'shop')).toEqual({ name: 'shop', title: 'Online-Shop (Add-on)' });
    const md = readHelpDoc('shop');
    ['/api/shop/webhooks/sumup', '/api/shop/webhooks/stripe', '/api/shop/webhooks/paypal', 'checkout.session.async_payment_failed', 'PAYMENT.CAPTURE.DENIED', 'Zahlungspflichtig bestellen'].forEach(t => expect(md).toContain(t));
  });

  it('jede Überschrift, zu der die Kurzreferenz springt, existiert', () => {
    const md = readHelpDoc('templates');
    ['## Variablen', '### Gruppen', '## Checkbox', '## Select (Dropdown)', '## Bedingungen', '## Wiederholungen', '## Dateien eines Ordners'].forEach(h => {
      expect(md).toContain(h);
    });
  });
});
