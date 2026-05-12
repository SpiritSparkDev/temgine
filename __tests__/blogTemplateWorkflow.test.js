const {
  extractTemplatePlaceholders,
  parseBlogTemplateMeta,
  encodeBlogTemplateMeta,
  validatePreviewSubset,
} = require('../lib/blogTemplateWorkflow');

describe('blogTemplateWorkflow', () => {
  test('extractTemplatePlaceholders ignores control markers', () => {
    const vars = extractTemplatePlaceholders(`
      <article>
        <h1>{{title}}</h1>
        {{#if:showMeta}}<p>{{author}}</p>{{/if:showMeta}}
        {{#each:items}}<span>{{label}}</span>{{/each:items}}
      </article>
    `);

    expect(Array.from(vars)).toEqual(expect.arrayContaining(['title', 'author', 'label']));
    expect(vars.has('if:showMeta')).toBe(false);
  });

  test('parse and encode blog meta for master and preview', () => {
    expect(parseBlogTemplateMeta('master')).toEqual({
      blogRole: 'master',
      masterTemplateName: null,
      raw: 'master',
    });

    expect(parseBlogTemplateMeta('preview:Artikel Master')).toEqual({
      blogRole: 'preview',
      masterTemplateName: 'Artikel Master',
      raw: 'preview:Artikel Master',
    });

    expect(encodeBlogTemplateMeta('master', null, null)).toBe('master');
    expect(encodeBlogTemplateMeta('preview', 'Artikel Master', null)).toBe('preview:Artikel Master');
  });

  test('validatePreviewSubset rejects placeholders outside master vars', () => {
    const masterCode = '<article><h1>{{title}}</h1><p>{{excerpt}}</p></article>';
    const previewCode = '<div><h2>{{title}}</h2><span>{{unknownField}}</span></div>';

    const result = validatePreviewSubset(previewCode, masterCode);

    expect(result.ok).toBe(false);
    expect(result.invalid).toContain('unknownField');
  });

  test('validatePreviewSubset allows standard blog vars', () => {
    const masterCode = '<article><h1>{{title}}</h1></article>';
    const previewCode = '<div><h2>{{title}}</h2><a href="{{postUrl}}">Mehr</a></div>';

    const result = validatePreviewSubset(previewCode, masterCode);

    expect(result.ok).toBe(true);
    expect(result.invalid).toEqual([]);
  });
});
