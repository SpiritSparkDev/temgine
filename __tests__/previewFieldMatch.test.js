const { findFieldForPreviewClick } = require('../lib/previewFieldMatch');

describe('findFieldForPreviewClick', () => {
  const block = {
    props: {
      title: 'Willkommen', titleText: 'Willkommen', bild: '/uploads/a.jpg', text: '<p>Hallo <b>Welt</b> hier</p>',
      items: [{ link: 'https://x.de', alt: 'Mastodon' }, { link: 'https://y.de', alt: 'GitHub' }],
    },
  };
  test('Text → Feld (Überschrift → ...Text)', () => expect(findFieldForPreviewClick(block, { text: 'Willkommen' })).toBe('titleText'));
  test('Bild-URL → Feld', () => expect(findFieldForPreviewClick(block, { src: 'http://h/uploads/a.jpg' })).toBe('bild'));
  test('Richtext-Teilstück → Feld', () => expect(findFieldForPreviewClick(block, { text: 'Welt hier' })).toBe('text'));
  test('Repeater-Zeile', () => expect(findFieldForPreviewClick(block, { text: 'GitHub' })).toBe('items.1.alt'));
  test('kein Treffer', () => expect(findFieldForPreviewClick(block, { text: 'zzz' })).toBe(''));
});
