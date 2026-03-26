const { computeMatchScore, findBestMatch, extractPropsFromHtml } = require('../lib/templateMatcher');

describe('templateMatcher – computeMatchScore', () => {
  test('scores 95+ for exact type name match', () => {
    expect(computeMatchScore('text', 'text', 'BLOCK')).toBeGreaterThanOrEqual(95);
  });

  test('scores high for partial hint match (gallery)', () => {
    expect(computeMatchScore('gallery', 'Image-Gallery', 'BLOCK')).toBeGreaterThan(50);
  });

  test('gives BLOCK type a bonus over SITE type', () => {
    const block = computeMatchScore('text', 'text', 'BLOCK');
    const site  = computeMatchScore('text', 'text', 'SITE');
    expect(block).toBeGreaterThan(site);
  });

  test('returns 0 for completely unrelated name', () => {
    expect(computeMatchScore('text', 'zzz-unrelated', 'BLOCK')).toBe(0);
  });
});

describe('templateMatcher – findBestMatch', () => {
  const templates = [
    { name: 'Text', type: 'BLOCK', code: '<p>{{text}}</p>' },
    { name: 'Gallery', type: 'BLOCK', code: '<div>{{images}}</div>' },
    { name: 'Seiten', type: 'SITE', code: '{{{blocks}}}' },
  ];

  test('returns the Text template for blockType "text"', () => {
    const result = findBestMatch('text', templates);
    expect(result).not.toBeNull();
    expect(result.template.name).toBe('Text');
    expect(result.score).toBeGreaterThan(0);
  });

  test('returns the Gallery template for blockType "gallery"', () => {
    const result = findBestMatch('gallery', templates);
    expect(result).not.toBeNull();
    expect(result.template.name).toBe('Gallery');
  });

  test('returns null for empty templates list', () => {
    expect(findBestMatch('text', [])).toBeNull();
  });

  test('skips null entries in templates list', () => {
    const result = findBestMatch('text', [null, undefined, templates[0]]);
    expect(result).not.toBeNull();
    expect(result.template.name).toBe('Text');
  });
});

describe('templateMatcher – extractPropsFromHtml', () => {
  const html = '<section><h1>Main Title</h1><p>Body text content here.</p><img src="/img/photo.jpg" alt="photo"><a href="/contact">Contact us</a></section>';

  test('maps title variable to heading text', () => {
    const props = extractPropsFromHtml(html, ['title']);
    expect(props.title).toBe('Main Title');
  });

  test('maps text variable to HTML content', () => {
    const props = extractPropsFromHtml(html, ['text']);
    expect(props.text).toContain('Body text content here');
  });

  test('maps imgurl variable to image src', () => {
    const props = extractPropsFromHtml(html, ['imgurl']);
    expect(props.imgurl).toBe('/img/photo.jpg');
  });

  test('maps href variable to link href', () => {
    const props = extractPropsFromHtml(html, ['href']);
    expect(props.href).toBe('/contact');
  });

  test('maps label variable to link text', () => {
    const props = extractPropsFromHtml(html, ['label']);
    expect(props.label).toBe('Contact us');
  });

  test('returns empty object for empty vars list', () => {
    expect(extractPropsFromHtml(html, [])).toEqual({});
  });

  test('uses plain-text summary for unknown variable names', () => {
    const props = extractPropsFromHtml(html, ['someField']);
    expect(typeof props.someField).toBe('string');
    expect(props.someField.length).toBeGreaterThan(0);
  });
});
