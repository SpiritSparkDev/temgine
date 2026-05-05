import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { renderPage, buildNavHtml } from '../lib/templateEngine'

export default function PageCatchAll() {
  const { query } = useRouter()
  const [page, setPage] = useState(null)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = query.slug
    if (raw === undefined) return

    setLoading(true)

    const segments = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : [])

    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`;

    fetch(pagesUrl)
      .then(r => r.json())
      .then(async pages => {
        if (!Array.isArray(pages)) {
          setPage(null)
          setLoading(false)
          return
        }

        const findPageByPath = (nodes, segs) => {
          if (!segs || segs.length === 0) return null
          let currentNodes = nodes
          let found = null
          for (const s of segs) {
            found = currentNodes.find(n => n.slug === s)
            if (!found) return null
            currentNodes = found.children || []
          }
          return found
        }

        let foundPage = findPageByPath(pages, segments)
        
        // Wenn keine Seite gefunden und keine segments (root), versuche Homepage zu laden
        if (!foundPage && segments.length === 0) {
          foundPage = pages.find(p => p.isHomepage === true)
        }
        
        if (!foundPage) {
          const find404Page = (nodes) => {
            for (const node of nodes) {
              if (node.redirectType === '404') return node
              if (node.children && node.children.length > 0) {
                const found = find404Page(node.children)
                if (found) return found
              }
            }
            return null
          }
          foundPage = find404Page(pages)
          if (!foundPage) {
            setPage(null)
            setLoading(false)
            return
          }
        }

        setPage(foundPage)

        if (foundPage.redirectType === 'external' && foundPage.redirectUrl) {
          window.location.href = foundPage.redirectUrl
          setHtml('<div style="padding: 40px; text-align: center;"><p>Weiterleitung...</p></div>')
          setLoading(false)
          return
        }

        const templatesToLoad = new Set()
        const collectBlockTemplates = (blocks) => {
          if (!Array.isArray(blocks)) return
          for (const block of blocks) {
            const tname = block.template || block.type
            if (tname) templatesToLoad.add(tname)
            if (block.children && block.children.length > 0) collectBlockTemplates(block.children)
          }
        }
        collectBlockTemplates(foundPage.blocks)

        // Debug: show which templates we will try to load for this page
        // eslint-disable-next-line no-console
        console.debug('catchall: templatesToLoad ->', Array.from(templatesToLoad))

        const templateCodes = {}

        const fetchTemplate = async (templateName) => {
          if (templateCodes[templateName] !== undefined) return
          templateCodes[templateName] = null // mark as pending to avoid duplicate fetches
          try {
            const res = await fetch(`/api/templates?name=${encodeURIComponent(templateName)}&_t=${Date.now()}`)
            if (res.ok) {
              const data = await res.json()
              templateCodes[templateName] = data.code
              if (data.name && data.name !== templateName) templateCodes[data.name] = data.code
            }
          } catch (e) {
            console.error(`Fehler beim Laden von Template "${templateName}":`, e)
          }
        }

        // Load directly referenced templates
        await Promise.all(Array.from(templatesToLoad).map(fetchTemplate))

        // Fetch active navigations (MAIN, PAGE, MOBILE) for nav:* placeholders in templates
        let navigations = {};
        try {
          const navRes = await fetch(`/api/navigations?active=true&_t=${Date.now()}`);
          if (navRes.ok) {
            const activeNavs = await navRes.json();
            if (Array.isArray(activeNavs)) {
              // Build nested pages tree for MAIN/MOBILE nav context (published pages only)
              const buildNestedPages = (nodes, parentPath = '') =>
                (nodes || [])
                  .filter(n => n.status === 'PUBLISHED' || n.isHomepage)
                  .map(n => {
                    const slug = parentPath ? `${parentPath}/${n.slug}` : n.slug;
                    const children = buildNestedPages(n.children || [], slug);
                    return { slug, title: n.title, hasChildren: children.length > 0, children };
                  });
              const nestedPages = buildNestedPages(pages);

              // Build anchor list for PAGE context from page.data.anchors (if set)
              const anchors = Array.isArray(foundPage?.data?.anchors) ? foundPage.data.anchors : [];

              for (const nav of activeNavs) {
                const key = String(nav.type).toLowerCase(); // 'main' | 'page' | 'mobile'
                const data = key === 'page' ? { anchors } : { pages: nestedPages };
                navigations[key] = { code: nav.code, data };
              }

              // Auto-nav: auto-generated nested HTML mirroring the page hierarchy
              const currentPath = segments.join('/');
              navigations['auto'] = { code: buildNavHtml(pages, currentPath), data: {} };

              // If this page has a specific navigation assigned, use it as the MAIN nav for this page
              if (foundPage.data?.pageNav) {
                try {
                  const pageNavRes = await fetch(`/api/navigations?id=${encodeURIComponent(foundPage.data.pageNav)}&_t=${Date.now()}`);
                  if (pageNavRes.ok) {
                    const pageNavData = await pageNavRes.json();
                    if (pageNavData && pageNavData.code) {
                      navigations['main'] = { code: pageNavData.code, data: { pages: nestedPages } };
                    }
                  }
                } catch (e) {
                  console.warn('Seiten-spezifische Navigation konnte nicht geladen werden:', e.message);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Navigations konnten nicht geladen werden:', e.message);
        }

        const html = renderPage(foundPage, templateCodes, {
          isChild: segments.length > 1
        }, navigations)
        setHtml(html)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })
  }, [query.slug])

  // Führe inline <script>-Tags im gerenderten HTML aus.
  // React's dangerouslySetInnerHTML wertet Scripts nicht aus — dieser Effect holt das nach.
  // Nur Scripts ohne src-Attribut werden ausgeführt (keine externen URLs).
  useEffect(() => {
    if (!html) return
    const containerId = page?.data?.wrapperId || 'page-html-output'
    const container = document.getElementById(containerId)
    if (!container) return
    container.querySelectorAll('script:not([src])').forEach(old => {
      const s = document.createElement('script')
      s.textContent = old.textContent
      document.body.appendChild(s)
      document.body.removeChild(s)
    })
  }, [html])

  const params = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
  const showDebug = params && params.get('debug') === '1'

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>
  if (!page) return <div style={{ padding: 20 }}>Seite nicht gefunden</div>

  const wrapperProps = { id: 'page-html-output' };
  if (page?.data?.wrapperId) wrapperProps.id = page.data.wrapperId;
  if (page?.data?.wrapperClass) wrapperProps.className = page.data.wrapperClass;

  return (
    <div>
      <div {...wrapperProps} dangerouslySetInnerHTML={{ __html: html }} />
      {showDebug && (
        <div style={{ padding: 12, marginTop: 12, background: '#fff', border: '1px solid #ddd' }}>
          <strong>Debug: rendered HTML (first 2000 chars)</strong>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{String(html || '').slice(0, 2000)}</pre>
        </div>
      )}
    </div>
  )
}
