const {
  guessBlockType,
  extractTextContent,
  extractHeading,
  extractImageSrcs,
  extractLinks,
  cleanHtml,
  generateTemplateName,
  generateTemplateFromHtml,
  extractContentElements,
  applyFieldExtractions,
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

// ─────────────────────────────────────────────────────────────────────────────
describe('htmlImporter – extractContentElements', () => {
  test('returns empty array for empty input', () => {
    expect(extractContentElements('')).toEqual([]);
    expect(extractContentElements(null)).toEqual([]);
  });

  test('extracts a <p> element with suggestedName "text"', () => {
    const elems = extractContentElements('<p>Hello world</p>');
    expect(elems).toHaveLength(1);
    expect(elems[0].tag).toBe('p');
    expect(elems[0].textValue).toBe('Hello world');
    expect(elems[0].suggestedName).toBe('text');
    expect(elems[0].type).toBe('text');
  });

  test('auto-numbers duplicate base names', () => {
    const elems = extractContentElements('<p>First</p><p>Second</p><p>Third</p>');
    expect(elems[0].suggestedName).toBe('text');
    expect(elems[1].suggestedName).toBe('text2');
    expect(elems[2].suggestedName).toBe('text3');
  });

  test('extracts <h2> with suggestedName "subtitle"', () => {
    const elems = extractContentElements('<h2 class="sub">Subtitle text</h2>');
    expect(elems[0].tag).toBe('h2');
    expect(elems[0].suggestedName).toBe('subtitle');
    expect(elems[0].textValue).toBe('Subtitle text');
  });

  test('extracts <img> element with type "image" and imgSrc', () => {
    const elems = extractContentElements('<img src="photo.jpg" alt="test">');
    expect(elems).toHaveLength(1);
    expect(elems[0].tag).toBe('img');
    expect(elems[0].type).toBe('image');
    expect(elems[0].imgSrc).toBe('photo.jpg');
    expect(elems[0].suggestedName).toBe('image');
  });

  test('extracts <a> element with href', () => {
    const elems = extractContentElements('<a href="/about">Learn more</a>');
    expect(elems).toHaveLength(1);
    expect(elems[0].tag).toBe('a');
    expect(elems[0].type).toBe('link');
    expect(elems[0].href).toBe('/about');
    expect(elems[0].textValue).toBe('Learn more');
  });

  test('skips nested elements (only top-level)', () => {
    // <p> contains <a> – should only return the <p>, not also the <a>
    const elems = extractContentElements('<p>Text with <a href="/x">link</a> inside</p>');
    expect(elems).toHaveLength(1);
    expect(elems[0].tag).toBe('p');
  });

  test('returns outerHtml matching original', () => {
    const html = '<p class="lead">Lead text</p>';
    const elems = extractContentElements(html);
    expect(elems[0].outerHtml).toBe(html);
  });

  test('handles mixed content with multiple element types', () => {
    const html = '<h2>Title</h2><p>Text</p><img src="img.png"><a href="/link">Link</a>';
    const elems = extractContentElements(html);
    expect(elems).toHaveLength(4);
    expect(elems.map(e => e.tag)).toEqual(['h2', 'p', 'img', 'a']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('htmlImporter – applyFieldExtractions', () => {
  const baseTemplate = '<section><h2>{{title}}</h2>{{{content}}}</section>';
  const baseContent = '<p class="lead">Lead paragraph</p><p>Second paragraph</p>';

  test('returns unchanged values when no extractions selected', () => {
    const result = applyFieldExtractions(baseTemplate, baseContent, []);
    expect(result.newCode).toBe(baseTemplate);
    expect(result.newContentHtml).toBe(baseContent);
    expect(result.newProps).toEqual({});
  });

  test('extracts a <p> into a named field', () => {
    const elems = extractContentElements(baseContent);
    const withSelection = [
      { ...elems[0], fieldName: 'lead', selected: true },
      ...elems.slice(1),
    ];
    const result = applyFieldExtractions(baseTemplate, baseContent, withSelection);
    // prop set
    expect(result.newProps.lead).toBe('Lead paragraph');
    // element removed from content
    expect(result.newContentHtml).not.toContain('Lead paragraph');
    expect(result.newContentHtml).toContain('Second paragraph');
    // snippet inserted before {{{content}}}
    expect(result.newCode).toContain('{{#lead}}');
    expect(result.newCode).toContain('{{/lead}}');
    expect(result.newCode).toContain('{{{content}}}');
  });

  test('extracts an <img> into a named field', () => {
    const content = '<img src="hero.jpg" alt="hero">';
    const template = '<div>{{{content}}}</div>';
    const elems = extractContentElements(content);
    const withSelection = [{ ...elems[0], fieldName: 'heroImg', selected: true }];
    const result = applyFieldExtractions(template, content, withSelection);
    expect(result.newProps.heroImg).toBe('hero.jpg');
    expect(result.newCode).toContain('{{#heroImg}}');
    expect(result.newCode).toContain('{{heroImg}}');
    // content became empty → placeholder removed
    expect(result.newCode).not.toContain('{{{content}}}');
  });

  test('respects fieldName rename', () => {
    const elems = extractContentElements('<h2>Subtitle</h2>');
    const withSelection = [{ ...elems[0], fieldName: 'mySubtitle', selected: true }];
    const result = applyFieldExtractions(baseTemplate, '<h2>Subtitle</h2>', withSelection);
    expect(result.newProps.mySubtitle).toBe('Subtitle');
    expect(result.newCode).toContain('{{#mySubtitle}}');
    expect(result.newCode).toContain('{{/mySubtitle}}');
  });

  test('skips extractions where selected is false', () => {
    const elems = extractContentElements(baseContent);
    const notSelected = elems.map(e => ({ ...e, selected: false }));
    const result = applyFieldExtractions(baseTemplate, baseContent, notSelected);
    expect(result.newProps).toEqual({});
    expect(result.newContentHtml).toBe(baseContent);
  });

  test('skips extractions where fieldName is empty', () => {
    const elems = extractContentElements(baseContent);
    const emptyName = [{ ...elems[0], fieldName: '', selected: true }];
    const result = applyFieldExtractions(baseTemplate, baseContent, emptyName);
    expect(result.newProps).toEqual({});
  });
});
