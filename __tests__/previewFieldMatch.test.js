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

  // Regression: ein Klick landet nicht immer exakt auf dem Element eines Felds — Zeilenabstand
  // oder Innenabstand führen dazu, dass e.target (und damit der übergebene "text") ein Vorfahre
  // ist, dessen Textinhalt mehrere Felder aneinanderhängt. Reproduziert mit genau dem Text, den
  // der interactScript in components/PageEditor.js in diesem Fall tatsächlich sendet.
  test('Aggregierter Vorfahren-Text (Klick im Zeilen-/Innenabstand statt exakt auf dem Feld-Element) → längster enthaltener Feldwert gewinnt', () => {
    const cardBlock = {
      props: {
        titel: 'Erste Karte',
        text: 'Ein bisschen Beschreibungstext.',
        punkte: [{ label: 'Preis', wert: '49€' }],
      },
    };
    const aggregated = 'Erste Karte\n  Ein bisschen Beschreibungstext.\n  \n    Preis - 49€';
    expect(findFieldForPreviewClick(cardBlock, { text: aggregated })).toBe('text');
  });

  test('Aggregierter Vorfahren-Text: unter mehreren enthaltenen Feldern gewinnt klar das längste (spezifischste)', () => {
    const cardBlock = { props: { titel: 'Überschrift der Karte', punkte: [{ label: 'Preis', wert: '49€' }] } };
    expect(findFieldForPreviewClick(cardBlock, { text: 'Überschrift der Karte\n  Preis - 49€' })).toBe('titel');
  });
});
