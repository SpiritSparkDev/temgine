jest.mock('../lib/prisma', () => ({ prisma: {} }));
const { buildPageMeta, buildBlogPostMeta, escapeJsonLd } = require('../lib/seo');

test('buildPageMeta uses page override before site default', () => {
  const page = { title: 'Kontakt', data: { seo: { metaTitle: 'Kontakt aufnehmen', ogImage: '/img/contact.jpg', robots: 'index, follow' } }, accessGroups: [] };
  const meta = buildPageMeta({
    page,
    routePath: '/kontakt',
    baseUrl: 'https://example.com',
    settings: { seo_site_name: 'Firma', seo_default_og_image: '/img/default.jpg' },
  });
  expect(meta.title).toBe('Kontakt aufnehmen – Firma');
  expect(meta.og.image).toBe('https://example.com/img/contact.jpg');
  expect(meta.robots).toBe('index, follow');
});

test('buildPageMeta falls back to site default image', () => {
  const page = { title: 'Über uns', data: {}, accessGroups: [] };
  const meta = buildPageMeta({
    page,
    routePath: '/ueber-uns',
    baseUrl: 'https://example.com',
    settings: { seo_default_og_image: '/img/default.jpg' },
  });
  expect(meta.og.image).toBe('https://example.com/img/default.jpg');
});

test('gated pages are forced to noindex', () => {
  const page = { title: 'Mitgliederbereich', data: {}, accessGroups: ['members'] };
  const meta = buildPageMeta({ page, routePath: '/intern', baseUrl: 'https://example.com', settings: {} });
  expect(meta.robots).toBe('noindex, nofollow');
});

test('global indexing kill switch overrides page robots', () => {
  const page = { title: 'Start', data: { seo: { robots: 'index, follow' } }, accessGroups: [] };
  const meta = buildPageMeta({ page, routePath: '/', baseUrl: 'https://example.com', settings: { seo_indexing_enabled: 'false' } });
  expect(meta.robots).toBe('noindex, nofollow');
});

test('not found gets noindex', () => {
  const meta = buildPageMeta({ page: null, routePath: '/nope', baseUrl: 'https://example.com', settings: {}, notFound: true });
  expect(meta.robots).toBe('noindex, nofollow');
});

test('blog post meta builds BlogPosting jsonld', () => {
  const post = { title: 'Mein Beitrag', excerpt: 'Kurz', coverImage: '/img/post.jpg', author: 'Max', publishedAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') };
  const meta = buildBlogPostMeta({ post, routePath: '/blog/mein-beitrag', baseUrl: 'https://example.com', settings: {} });
  expect(meta.title).toBe('Mein Beitrag');
  expect(meta.jsonLd[0]['@type']).toBe('BlogPosting');
  expect(meta.og.image).toBe('https://example.com/img/post.jpg');
});

test('escapeJsonLd prevents script tag breakout', () => {
  const out = escapeJsonLd({ name: '</script><script>alert(1)</script>' });
  expect(out).not.toMatch(/<\/script>/);
});
