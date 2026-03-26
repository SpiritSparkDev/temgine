const { renderPage } = require('../lib/templateEngine');

describe('slot rendering in templateEngine', () => {
  let logSpy;
  let debugSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    debugSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('renders dynamic slots from per-block slot assignments', () => {
    const page = {
      title: 'Start',
      slug: 'start',
      blocks: [
        { template: 'Card', slot: 'hero', props: { title: 'Hero Block' } },
        { template: 'Card', slot: 'footer', props: { title: 'Footer Block' } },
        { template: 'Card', props: { title: 'Loose Block' } }
      ],
      data: {}
    };

    const html = renderPage(
      page,
      {
        Card: '<article class="card">{{title}}</article>'
      },
      '<main><section id="hero">{{{blockSlot:hero}}}</section><section id="footer">{{{blockSlot:footer}}}</section><div id="free">{{{blocks}}}</div></main>',
      [],
      {},
      {},
      {}
    );

    const heroSegment = html.split('<section id="hero">')[1].split('</section>')[0];
    const footerSegment = html.split('<section id="footer">')[1].split('</section>')[0];
    const freeSegment = html.split('<div id="free">')[1].split('</div>')[0];

    expect(heroSegment).toContain('Hero Block');
    expect(heroSegment).not.toContain('Footer Block');

    expect(footerSegment).toContain('Footer Block');
    expect(footerSegment).not.toContain('Hero Block');

    expect(freeSegment).toContain('Loose Block');
    expect(freeSegment).not.toContain('Hero Block');
    expect(freeSegment).not.toContain('Footer Block');
  });

  test('keeps legacy slot->template mapping as fallback', () => {
    const page = {
      title: 'Legacy',
      slug: 'legacy',
      blocks: [
        { template: 'HeroTemplate', props: { title: 'Hero Legacy' } },
        { template: 'FooterTemplate', props: { title: 'Footer Legacy' } }
      ],
      data: {
        blockSlots: {
          hero: 'HeroTemplate',
          footer: 'FooterTemplate'
        }
      }
    };

    const html = renderPage(
      page,
      {
        HeroTemplate: '<article>{{title}}</article>',
        FooterTemplate: '<article>{{title}}</article>'
      },
      '<main><section id="hero">{{{blockSlot:hero}}}</section><section id="footer">{{{blockSlot:footer}}}</section></main>',
      [],
      {},
      {},
      {}
    );

    const heroSegment = html.split('<section id="hero">')[1].split('</section>')[0];
    const footerSegment = html.split('<section id="footer">')[1].split('</section>')[0];

    expect(heroSegment).toContain('Hero Legacy');
    expect(footerSegment).toContain('Footer Legacy');
  });

  test('renders full blocks output unchanged when template has no dynamic slots', () => {
    const page = {
      title: 'Classic',
      slug: 'classic',
      blocks: [
        { template: 'Card', props: { title: 'A' } },
        { template: 'Card', props: { title: 'B' } }
      ],
      data: {}
    };

    const html = renderPage(
      page,
      {
        Card: '<article>{{title}}</article>'
      },
      '<main>{{{blocks}}}</main>',
      [],
      {},
      {},
      {}
    );

    expect(html).toContain('A');
    expect(html).toContain('B');
  });

  test('treats repeated generic block placeholders as independent implicit sections', () => {
    const page = {
      title: 'Implicit Sections',
      slug: 'implicit-sections',
      blocks: [
        { template: 'Card', slot: 'div', props: { title: 'Main Block' } },
        { template: 'Card', slot: 'footer', props: { title: 'Footer Block' } }
      ],
      data: {}
    };

    const html = renderPage(
      page,
      {
        Card: '<article class="card">{{title}}</article>'
      },
      '<main><div>{{block}}</div><footer>{{block}}</footer></main>',
      [],
      {},
      {},
      {}
    );

    const divSegment = html.split('<div>')[1].split('</div>')[0];
    const footerSegment = html.split('<footer>')[1].split('</footer>')[0];

    expect(divSegment).toContain('Main Block');
    expect(divSegment).not.toContain('Footer Block');
    expect(footerSegment).toContain('Footer Block');
    expect(footerSegment).not.toContain('Main Block');
  });

  test('resolves stored snippets by stable key only', () => {
    const page = {
      title: 'Startseite',
      slug: 'startseite',
      blocks: [
        { template: 'Card', props: { title: 'Block Inhalt' } }
      ],
      data: {}
    };

    const html = renderPage(
      page,
      {
        Card: '<article>{{title}}</article>'
      },
      '<main>{{snippet:hero-title}}|{{snippetHtml:hero-html}}</main>',
      [],
      {},
      {},
      {
        'hero-title': 'Gespeicherter Titel',
        'hero-html': '<strong>Hero HTML</strong>'
      },
      { isChild: false }
    );

    expect(html).toContain('Gespeicherter Titel');
    expect(html).toContain('<strong>Hero HTML</strong>');
    expect(html).not.toContain('Startseite');
  });

  test('exposes direct page fields for templates without snippet indirection', () => {
    const page = {
      title: 'Direkt',
      slug: 'direkt',
      blocks: [],
      data: {
        author: 'Lin',
        pageHeader: 'Headertext'
      }
    };

    const html = renderPage(
      page,
      {},
      '<main>{{title}}|{{slug}}|{{data.author}}|{{data.pageHeader}}|{{isChild}}</main>',
      [],
      {},
      {},
      {},
      { isChild: true }
    );

    expect(html).toContain('Direkt');
    expect(html).toContain('direkt');
    expect(html).toContain('Lin');
    expect(html).toContain('Headertext');
    expect(html).toContain('true');
  });

  test('exposes page context inside block templates', () => {
    const page = {
      title: 'Elternseite',
      slug: 'elternseite',
      blocks: [
        { template: 'Card', props: { title: 'Block Titel', text: 'Block Text' } }
      ],
      data: {
        author: 'Ada'
      }
    };

    const html = renderPage(
      page,
      {
        Card: '<article class="#class:page.title #class:page.slug"><h2>{{title}}</h2><p>{{text}}</p><span>{{page.title}}</span><span>{{page.slug}}</span><span>{{page.data.author}}</span></article>'
      },
      '<main>{{{blocks}}}</main>',
      [],
      {},
      {},
      {},
      { isChild: false }
    );

    expect(html).toContain('Block Titel');
    expect(html).toContain('Block Text');
    expect(html).toContain('Elternseite');
    expect(html).toContain('elternseite');
    expect(html).toContain('Ada');
    expect(html).toContain('class="elternseite elternseite"');
  });
});
