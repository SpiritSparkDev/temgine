// Legt Beispiel-Seiten mit Inhalt an (idempotent, Upsert per Slug). Nutzt vorhandene Block-Templates.
// Aufruf: docker compose -f docker-compose.dev.yml exec app node scripts/seed-example-pages.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const block = (template, props) => ({ type: 'content', template, props, children: [] });
const h2 = (title) => block('H2 Header', { title });
const box = (title, text) => block('Header+Textboxes', { title, text });
const text = (title, html) => block('text', { 'Titel Der Unterseite': title, Text: html });
const page = (slug, title, blocks, children = []) => ({ id: slug, slug, title, template: 'default', status: 'PUBLISHED', blocks, children, data: {} });

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
