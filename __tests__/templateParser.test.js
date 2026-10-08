const { extractTemplateVariables, extractTypedVariables, generateDefaultProps, extractRepeaterBlocks, extractFolderBlocks } = require('../lib/templateParser');

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

describe('extractFolderBlocks', () => {
  test('extracts a bare {{#folder}} section', () => {
    const code = '<ul>{{#folder}}<a href="{{url}}">{{name}}</a>{{/folder}}</ul>';
    const result = extractFolderBlocks(code);
    expect(result).toEqual([{ sectionName: 'folder' }]);
  });

  test('extracts a named {{#folder:name}} section', () => {
    const code = '{{#folder:gallery}}<a href="{{url}}">{{slug}}</a>{{/folder:gallery}}';
    const result = extractFolderBlocks(code);
    expect(result).toEqual([{ sectionName: 'gallery' }]);
  });

  test('extracts multiple named folder sections', () => {
    const code = `
      {{#folder:bilder}}{{url}}{{/folder:bilder}}
      {{#folder:dokumente}}{{url}}{{/folder:dokumente}}`;
    const result = extractFolderBlocks(code);
    const names = result.map(r => r.sectionName);
    expect(names).toEqual(expect.arrayContaining(['bilder', 'dokumente']));
    expect(result).toHaveLength(2);
  });

  test('generateDefaultProps initialises folder sections as an empty string, not an array', () => {
    const code = '{{#folder}}{{url}}{{/folder}}{{#folder:extra}}{{url}}{{/folder:extra}}';
    const props = generateDefaultProps(code);
    expect(props.folder).toBe('');
    expect(props.extra).toBe('');
  });

  test('folder section inner fields are excluded from extractTemplateVariables/extractTypedVariables', () => {
    const code = '<h1>{{title}}</h1>{{#folder}}<a href="{{url}}">{{name}}</a>{{/folder}}';
    const vars = extractTemplateVariables(code);
    expect(vars).toContain('title');
    expect(vars).not.toContain('url');
    expect(vars).not.toContain('name');
    expect(vars).not.toContain('folder');

    const typed = extractTypedVariables(code).map(v => v.varName);
    expect(typed).toContain('title');
    expect(typed).not.toContain('url');
    expect(typed).not.toContain('name');
  });

  test('a var used both outside and inside a folder block is not excluded from the flat list', () => {
    const code = '<h1>{{name}}</h1>{{#folder}}{{name}}{{/folder}}';
    const vars = extractTemplateVariables(code);
    expect(vars).toContain('name');
  });
});

describe('|Gruppe annotation', () => {
  test('group label is parsed and not part of the variable name', () => {
    const typed = extractTypedVariables('<h1>{{title:text|Inhalt}}</h1>{{lvl|Darstellung}}');
    expect(typed).toEqual([
      { varName: 'title', explicitType: 'text', group: 'Inhalt' },
      { varName: 'lvl', explicitType: null, group: 'Darstellung' },
    ]);
    expect(extractTemplateVariables('{{title:text|Inhalt}}')).toEqual(['title']);
  });
});

describe('guessInputType: Link-Beschriftung ist Text', () => {
  const { guessInputType } = require('../lib/templateParser');
  test.each([['Link Text', 'text'], ['link-label', 'text'], ['Button Link', 'url'], ['url', 'url']])('%s → %s', (name, type) => {
    expect(guessInputType(name)).toBe(type);
  });
});

describe(':checkbox annotation', () => {
  test('explicit type is recognised for top-level and repeater fields', () => {
    expect(extractTypedVariables('{{aktiv:checkbox}}')).toEqual([
      { varName: 'aktiv', explicitType: 'checkbox', group: null },
    ]);
    const code = '{{#each:Fragen}}<details{{#if:Offen}} open{{/if:Offen}}><!-- {{Offen:checkbox}} -->{{Titel:text}}</details>{{/each:Fragen}}';
    expect(extractRepeaterBlocks(code)).toEqual([
      { sectionName: 'Fragen', subFields: [{ name: 'Offen', type: 'checkbox' }, { name: 'Titel', type: 'text' }] },
    ]);
  });
});

describe(':select(...) annotation', () => {
  test('options are parsed (Wert = Label oder Label=wert) und der Feldname bleibt sauber', () => {
    expect(extractTypedVariables('{{align:select(links, Mitte=center, rechts)|Darstellung}}')).toEqual([
      {
        varName: 'align', explicitType: 'select', group: 'Darstellung',
        options: [
          { value: 'links', label: 'links' },
          { value: 'center', label: 'Mitte' },
          { value: 'rechts', label: 'rechts' },
        ],
      },
    ]);
    expect(extractTemplateVariables('{{align:select(links, rechts)}}')).toEqual(['align']);
  });

  test('ohne Klammer-Liste bleibt select ein Feld ohne options; Repeater-Unterfelder tragen options', () => {
    expect(extractTypedVariables('{{x:select}}')).toEqual([{ varName: 'x', explicitType: 'select', group: null }]);
    expect(extractRepeaterBlocks('{{#each:Items}}{{Pos:select(oben, unten)}}{{Titel}}{{/each:Items}}')).toEqual([
      { sectionName: 'Items', subFields: [
        { name: 'Pos', type: 'select', options: [{ value: 'oben', label: 'oben' }, { value: 'unten', label: 'unten' }] },
        { name: 'Titel', type: 'text' },
      ] },
    ]);
  });
});
