jest.mock('marked', () => ({ marked: { parse: (s) => s, parseInline: (s) => s, use: () => {}, setOptions: () => {} } })); // ESM-Paket unter Jest nicht ladbar
import { renderPage } from '../lib/templateEngine';

const forms = [{ name: 'Kontakt Einfach', code: '<form data-temgine-form="contact"><input name="msg"></form>' }];
const page = { blocks: [{ template: 'Wrap', props: {} }] };

describe('{{{contact:slug}}}', () => {
  it.each(['{{{contact:kontakt-einfach}}}', '{{contact:kontakt-einfach}}'])('bindet Formular ein: %s', (ph) => {
    const html = renderPage(page, { Wrap: `<section>${ph}</section>` }, { contactForms: forms });
    expect(html).toContain('<form data-temgine-form="contact">');
    expect(html).toContain('name="_cfTemplate" value="Kontakt Einfach"');
  });
  it('unbekannter Slug bleibt leer', () => {
    expect(renderPage(page, { Wrap: '<i>{{{contact:nix}}}</i>' }, { contactForms: forms })).toContain('<i></i>');
  });
});
