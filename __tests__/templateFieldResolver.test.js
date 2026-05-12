import { resolveTemplateFields } from '../lib/templateFieldResolver';

describe('resolveTemplateFields', () => {
  test('uses explicit textarea type and excludes fixed fields from custom list', () => {
    const schema = resolveTemplateFields(`
      <article class="post-body">
        <h1>{{title}}</h1>
        <div>{{Text:textarea}}</div>
        <div>{{excerpt}}</div>
      </article>
    `);

    expect(schema.fieldSet.has('title')).toBe(true);
    expect(schema.fieldSet.has('Text')).toBe(true);

    expect(schema.customFields.map(f => f.name)).toContain('Text');
    expect(schema.customFields.map(f => f.name)).not.toContain('title');

    expect(schema.customFieldTypeByName.get('text')).toBe('textarea');
  });

  test('builds DOM-based groups and keeps leftovers', () => {
    const schema = resolveTemplateFields(`
      <section class="hero">
        <h2>{{headline}}</h2>
        <p>{{subline}}</p>
      </section>
      <footer>
        <span>{{cta}}</span>
      </footer>
    `);

    const namesByGroup = schema.customGroups.map(g => g.fields.join(','));
    expect(namesByGroup).toContain('headline,subline');
    expect(namesByGroup.join(',')).toContain('cta');
  });
});
