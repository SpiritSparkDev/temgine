// Legt Beispiel-Seiten mit Inhalt an (idempotent, Upsert per Slug). Nutzt vorhandene Block-Templates.
// Aufruf: docker compose -f docker-compose.dev.yml exec app node scripts/seed-example-pages.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const block = (template, props) => ({ type: 'content', template, props, children: [] });
const h2 = (title) => block('H2 Header', { title });
const box = (title, text) => block('Header+Textboxes', { title, text });
const text = (title, html) => block('text', { 'Titel Der Unterseite': title, Text: html });
const page = (slug, title, blocks, children = []) => ({ id: slug, slug, title, template: 'default', status: 'PUBLISHED', blocks, children, data: {} });

// ---- Härtefall-Templates ("Beispiel …", public/assets/template/block) ----
const IMG = '/uploads/images/P15/paper.jpg';
const lorem = (n) => Array.from({ length: n }, (_, i) => `<p>Absatz ${i + 1}: Lorem ipsum dolor sit amet, <strong>consetetur</strong> sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat.</p>`).join('');
const hero = (extra = {}) => block('Beispiel Hero komplex', {
  Klasse: 'is-wide has-overlay', Anker: 'hero', Hintergrundfarbe: '#1f2937', Textfarbe: '#f9fafb', Innenabstand: '96', 'Innen-Klasse': 'container container--narrow',
  Hintergrundbild: IMG, Logo: IMG, 'Logo-Alt': 'Firmenlogo', Hauptbild: IMG, 'Hauptbild-Alt': 'Teamfoto im Büro',
  Eyebrow: 'Seit 2015', Titel: 'Webseiten mit Haltung', Untertitel: 'Gestaltung, Entwicklung und Betreuung aus einer Hand',
  Einleitung: '<p>Wir begleiten kleine und mittlere Unternehmen von der <em>ersten Idee</em> bis zum laufenden Betrieb.</p>',
  'Button1-Text': 'Projekt anfragen', 'Button1-Link': '/kontakt', 'Button1-Klasse': 'btn--large', 'Button1-Target': '_self', 'Button2-Text': 'Referenzen', 'Button2-Link': '/leistungen', 'Button2-Klasse': 'btn--ghost',
  Fakten: [
    { 'fakt-klasse': 'fact--highlight', zahl: '120', beschriftung: 'Projekte', fussnote: 'seit 2015' },
    { 'fakt-klasse': '', zahl: '9', beschriftung: 'Mitarbeitende', fussnote: 'inkl. Werkstudenten' },
    { 'fakt-klasse': '', zahl: '98', beschriftung: '% Weiterempfehlung', fussnote: 'Umfrage 2025' },
  ],
  Datum: '2026-09-30', 'Quelle-Link': 'https://example.com/studie', 'Quelle-Text': 'Kundenumfrage 2025', ...extra,
});
const container = (title, children, extra = {}) => ({ ...block('Beispiel Container', {
  Klasse: 'section--padded', Variante: 'light', Anker: '', Hintergrundfarbe: '#f3f4f6', 'Abstand-oben': '48', 'Abstand-unten': '48', 'Maximale-Breite': '1100', 'Inhalt-Klasse': 'stack',
  Titel: title, Einleitung: 'Kurze Einleitung zu diesem Abschnitt.', Fusszeile: 'Stand: Oktober 2026', ...extra,
}), children });
const features = (title, n) => block('Beispiel Feature-Raster', {
  Klasse: 'features--cards', Spalten: '3', Hintergrundfarbe: '#ffffff', Titel: title, Einleitung: '<p>Alles, was Sie für einen <strong>starken Auftritt</strong> brauchen.</p>', Hinweis: 'Alle Preise zzgl. MwSt.',
  Features: Array.from({ length: n }, (_, i) => ({
    'karten-klasse': i % 2 ? 'feature--alt' : '', rahmenfarbe: i % 2 ? '#10b981' : '#3b82f6', icon: IMG, 'icon-alt': `Icon ${i + 1}`, badge: i === 0 ? 'Neu' : '',
    titel: `Leistung ${i + 1}`, text: `<p>Beschreibung zu Leistung ${i + 1} mit <em>Hervorhebung</em> und mehr Text für die Zeilenhöhe.</p>`,
    datum: `2026-0${(i % 9) + 1}-15`, preis: String(490 + i * 150), link: `/leistungen/leistung-${i + 1}`, 'link-text': 'Mehr erfahren',
  })),
});
const faq = (title, n) => block('Beispiel FAQ', {
  Klasse: 'faq--boxed', Titel: title,
  Fragen: Array.from({ length: n }, (_, i) => ({
    'frage-klasse': i === 0 ? 'is-open' : '', frage: `Häufige Frage Nummer ${i + 1}?`, antwort: lorem(2), geaendert: `2026-0${(i % 9) + 1}-01`, 'mehr-link': '/kontakt', 'mehr-text': 'Mehr dazu',
  })),
});
const tabs = () => block('Beispiel Tabs verschachtelt', {
  Klasse: 'tabs--vertical', Titel: 'Verschachtelte Wiederholungen (Härtefall)',
  Tabs: ['Planung', 'Umsetzung', 'Betrieb'].map((t, i) => ({
    'tab-klasse': i === 0 ? 'is-active' : '', 'tab-titel': t, 'tab-intro': `Intro für ${t}`,
    // Verschachtelte Liste: im Editor nicht als Liste editierbar (Härtefall), wird aber gerendert
    Punkte: [1, 2, 3].map((k) => ({ 'punkt-klasse': '', 'punkt-link': `/${t.toLowerCase()}/${k}`, 'punkt-titel': `${t} ${k}`, 'punkt-text': 'Kurzbeschreibung' })),
  })),
});
const article = (n, extra = {}) => block('Beispiel Artikel', {
  Klasse: 'article--wide', Rubrik: 'Magazin', Datum: `2026-09-${10 + n}`, Autor: 'Clara Beispiel', Überschrift: `Artikel ${n}: Was moderne Webseiten leisten müssen`,
  Teaser: 'Ein langer Teaser-Text, der zwei Zeilen füllen soll, damit das Layout geprüft werden kann.', Bild: IMG, 'Bild-Alt': 'Titelbild', Bildunterschrift: 'Ein Blick hinter die Kulissen', Fotograf: 'Ben Beispiel',
  Text: lorem(4), 'Info-Titel': 'Gut zu wissen', 'Info-Text': '<ul><li>Punkt eins</li><li>Punkt zwei</li></ul>', 'Info-Link': '/kontakt', 'Info-Link-Text': 'Beratung buchen', Tags: 'Web, Design, SEO', Lesezeit: '6', ...extra,
});
const gallery = () => block('Beispiel Galerie Ordner', { Klasse: 'gallery--masonry', Titel: 'Galerie', Abstand: '12', Bilder: 'images/P15', Beschreibung: 'Bilder aus dem Upload-Ordner (Ordnerfeld).' });

const showcase = page('showcase', 'Showcase (Härtefälle)', [
  hero(),
  h2('Abschnitt 1 – Leistungen'),
  container('Unsere Leistungen', [
    features('Was wir bieten', 9),
    container('Verschachtelt (Ebene 2)', [
      text('Text in Ebene 2', lorem(2)),
      container('Noch tiefer (Ebene 3)', [box('Box in Ebene 3', 'Tief verschachtelter Inhalt'), article(1)]),
    ], { Variante: 'dark', Hintergrundfarbe: '#e5e7eb' }),
  ]),
  h2('Abschnitt 2 – Hilfe'),
  faq('Häufige Fragen', 10),
  tabs(),
  h2('Abschnitt 3 – Magazin'),
  article(2),
  article(3, { Rubrik: 'Praxis' }),
  gallery(),
  container('Kontakt', [box('Schreiben Sie uns', 'kontakt@example.com · Musterstraße 1 · 12345 Musterstadt'), hero({ Titel: 'Zweiter Hero', Fakten: [] })]),
  text('Schlusstext', lorem(5)),
]);


const pages = [
  page('home', 'Startseite', [
    h2('Willkommen bei Beispiel GmbH'),
    box('Webseiten, die funktionieren', 'Wir gestalten und betreuen Webseiten für kleine und mittlere Unternehmen – verständlich, schnell und pflegeleicht.'),
    block('Icon-Liste', {
      Titel: 'Hier finden Sie uns',
      items: [
        { link: 'https://example.com/mastodon', icon: '', alt: 'Mastodon' },
        { link: 'https://example.com/github', icon: '', alt: 'GitHub' },
        { link: 'https://example.com/newsletter', icon: '', alt: 'Newsletter' },
      ],
    }),
    hero({ Titel: 'Beispiel GmbH' }),
    features('Was wir bieten', 6),
    article(4),
    faq('Fragen zur Zusammenarbeit', 6),
    text('Noch Fragen?', lorem(3)),
  ]),
  page('ueber-uns', 'Über uns', [
    text('Über uns', '<p>Beispiel GmbH wurde 2015 gegründet. Wir sind ein kleines Team aus <strong>Designern</strong> und <strong>Entwicklern</strong>.</p><ul><li>Persönliche Betreuung</li><li>Faire, transparente Preise</li><li>Langfristige Wartung</li></ul>'),
    box('Unser Team', 'Anna (Design), Ben (Entwicklung) und Clara (Projektleitung) freuen sich auf Ihre Anfrage.'),
  ]),
  page('leistungen', 'Leistungen', [
    h2('Unsere Leistungen'),
    text('Was wir für Sie tun', '<p>Von der ersten Idee bis zum Livegang begleiten wir Ihr Projekt.</p>'),
  ], [
    page('webdesign', 'Webdesign', [
      text('Webdesign', '<p>Individuelle Gestaltung, abgestimmt auf Ihre Marke – responsiv auf jedem Gerät.</p><ol><li>Workshop</li><li>Entwurf</li><li>Umsetzung</li></ol>'),
    ]),
    page('beratung', 'Beratung', [
      text('Beratung', '<p>Wir analysieren Ihre bestehende Seite und zeigen konkrete Verbesserungen bei Struktur, Inhalten und Technik auf.</p>'),
      box('Erstgespräch', 'Das erste Gespräch ist kostenlos und unverbindlich.'),
    ]),
  ]),
  showcase,
  page('kontakt', 'Kontakt', [
    h2('Kontakt'),
    box('So erreichen Sie uns', 'Beispiel GmbH · Musterstraße 1 · 12345 Musterstadt · kontakt@example.com'),
  ]),
];

async function main() {
  for (const p of pages) {
    const data = { title: p.title, template: p.template, status: p.status, blocks: p.blocks, children: p.children, data: p.data, isHomepage: p.slug === 'home' };
    const up = await prisma.page.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } });
    console.log('Seite:', up.slug);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
