import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { renderPage } from '../lib/templateEngine'

export default function Home() {
  const router = useRouter()
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [homePage, setHomePage] = useState(null)

  const defaultNoHomepageHtml = '<div style="padding: 40px; text-align: center;"><h1>Keine Startseite gefunden</h1></div>'
  const default503Html = '<div style="padding: 40px; text-align: center;"><h1>Service vorübergehend nicht verfügbar</h1><p>Bitte versuche es später erneut.</p></div>'

  const loadActiveCssLinks = async () => {
    try {
      const cssRes = await fetch('/api/css')
      if (!cssRes.ok) return ''
      const cssData = await cssRes.json()
      const files = Array.isArray(cssData?.files) ? cssData.files : []
      return files
        .filter(f => f && f.enabled !== false && f.href)
        .map(f => `<link rel="stylesheet" href="${String(f.href).replace(/"/g, '&quot;')}">`)
        .join('\n')
    } catch (_) {
      return ''
    }
  }

  const injectCssLinks = (sourceHtml, cssLinks) => {
    if (!cssLinks) return sourceHtml
    const value = String(sourceHtml || '')
    if (/<\/head>/i.test(value)) {
      return value.replace(/<\/head>/i, `${cssLinks}\n</head>`)
    }
    if (/<body[^>]*>/i.test(value)) {
      return value.replace(/<body([^>]*)>/i, `<body$1>${cssLinks}`)
    }
    return `${cssLinks}${value}`
  }

  const checkMaintenanceMode = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return false
      const settings = await res.json()
      return settings?.maintenance_mode_enabled === 'true'
    } catch (_) {
      return false
    }
  }

  const loadNoHomepageHtml = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return defaultNoHomepageHtml
      const settings = await res.json()
      return settings?.maintenance_no_homepage_html || defaultNoHomepageHtml
    } catch (_) {
      return defaultNoHomepageHtml
    }
  }

  const load503Html = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return default503Html
      const settings = await res.json()
      return settings?.maintenance_503_html || default503Html
    } catch (_) {
      return default503Html
    }
  }

  useEffect(() => {
    setLoading(true)

    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const previewMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'
    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`

    const startDynamicRender = () => fetch(pagesUrl)
      .then(r => r.json())
      .then(async pages => {
        // Prüfe zuerst Wartungsmodus
        const isMaintenanceMode = await checkMaintenanceMode()
        if (isMaintenanceMode) {
          const maintenance503Html = await load503Html()
          const cssLinks = await loadActiveCssLinks()
          setHtml(injectCssLinks(maintenance503Html, cssLinks))
          setLoading(false)
          return
        }

        if (!Array.isArray(pages)) {
          console.error('Pages ist kein Array!')
          setLoading(false)
          return
        }
        
        // Finde die Startseite: erste Seite mit isHomepage=true, oder fallback auf demo-home/home/erste Seite
        let homePage = pages.find(p => p.isHomepage === true) || pages.find(p => p.id === 'demo-home' || p.slug === 'home') || pages[0]
        
        // Wenn keine Homepage in veröffentlichten Seiten gefunden: nochmal mit includeDrafts suchen
        if (!homePage) {
          try {
            const fallbackRes = await fetch(`/api/pages?includeDrafts=true&_t=${Date.now()}`)
            const allPages = await fallbackRes.json()
            if (Array.isArray(allPages)) {
              homePage = allPages.find(p => p.isHomepage === true) || allPages.find(p => p.slug === 'home') || allPages[0]
            }
          } catch (_) {}
        }

        if (!homePage) {
          const noHomepageHtml = await loadNoHomepageHtml()
          const cssLinks = await loadActiveCssLinks()
          setHtml(injectCssLinks(noHomepageHtml, cssLinks))
          setLoading(false)
          return
        }

        // Prüfe auf externe Weiterleitung
        if (homePage.redirectType === 'external' && homePage.redirectUrl) {
          window.location.href = homePage.redirectUrl
          setHtml('<div style="padding: 40px; text-align: center;"><p>Weiterleitung...</p></div>')
          setLoading(false)
          return
        }

        // 404 und 503 werden als normale Seiten mit Blöcken gerendert
        // Die redirectType Information wird nur für die Anzeige verwendet

        // Sammle alle Templates
        const templatesToLoad = new Set()
        const collectBlockTemplates = (blocks) => {
          if (!Array.isArray(blocks)) return
          for (const block of blocks) {
            const tname = block.template || block.type
            if (tname) templatesToLoad.add(tname)
            if (block.children && block.children.length > 0) collectBlockTemplates(block.children)
          }
        }
        collectBlockTemplates(homePage.blocks)
        if (homePage.template) templatesToLoad.add(homePage.template)

        // Lade alle Templates
        const templateCodes = {}
        await Promise.all(
          Array.from(templatesToLoad).map(async templateName => {
            try {
              const res = await fetch(`/api/templates?name=${encodeURIComponent(templateName)}&_t=${Date.now()}`)
              if (res.ok) {
                const data = await res.json()
                templateCodes[templateName] = data.code
              }
            } catch (e) {
              console.error(`Fehler beim Laden von Template "${templateName}":`, e)
            }
          })
        )

        // Lade aktive Navigationen (gleiche Logik wie in [...slug].js)
        const navigations = {}
        try {
          const navRes = await fetch(`/api/navigations?active=true&_t=${Date.now()}`)
          if (navRes.ok) {
            const activeNavs = await navRes.json()
            if (Array.isArray(activeNavs)) {
              const buildNestedPages = (nodes, parentPath = '') =>
                (nodes || [])
                  .filter(n => (n.status === 'PUBLISHED' || n.isHomepage) && !Boolean(n?.data?.ignoreInNavigation))
                  .map(n => {
                    const slug = parentPath ? `${parentPath}/${n.slug}` : n.slug
                    const children = buildNestedPages(n.children || [], slug)
                    return { slug, title: n.title, hasChildren: children.length > 0, children }
                  })
              const nestedPages = buildNestedPages(pages)

              const anchors = Array.isArray(homePage?.data?.anchors) ? homePage.data.anchors : []

              for (const nav of activeNavs) {
                const key = String(nav.type).toLowerCase()
                const data = key === 'page' ? { anchors } : { pages: nestedPages }
                navigations[key] = { code: nav.code, data }
              }

              // If this page has a specific navigation assigned, use it as the MAIN nav
              if (homePage?.data?.pageNav) {
                try {
                  const pageNavRes = await fetch(`/api/navigations?id=${encodeURIComponent(homePage.data.pageNav)}&_t=${Date.now()}`)
                  if (pageNavRes.ok) {
                    const pageNavData = await pageNavRes.json()
                    if (pageNavData && pageNavData.code) {
                      navigations['main'] = { code: pageNavData.code, data: { pages: nestedPages } }
                    }
                  }
                } catch (e) {
                  console.warn('Seiten-spezifische Navigation konnte nicht geladen werden:', e.message)
                }
              }
            }
          }
        } catch (e) {
          console.error('Fehler beim Laden der Navigationen:', e)
        }

        // Rendere Seite
        const html = renderPage(homePage, templateCodes, { isChild: false }, navigations)
        setHtml(html)
        setHomePage(homePage)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })

    if (!isLocal && !previewMode) {
      console.log('[home-route] trying static snapshot', { route: '/__live/index.html' })
      fetch(`/__live/index.html?_t=${Date.now()}`, { cache: 'no-store' })
        .then(async (res) => {
          console.log('[home-route] static snapshot response', {
            ok: res.ok,
            status: res.status,
            contentType: res.headers.get('content-type'),
          })
          if (!res.ok) return null
          return res.text()
        })
        .then((staticHtml) => {
          if (staticHtml) {
            const looksLikeLoadingShell = staticHtml.includes('Lädt') || staticHtml.includes('Lade Admin-Daten') || staticHtml.includes('<!DOCTYPE html>') && staticHtml.length < 5000
            console.log('[home-route] using static snapshot', {
              htmlLength: staticHtml.length,
              containsLoadingText: staticHtml.includes('Lädt'),
              containsLoadingDots: staticHtml.includes('Lade Admin-Daten'),
              preview: staticHtml.slice(0, 220),
              looksLikeLoadingShell,
            })
            if (looksLikeLoadingShell) {
              console.log('[home-route] static snapshot rejected, falling back to dynamic render')
              startDynamicRender()
              return
            }
            fetch(`/__live/__meta.json?_t=${Date.now()}`, { cache: 'no-store' })
              .then(async (metaRes) => {
                const metaText = await metaRes.text().catch(() => '')
                const metaContentType = metaRes.headers.get('content-type') || ''
                console.log('[home-route] static snapshot meta response', {
                  ok: metaRes.ok,
                  status: metaRes.status,
                  contentType: metaContentType,
                  preview: metaText.slice(0, 240),
                })
                if (!metaContentType.includes('application/json') || metaText.includes('<!DOCTYPE html>')) {
                  console.log('[home-route] static snapshot meta rejected, falling back to dynamic render')
                  startDynamicRender()
                }
              })
              .catch((err) => {
                console.log('[home-route] static snapshot meta fetch failed', {
                  error: err?.message || String(err),
                })
                startDynamicRender()
              })
            setHtml(staticHtml)
            setHomePage({ data: {} })
            setLoading(false)
            return
          }
          console.log('[home-route] static snapshot missing, falling back to dynamic render')
          startDynamicRender()
        })
        .catch(() => {
          console.log('[home-route] static snapshot fetch failed, falling back to dynamic render')
          startDynamicRender()
        })
      return
    }

    console.log('[home-route] rendering dynamically without static snapshot')
    startDynamicRender()
  }, [])

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>

  const wrapperProps = {};
  if (homePage?.data?.wrapperId) wrapperProps.id = homePage.data.wrapperId;
  if (homePage?.data?.wrapperClass) wrapperProps.className = homePage.data.wrapperClass;

  return <div {...wrapperProps} dangerouslySetInnerHTML={{ __html: html }} />
}
