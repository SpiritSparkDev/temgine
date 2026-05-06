const { extractTemplateVariables, generateDefaultProps, extractRepeaterBlocks } = require('../lib/templateParser');

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

describe('extractRepeaterBlocks', () => {
  test('extracts a single each section', () => {
    const code = '<ul>{{#each:items}}<li>{{title}}</li>{{/each:items}}</ul>';
    const result = extractRepeaterBlocks(code);
    expect(result).toHaveLength(1);
    expect(result[0].sectionName).toBe('items');
    expect(result[0].subFields.map(f => f.name)).toContain('title');
  });

  test('extracts multiple each sections with different names', () => {
    const code = `
      <div>
        {{#each:gallery}}<img src="{{src}}" alt="{{caption}}">{{/each:gallery}}
        {{#each:links}}<a href="{{url}}">{{label}}</a>{{/each:links}}
      </div>`;
    const result = extractRepeaterBlocks(code);
    expect(result).toHaveLength(2);
    const names = result.map(r => r.sectionName);
    expect(names).toContain('gallery');
    expect(names).toContain('links');
    const gallery = result.find(r => r.sectionName === 'gallery');
    expect(gallery.subFields.map(f => f.name)).toEqual(expect.arrayContaining(['src', 'caption']));
    const links = result.find(r => r.sectionName === 'links');
    expect(links.subFields.map(f => f.name)).toEqual(expect.arrayContaining(['url', 'label']));
  });

  test('each sections with shared field names keep independent subfields', () => {
    const code = `
      {{#each:news}}{{title}}{{date}}{{/each:news}}
      {{#each:events}}{{title}}{{location}}{{/each:events}}`;
    const result = extractRepeaterBlocks(code);
    expect(result).toHaveLength(2);
    const news = result.find(r => r.sectionName === 'news');
    const events = result.find(r => r.sectionName === 'events');
    expect(news.subFields.map(f => f.name)).toEqual(expect.arrayContaining(['title', 'date']));
    expect(events.subFields.map(f => f.name)).toEqual(expect.arrayContaining(['title', 'location']));
  });

  test('generateDefaultProps initialises all each sections as empty arrays', () => {
    const code = `
      {{#each:gallery}}{{src}}{{/each:gallery}}
      {{#each:links}}{{url}}{{/each:links}}`;
    const props = generateDefaultProps(code);
    expect(Array.isArray(props.gallery)).toBe(true);
    expect(Array.isArray(props.links)).toBe(true);
  });

  test('top-level vars are not excluded when name coincides with each inner var', () => {
    const code = '<h1>{{title}}</h1>{{#each:items}}{{title}}{{desc}}{{/each:items}}';
    const vars = extractTemplateVariables(code);
    // title appears outside the each block → must be in the flat var list
    expect(vars).toContain('title');
  });
});
