const {
  guessBlockType,
  extractTextContent,
  extractHeading,
  extractImageSrcs,
  extractLinks,
  cleanHtml,
  generateTemplateName,
  generateTemplateFromHtml,
} = require('../lib/htmlImporter');

describe('htmlImporter – guessBlockType', () => {
  test('returns "navigation" for <nav>', () => {
    expect(guessBlockType('nav', [], '')).toBe('navigation');
  });

  test('returns "navigation" for div with class "navbar"', () => {
    expect(guessBlockType('div', ['navbar'], '')).toBe('navigation');
  });

  test('returns "footer" for <footer>', () => {
    expect(guessBlockType('footer', [], '')).toBe('footer');
  });

  test('returns "header" for <header>', () => {
    expect(guessBlockType('header', [], '')).toBe('header');
  });

  test('returns "header" for div with class "hero"', () => {
    expect(guessBlockType('div', ['hero'], '')).toBe('header');
  });

  test('returns "gallery" for <section> with class "gallery"', () => {
    expect(guessBlockType('section', ['gallery'], '')).toBe('gallery');
  });

  test('returns "gallery" when innerHTML contains 2+ images', () => {
    const html = '<img src="a.jpg"><img src="b.jpg">';
    expect(guessBlockType('section', [], html)).toBe('gallery');
  });

  test('returns "cta" for div with class "cta"', () => {
    expect(guessBlockType('div', ['cta'], '')).toBe('cta');
  });

  test('returns "image" for <figure>', () => {
    expect(guessBlockType('figure', [], '')).toBe('image');
  });

  test('returns "quote" for <blockquote>', () => {
    expect(guessBlockType('blockquote', [], '')).toBe('quote');
  });

  test('returns "list" for <ul>', () => {
    expect(guessBlockType('ul', [], '')).toBe('list');
  });

  test('falls back to "text" for plain <section>', () => {
    expect(guessBlockType('section', [], '<p>Hello</p>')).toBe('text');
  });
});

describe('htmlImporter – extractTextContent', () => {
  test('strips tags and collapses whitespace', () => {
    const result = extractTextContent('<h1>Hello</h1>  <p>World</p>');
    expect(result).toBe('Hello World');
  });

  test('returns empty string for empty input', () => {
    expect(extractTextContent('')).toBe('');
    expect(extractTextContent(null)).toBe('');
  });
});

describe('htmlImporter – extractHeading', () => {
  test('extracts text from first h1', () => {
    expect(extractHeading('<h1>My Title</h1><p>rest</p>')).toBe('My Title');
  });

  test('extracts text from h3', () => {
    expect(extractHeading('<h3>Sub</h3>')).toBe('Sub');
  });

  test('returns empty string when no heading', () => {
    expect(extractHeading('<p>no heading here</p>')).toBe('');
  });
});

describe('htmlImporter – extractImageSrcs', () => {
  test('returns all src values', () => {
    const html = '<img src="/a.jpg"><img src="/b.png">';
    expect(extractImageSrcs(html)).toEqual(['/a.jpg', '/b.png']);
  });

  test('returns empty array when no images', () => {
    expect(extractImageSrcs('<p>text</p>')).toEqual([]);
  });
});

describe('htmlImporter – extractLinks', () => {
  test('extracts href and text', () => {
    const html = '<a href="/about">Über uns</a>';
    const links = extractLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ text: 'Über uns', href: '/about' });
  });

  test('ignores anchor-only hrefs (#)', () => {
    expect(extractLinks('<a href="#top">Top</a>')).toHaveLength(0);
  });

  test('returns empty array when no links', () => {
    expect(extractLinks('<p>no links</p>')).toEqual([]);
  });
});

describe('htmlImporter – cleanHtml', () => {
  test('removes script tags', () => {
    const html = '<p>text</p><script>alert(1)</script>';
    expect(cleanHtml(html)).not.toContain('<script');
  });

  test('removes style tags', () => {
    const html = '<p>text</p><style>.a{color:red}</style>';
    expect(cleanHtml(html)).not.toContain('<style');
  });

  test('removes HTML comments', () => {
    const html = '<!-- comment --><p>text</p>';
    expect(cleanHtml(html)).not.toContain('<!--');
  });
});

describe('htmlImporter – generateTemplateName', () => {
  test('generates correct name for text block', () => {
    expect(generateTemplateName('text', 1)).toBe('Imported-Text-1');
  });

  test('generates correct name for gallery block', () => {
    expect(generateTemplateName('gallery', 3)).toBe('Imported-Gallery-3');
  });

  test('uses "Block" label for unknown type', () => {
    expect(generateTemplateName('unknown', 2)).toBe('Imported-Block-2');
  });
});

describe('htmlImporter – generateTemplateFromHtml', () => {
  test('replaces heading text with {{title}}', () => {
    const html = '<section><h1>Hello World</h1><p>text</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('{{title}}');
    expect(result.code).not.toContain('Hello World');
  });

  test('puts everything except heading into {{{content}}}', () => {
    const html = '<section><h1>Title</h1><h2>Sub</h2><p>Body</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('{{{content}}}');
    expect(result.code).not.toContain('Sub');
    expect(result.code).not.toContain('Body');
    expect(result.extractedProps.content).toContain('Sub');
    expect(result.extractedProps.content).toContain('Body');
  });

  test('full inner HTML (incl. paragraph) goes to {{{content}}} when no heading', () => {
    const html = '<section><p>Body text here.</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('{{{content}}}');
    expect(result.code).not.toContain('Body text here');
    expect(result.extractedProps.content).toContain('Body text here');
  });

  test('image goes into {{{content}}}, imgurl still in extractedProps', () => {
    const html = '<div><img src="/img/photo.jpg" alt="photo"></div>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('{{{content}}}');
    expect(result.code).not.toContain('/img/photo.jpg');
    expect(result.extractedProps.imgurl).toBe('/img/photo.jpg');
  });

  test('links go into {{{content}}}', () => {
    const html = '<div><a href="/contact">Contact us</a></div>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('{{{content}}}');
    expect(result.code).not.toContain('/contact');
    expect(result.code).not.toContain('Contact us');
    expect(result.extractedProps.content).toContain('/contact');
    expect(result.extractedProps.content).toContain('Contact us');
  });

  test('returns type BLOCK', () => {
    const result = generateTemplateFromHtml('<p>text</p>', 'Test');
    expect(result.type).toBe('BLOCK');
    expect(result.name).toBe('Test');
  });

  test('preserves outer wrapper tag and attributes in template code', () => {
    const html = '<section class="hero" id="top"><h1>Title</h1><p>Body</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toContain('<section class="hero" id="top">');
    expect(result.code).toContain('</section>');
    expect(result.code).not.toContain('Body');
  });

  test('handles block with no heading – entire inner HTML goes to {{{content}}}', () => {
    const html = '<div class="text-block"><p>Some text</p><ul><li>Item</li></ul></div>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).toBe('<div class="text-block">{{{content}}}</div>');
    expect(result.extractedProps.content).toContain('Some text');
    expect(result.extractedProps.content).toContain('<ul>');
  });

  test('extractedProps contains title from heading', () => {
    const html = '<section><h1>My Title</h1><p>body</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.extractedProps.title).toBe('My Title');
  });

  test('extractedProps.content contains full remaining HTML (not just text)', () => {
    const html = '<section><h1>T</h1><p>Paragraph <strong>content</strong>.</p></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.extractedProps.content).toContain('<p>');
    expect(result.extractedProps.content).toContain('<strong>');
    expect(result.extractedProps.content).toContain('Paragraph');
  });

  test('extractedProps contains imgurl from image src', () => {
    const html = '<div><img src="/img/hero.jpg" alt="hero"></div>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.extractedProps.imgurl).toBe('/img/hero.jpg');
  });

  test('no text content is hardcoded in template code (divs, lists, etc.)', () => {
    const html = '<section class="services"><h2>Our Services</h2><div class="grid"><div class="card"><h3>Service A</h3><p>Description A</p></div></div></section>';
    const result = generateTemplateFromHtml(html, 'Test');
    expect(result.code).not.toContain('Our Services');
    expect(result.code).not.toContain('Service A');
    expect(result.code).not.toContain('Description A');
    expect(result.extractedProps.title).toBe('Our Services');
    expect(result.extractedProps.content).toContain('Service A');
    expect(result.extractedProps.content).toContain('Description A');
  });
});
