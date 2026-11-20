// Ersatz für `core.pages` (WP-B4) mit vereinfachtem renderPage: In-Memory-Seitenbaum, Navigationen, Footer, Widgets, globale Variablen.
// Wird vom Mock-Temgine (e2e/mock-temgine.js) und den Plugin-Tests benutzt. Das echte Rendern prüft nur die E2E-Suite gegen Temgine.
const get = (data, k) => (k in data ? data[k] : k.split('.').reduce((o, p) => (o == null ? o : o[p]), data));
export const miniRender = (code, data) => String(code).replace(/\{\{\{?\s*([\w.:-]+)\s*\}?\}\}/g, (_m, k) => { const v = get(data, k); return v == null ? '' : String(v); });

export function createPagesCore(state = {}) {
  const s = { pages: [], navs: [], footers: [], widgets: [], globals: {}, ...state };
  return {
    state: s,
    tree: async () => s.pages,
    navigations: async () => s.navs,
    footers: async () => s.footers,
    widgets: async () => s.widgets,
    globalVars: async () => s.globals,
    loadSections: async () => ({}),
    collectSectionKeys: () => ({}),
    buildNavHtml: (nodes) => `<nav class="auto">${(nodes || []).map((n) => n.slug).join(',')}</nav>`,
    renderPage: (page, blockTemplates, { navigations = {}, footer = null, globalVars = {} } = {}) => {
      const nav = (k) => (navigations[k]?.code ? miniRender(navigations[k].code, { pagelist: (navigations[k].data?.pages || []).map((p) => p.slug).join(','), global: globalVars }) : '');
      const navData = { 'nav:main': nav('main'), 'nav:page': nav('page'), 'nav:mobile': nav('mobile'), 'nav:auto': navigations.auto?.code || '' };
      const body = (page.blocks || []).map((b) => {
        const name = b.template || b.type;
        const code = blockTemplates[name];
        return code == null ? `<div class="missing-block">Missing template: ${name}</div>` : miniRender(code, { ...b.props, ...navData, global: globalVars, page: { title: page.title, slug: page.slug, data: page.data || {} } });
      }).join('\n');
      const parts = [];
      if (navData['nav:main'] && !body.includes(navData['nav:main'])) parts.push(navData['nav:main']);
      parts.push(body);
      if (footer?.code) parts.push(miniRender(footer.code, { global: globalVars }));
      return parts.filter(Boolean).join('\n');
    },
  };
}
