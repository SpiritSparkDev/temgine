const { extractTemplateVariables, generateDefaultProps } = require('../lib/templateParser');

describe('templateParser variable extraction', () => {
  test('extracts Mustache variables from template code', () => {
    const templateCode = '<section><h1>{{title}}</h1><p>{{description}}</p><a href="{{button.url}}">{{button.label}}</a></section>';

    const variables = extractTemplateVariables(templateCode);

    expect(variables).toEqual(expect.arrayContaining(['title', 'description', 'button.url', 'button.label']));
  });

  test('generates nested default props from template variables', () => {
    const templateCode = '<figure><img src="{{image.src}}" alt="{{image.alt}}" /><figcaption>{{image.caption}}</figcaption></figure>';

    const defaults = generateDefaultProps(templateCode);

    expect(defaults).toEqual({
      image: {
        src: '',
        alt: '',
        caption: ''
      }
    });
  });
});