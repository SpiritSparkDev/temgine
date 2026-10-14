import { applyPostQuery, postQueryFromParams, collectTemplateFieldNames, todayIso, withDateParts } from '../lib/blogPostQuery';

const ev = (title, Beginn, Ende = '', extra = {}) => ({
  title, publishedAt: new Date(`${Beginn}T00:00:00Z`), templateData: { Beginn, Ende }, ...extra,
});

const events = [
  ev('Bundeskongress', '2027-04-22', '2027-04-24'),
  ev('Fachtagung', '2026-10-28', '2026-10-29'),
  ev('Sitzung (eintägig)', '2026-10-20'),
  ev('Vergangen', '2026-09-01', '2026-09-02'),
  ev('Läuft gerade', '2026-10-10', '2026-10-12'),
  ev('Archiviert', '2026-11-01', '', { archived: true }),
];
const titles = (list) => list.map(p => p.title);

describe('applyPostQuery', () => {
  test('Standard: Veröffentlichungsdatum absteigend, Archiv ausgeblendet', () => {
    expect(titles(applyPostQuery(events))).toEqual(['Bundeskongress', 'Fachtagung', 'Sitzung (eintägig)', 'Läuft gerade', 'Vergangen']);
  });

  test('nächste Termine: nach Beginn aufsteigend, nur ab heute (Ende, sonst Beginn)', () => {
    const list = applyPostQuery(events, { sort: 'Beginn', dir: 'asc', upcoming: 'Ende,Beginn', today: '2026-10-11' });
    expect(titles(list).slice(0, 4)).toEqual(['Läuft gerade', 'Sitzung (eintägig)', 'Fachtagung', 'Bundeskongress']);
  });

  test('vergangene Termine', () => {
    const list = applyPostQuery(events, { sort: 'Beginn', dir: 'desc', past: 'Ende,Beginn', today: '2026-10-11' });
    expect(titles(list)).toEqual(['Vergangen']);
  });

  test('Archiv: nur archivierte bzw. alle', () => {
    expect(titles(applyPostQuery(events, { archive: 'only' }))).toEqual(['Archiviert']);
    expect(applyPostQuery(events, { archive: 'include' })).toHaveLength(6);
  });

  test('leere Werte stehen in beiden Richtungen am Ende', () => {
    const list = applyPostQuery(events, { sort: 'Ende', dir: 'asc', archive: 'include' });
    expect(titles(list).slice(-2)).toEqual(['Sitzung (eintägig)', 'Archiviert']);
    const desc = applyPostQuery(events, { sort: 'Ende', dir: 'desc', archive: 'include' });
    expect(titles(desc).slice(-2)).toEqual(['Sitzung (eintägig)', 'Archiviert']);
  });

  test('Titel alphabetisch (deutsch, Umlaute)', () => {
    expect(titles(applyPostQuery(events, { sort: 'title', dir: 'asc' }))).toEqual(['Bundeskongress', 'Fachtagung', 'Läuft gerade', 'Sitzung (eintägig)', 'Vergangen']);
  });

  test('Zahlenfelder numerisch, Texte natürlich', () => {
    const posts = [{ title: 'a', templateData: { Nr: '10' } }, { title: 'b', templateData: { Nr: '9' } }, { title: 'c', templateData: { Nr: '100' } }];
    expect(titles(applyPostQuery(posts, { sort: 'Nr', dir: 'asc' }))).toEqual(['b', 'a', 'c']);
  });
});

describe('postQueryFromParams', () => {
  test('Kanal-Standard greift ohne eigene Angabe', () => {
    expect(postQueryFromParams({}, { sortField: 'Beginn', sortDir: 'asc' })).toMatchObject({ sort: 'Beginn', dir: 'asc', archive: 'exclude' });
    expect(postQueryFromParams({ sort: 'title', dir: 'desc' }, { sortField: 'Beginn', sortDir: 'asc' })).toMatchObject({ sort: 'title', dir: 'desc' });
    expect(postQueryFromParams({}, {})).toMatchObject({ sort: 'publishedAt', dir: 'desc' });
  });
});

describe('Hilfsfunktionen', () => {
  test('collectTemplateFieldNames', () => {
    expect(collectTemplateFieldNames(events)).toEqual(['Beginn', 'Ende']);
  });

  test('todayIso liefert JJJJ-MM-TT in deutscher Zeit', () => {
    expect(todayIso(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
  });

  test('withDateParts ergänzt Tag, Monat, Jahr und Datum', () => {
    expect(withDateParts({ Beginn: '2026-10-28', Ort: 'Kassel' })).toEqual({
      Beginn: '2026-10-28', Ort: 'Kassel',
      Beginn_tag: '28', Beginn_monat: 'Okt', Beginn_jahr: '2026', Beginn_datum: '28.10.2026',
    });
  });
});
