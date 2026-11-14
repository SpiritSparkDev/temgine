import { applyPostQuery, postQueryFromParams, collectTemplateFieldNames, collectTemplateFieldTypes, detectValueType, templateSortOptions, todayIso, withDateParts } from '../lib/blogPostQuery';

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

describe('Datentypen für die Sortierauswahl', () => {
  test('detectValueType', () => {
    expect(detectValueType('2026-10-30')).toBe('Datum');
    expect(detectValueType('14:00 Uhr')).toBe('Uhrzeit');
    expect(detectValueType('15.30 Uhr')).toBe('Uhrzeit');
    expect(detectValueType('42')).toBe('Zahl');
    expect(detectValueType('30.10.2026')).toBe('Text');
  });
  test('collectTemplateFieldTypes nennt bei gemischten Werten alle Typen, häufigsten zuerst', () => {
    const posts = [
      { templateData: { Beginn: '2026-01-01', Ort: 'Halle' } },
      { templateData: { Beginn: '2026-02-01' } },
      { templateData: { Beginn: '15.30 Uhr', Ende: '' } },
    ];
    expect(collectTemplateFieldTypes(posts)).toEqual({ Beginn: 'Datum, Uhrzeit', Ort: 'Text' });
  });
});

describe('Teilfelder zusammengesetzter Werte', () => {
  const posts = [
    { title: 'a', templateData: { Beginn: '2026-10-30 14:00' } },
    { title: 'b', templateData: { Beginn: '2026-11-02T09:30' } },
    { title: 'c', templateData: { Beginn: '2026-10-31 08:15' } },
  ];
  test('Typ „Datum + Uhrzeit“ und Auswahlzeilen mit Teilen', () => {
    expect(detectValueType('2026-10-30 14:00')).toBe('Datum + Uhrzeit');
    const types = collectTemplateFieldTypes(posts);
    expect(templateSortOptions(['Beginn'], types).map(o => o.value)).toEqual(['Beginn', 'Beginn@datum', 'Beginn@uhrzeit']);
  });
  test('Sortierung nach Datum bzw. Uhrzeit allein', () => {
    expect(applyPostQuery(posts, { sort: 'Beginn@datum', dir: 'asc' }).map(p => p.title)).toEqual(['a', 'c', 'b']);
    expect(applyPostQuery(posts, { sort: 'Beginn@uhrzeit', dir: 'asc' }).map(p => p.title)).toEqual(['c', 'b', 'a']);
  });
  test('Uhrzeit-Teil normalisiert „9.05 Uhr“ und ignoriert reine Daten', () => {
    const p = [{ title: 'x', templateData: { T: '9.05 Uhr' } }, { title: 'y', templateData: { T: '2026-01-01' } }];
    expect(applyPostQuery(p, { sort: 'T@uhrzeit', dir: 'asc' }).map(q => q.title)).toEqual(['x', 'y']);
  });
});
