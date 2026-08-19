const {
  extractTemplatePlaceholders,
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
