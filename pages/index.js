import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { renderPage } from '../lib/templateEngine'

const defaultLoadingHtml = '<div style="padding: 20px;">Laedt...</div>'

const applyMaintenanceAssets = (sourceHtml, cssCode, jsCode) => {
  const value = String(sourceHtml || '')
  const styleTag = cssCode ? `<style>\n${String(cssCode)}\n</style>` : ''
  const scriptTag = jsCode ? `<script>\n${String(jsCode)}\n</script>` : ''
  const assets = `${styleTag}${scriptTag}`
  if (!assets) return value

  if (/<\/body>/i.test(value)) {
    return value.replace(/<\/body>/i, `${assets}\n</body>`)
  }
  return `${value}${assets}`
}

export default function Home({ initialLoadingScreenHtml = defaultLoadingHtml, initialLoadingScreenCss = '', initialLoadingScreenJs = '' }) {
  const router = useRouter()
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingScreenHtml, setLoadingScreenHtml] = useState(
    applyMaintenanceAssets(initialLoadingScreenHtml, initialLoadingScreenCss, initialLoadingScreenJs)
  )
  const [homePage, setHomePage] = useState(null)
  const debugRender = process.env.NEXT_PUBLIC_DEBUG_RENDER === 'true'
  const debugLog = (...args) => {
    if (debugRender) console.log(...args)
  }

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

  const loadMaintenanceSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return null
      return await res.json()
    } catch (_) {
      return null
    }
  }

  const buildMaintenanceHtml = (settings, keyPrefix, defaultHtml) => {
    const html = settings?.[`${keyPrefix}_html`] || defaultHtml
    const css = settings?.[`${keyPrefix}_css`] || ''
    const js = settings?.[`${keyPrefix}_js`] || ''
    return applyMaintenanceAssets(html, css, js)
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
    const settings = await loadMaintenanceSettings()
    return buildMaintenanceHtml(settings, 'maintenance_no_homepage', defaultNoHomepageHtml)
  }

  const load503Html = async () => {
    const settings = await loadMaintenanceSettings()
    return buildMaintenanceHtml(settings, 'maintenance_503', default503Html)
  }

  const loadLoadingScreenHtml = async () => {
    const settings = await loadMaintenanceSettings()
    return buildMaintenanceHtml(settings, 'maintenance_loading', defaultLoadingHtml)
  }

  useEffect(() => {
    loadLoadingScreenHtml().then(setLoadingScreenHtml).catch(() => setLoadingScreenHtml(defaultLoadingHtml))
    setLoading(true)

    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const previewMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'
    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`

    const loadLiveRenderMode = async () => {
      try {
        const settingsRes = await fetch(`/api/settings?_t=${Date.now()}`, { cache: 'no-store' })
        if (!settingsRes.ok) return 'dynamic'
        const settings = await settingsRes.json()
        return settings?.liveRenderMode === 'static' ? 'static' : 'dynamic'
      } catch (_e) {
        return 'dynamic'
      }
    }

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

    ;(async () => {
      const liveRenderMode = await loadLiveRenderMode()
      const shouldTryStatic = !previewMode && liveRenderMode === 'static'

      debugLog('[home-route] render mode', { liveRenderMode, previewMode, shouldTryStatic })

      if (shouldTryStatic) {
        try {
          debugLog('[home-route] trying static snapshot', { route: '/__live/index.html' })
          const staticRes = await fetch(`/__live/index.html?_t=${Date.now()}`, { cache: 'no-store' })
          debugLog('[home-route] static snapshot response', {
            ok: staticRes.ok,
            status: staticRes.status,
            contentType: staticRes.headers.get('content-type'),
          })

          if (staticRes.ok) {
            const staticHtml = await staticRes.text()
            const looksLikeLoadingShell = staticHtml.includes('Lädt') || staticHtml.includes('Lade Admin-Daten') || (staticHtml.includes('<!DOCTYPE html>') && staticHtml.length < 5000)
            debugLog('[home-route] using static snapshot', {
              htmlLength: staticHtml.length,
              containsLoadingText: staticHtml.includes('Lädt'),
              containsLoadingDots: staticHtml.includes('Lade Admin-Daten'),
              preview: staticHtml.slice(0, 220),
              looksLikeLoadingShell,
            })

            if (!looksLikeLoadingShell) {
              const metaRes = await fetch(`/__live/__meta.json?_t=${Date.now()}`, { cache: 'no-store' })
              const metaText = await metaRes.text().catch(() => '')
              const metaContentType = metaRes.headers.get('content-type') || ''
              const metaLooksValid = metaRes.ok && metaContentType.includes('application/json') && !metaText.includes('<!DOCTYPE html>')

              debugLog('[home-route] static snapshot meta response', {
                ok: metaRes.ok,
                status: metaRes.status,
                contentType: metaContentType,
                preview: metaText.slice(0, 240),
                metaLooksValid,
              })

              if (metaLooksValid) {
                setHtml(staticHtml)
                setHomePage({ data: {} })
                setLoading(false)
                return
              }
            }
          }
          debugLog('[home-route] static snapshot rejected, falling back to dynamic render')
        } catch (_e) {
          debugLog('[home-route] static snapshot fetch failed, falling back to dynamic render')
        }
      }

      debugLog('[home-route] rendering dynamically')
      startDynamicRender()
    })()
  }, [])

  if (loading) return <div dangerouslySetInnerHTML={{ __html: loadingScreenHtml }} />

  const wrapperProps = {};
  if (homePage?.data?.wrapperId) wrapperProps.id = homePage.data.wrapperId;
  if (homePage?.data?.wrapperClass) wrapperProps.className = homePage.data.wrapperClass;

  return <div {...wrapperProps} dangerouslySetInnerHTML={{ __html: html }} />
}

export async function getServerSideProps() {
  try {
    const { prisma } = await import('../lib/prisma')
    const keys = ['maintenance_loading_html', 'maintenance_loading_css', 'maintenance_loading_js']
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const map = {}
    for (const row of rows || []) {
      map[row.key] = row.value
    }

    return {
      props: {
        initialLoadingScreenHtml: map.maintenance_loading_html || defaultLoadingHtml,
        initialLoadingScreenCss: map.maintenance_loading_css || '',
        initialLoadingScreenJs: map.maintenance_loading_js || '',
      },
    }
  } catch (_e) {
    return {
      props: {
        initialLoadingScreenHtml: defaultLoadingHtml,
        initialLoadingScreenCss: '',
        initialLoadingScreenJs: '',
      },
    }
  }
}
