const { entryFromBlock, toPost, findBlockList } = require('../scripts/blocks-to-channel');

const opts = { blockTemplate: 'Download', titleField: 'Beschriftung', fileField: 'Datei', dateField: 'Datum', includeTextLinks: true };
const dl = (Beschriftung, Datei) => ({ type: 'Download', template: 'Download', props: { Beschriftung, Datei } });
const text = (Text) => ({ type: 'Text', template: 'Text', props: { Text } });

describe('blocks-to-channel', () => {
  test('Download-Block → Beitrag mit Datum, Titel ohne Datum, eindeutigem Slug', () => {
    const e = entryFromBlock(dl('4\\. Newsletter (26.05.2026)', '/uploads/downloads/2026/06/nl.pdf'), opts);
    expect(e).toEqual({ label: '4. Newsletter (26.05.2026)', file: '/uploads/downloads/2026/06/nl.pdf' });
    expect(toPost(e, opts)).toEqual({
      title: '4. Newsletter',
      slug: '4-newsletter-2026-05-26',
      date: '2026-05-26',
      templateData: { Datum: '2026-05-26', Datei: '/uploads/downloads/2026/06/nl.pdf' },
    });
  });

  test('verunglückte Link-Zeilen aus Text-Blöcken werden erkannt', () => {
    expect(entryFromBlock(text('4**[. Newsletter (06.06.2023)](/uploads/a.pdf)**'), opts))
      .toEqual({ label: '4. Newsletter (06.06.2023)', file: '/uploads/a.pdf' });
    expect(entryFromBlock(text('2[**. Newsletter (26.03.2023)**](/uploads/b.pdf)'), opts))
      .toEqual({ label: '2. Newsletter (26.03.2023)', file: '/uploads/b.pdf' });
  });

  test('Fließtext und Text ohne Link bleiben unangetastet', () => {
    expect(entryFromBlock(text('Liebe Mitglieder,\n\nhier finden Sie den neuesten Newsletter.'), opts)).toBeNull();
    expect(entryFromBlock(text('Mehr unter [Link A](/a) und [Link B](/b).'), opts)).toBeNull();
    expect(entryFromBlock(text('[x](/a.pdf)'), { ...opts, includeTextLinks: false })).toBeNull();
  });

  test('ohne Datum: kein Datum, Titel bleibt', () => {
    expect(toPost({ label: 'Sonderausgabe', file: '/x.pdf' }, opts)).toMatchObject({ title: 'Sonderausgabe', date: null, slug: 'sonderausgabe' });
  });

  test('findet die Blockliste im Seitenrahmen', () => {
    const inner = [text('Intro'), dl('1\\. Newsletter (02.02.2021)', '/a.pdf'), dl('2\\. Newsletter (04.02.2021)', '/b.pdf')];
    const blocks = [{ type: 'Seitenrahmen', template: 'Seitenrahmen', props: {}, children: inner }];
    expect(findBlockList(blocks, opts)).toBe(inner);
  });
});
