/**
 * @jest-environment jsdom
 */
const { buildPayloadFromForm } = require('../lib/contactFormRuntime');

function makeForm(html) {
  document.body.innerHTML = `<form>${html}</form>`;
  return document.querySelector('form');
}

describe('buildPayloadFromForm', () => {
  test('collects simple named fields into a flat object', () => {
    const form = makeForm(`
      <input name="name" value="Max Mustermann">
      <input name="email" value="max@example.com">
      <textarea name="nachricht">Hallo!</textarea>
    `);

    expect(buildPayloadFromForm(form)).toEqual({
      name: 'Max Mustermann',
      email: 'max@example.com',
      nachricht: 'Hallo!',
    });
  });

  test('merges checked checkboxes sharing a name into an array', () => {
    const form = makeForm(`
      <input type="checkbox" name="anliegen" value="Stil" checked>
      <input type="checkbox" name="anliegen" value="Budget" checked>
      <input type="checkbox" name="anliegen" value="Beratung">
    `);

    expect(buildPayloadFromForm(form)).toEqual({ anliegen: ['Stil', 'Budget'] });
  });

  test('ignores fields without a name attribute', () => {
    const form = makeForm(`
      <input value="no-name">
      <input name="email" value="max@example.com">
    `);

    expect(buildPayloadFromForm(form)).toEqual({ email: 'max@example.com' });
  });
});
