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
});
