const { extractTemplateVariables, generateDefaultProps } = require('../lib/templateParser');

describe('templateParser snippet expansion', () => {
  test('extracts variables from referenced snippets', () => {
    const templateCode = '<section>{{snippetHtml:cta-button}}</section>';
    const snippetsByKey = {
      'cta-button': '<a class="btn" href="{{button.url}}">{{button.label}}</a>'
    };

    const variables = extractTemplateVariables(templateCode, snippetsByKey);

    expect(variables).toEqual(expect.arrayContaining(['button.url', 'button.label']));
  });

  test('generates nested default props from referenced snippets', () => {
    const templateCode = '<section>{{snippetHtml:image-figure}}</section>';
    const snippetsByKey = {
      'image-figure': '<figure><img src="{{image.src}}" alt="{{image.alt}}" /><figcaption>{{image.caption}}</figcaption></figure>'
    };

    const defaults = generateDefaultProps(templateCode, snippetsByKey);

    expect(defaults).toEqual({
      image: {
        src: '',
        alt: '',
        caption: ''
      }
    });
  });
});