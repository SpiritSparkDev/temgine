import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { renderTemplate } from '../lib/templateEngine'
import { getPageRedirect, buildRedirectLinkHtml } from '../lib/pageRedirect'
import { loadStaticSnapshot, loadPageData, renderPageHtml, hydratePage, useRerender } from '../lib/renderPipeline'
import { stripBlockedIframeSrcs, getConsent } from '../lib/cookieConsentRuntime'
import SeoHead from '../components/SeoHead'

const defaultLoadingHtml = '<div style="padding: 20px;">Lädt...</div>'

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

export default function Home({ initialLoadingScreenHtml = defaultLoadingHtml, initialLoadingScreenCss = '', initialLoadingScreenJs = '', seoMeta = null }) {
  const router = useRouter()
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingScreenHtml, setLoadingScreenHtml] = useState(
    applyMaintenanceAssets(initialLoadingScreenHtml, initialLoadingScreenCss, initialLoadingScreenJs)
  )
  const [homePage, setHomePage] = useState(null)
  // Picgine-Entsperren/Logout: neu rendern ohne Ladebildschirm (siehe lib/renderPipeline.js)
  const { token: rerenderToken, rerender, consumeSilent } = useRerender()

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

  const loadGlobalVars = async () => {
    try {
      const res = await fetch(`/api/global-variables?active=true&_t=${Date.now()}`)
      if (!res.ok) return {}
      return await res.json()
    } catch (_) {
      return {}
    }
  }

  const buildMaintenanceHtml = async (settings, keyPrefix, defaultHtml) => {
    const html = settings?.[`${keyPrefix}_html`] || defaultHtml
    const css = settings?.[`${keyPrefix}_css`] || ''
    const js = settings?.[`${keyPrefix}_js`] || ''
    const globalVars = await loadGlobalVars()
    const renderedHtml = renderTemplate(html, { global: globalVars })
    return applyMaintenanceAssets(renderedHtml, css, js)
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
    if (!consumeSilent()) setLoading(true)

    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
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

        // target "_self" ist bereits serverseitig in getServerSideProps als echte
        // HTTP-Weiterleitung abgefangen worden — dieser Fallback greift nur, wenn
        // das nicht der Fall war (z. B. unveröffentlichte Startseite). "_blank"
        // kann grundsätzlich nicht automatisch weiterleiten und rendert
        // stattdessen einen normalen, klickbaren Link (lib/pageRedirect.js).
        const homeRedirect = getPageRedirect(homePage)
        if (homeRedirect) {
          if (homeRedirect.target === '_blank') {
            setHtml(buildRedirectLinkHtml(homePage.title, homeRedirect.url))
          } else {
            window.location.href = homeRedirect.url
            setHtml('<div style="padding: 40px; text-align: center;"><p>Weiterleitung...</p></div>')
          }
          setLoading(false)
          return
        }

        const pageData = await loadPageData(homePage, pages)

        // Rendere Seite
        const html = renderPageHtml(homePage, pageData, { isChild: false })
        setHtml(html)
        setHomePage(homePage)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })

    ;(async () => {
      const snapshot = await loadStaticSnapshot([])
      if (snapshot) {
        setHtml(snapshot.html)
        setHomePage({ data: {} })
        setLoading(false)
        return
      }
      startDynamicRender()
    })()
  }, [rerenderToken])

  // Kontaktformulare, Picgine und Consent-Embeds im gerenderten HTML verdrahten
  // (lib/renderPipeline.js). Kernverhalten, nicht Teil des abschaltbaren /api/js-Bundles.
  useEffect(() => {
    if (!html) return
    const containerId = homePage?.data?.wrapperId || 'page-html-output'
    hydratePage(document.getElementById(containerId), rerender)
  }, [html])

  // Strip not-yet-consented embed srcs before React ever inserts the HTML.
  // Memoized on html only: a consent change must not alter the string, or
  // React would reset innerHTML and wipe the hydrated DOM.
  const gatedHtml = useMemo(() => stripBlockedIframeSrcs(html, getConsent()), [html])

  if (loading) return (
    <>
      <SeoHead meta={seoMeta} />
      <div dangerouslySetInnerHTML={{ __html: loadingScreenHtml }} />
    </>
  )

  const wrapperProps = { id: 'page-html-output' };
  if (homePage?.data?.wrapperId) wrapperProps.id = homePage.data.wrapperId;
  if (homePage?.data?.wrapperClass) wrapperProps.className = homePage.data.wrapperClass;

  return (
    <>
      <SeoHead meta={seoMeta} />
      <div {...wrapperProps} dangerouslySetInnerHTML={{ __html: gatedHtml }} />
    </>
  )
}

export async function getServerSideProps(context) {
  let seoMeta = null
  try {
    const { resolveSeoMetaForRoute } = await import('../lib/seo')
    const { getPageRedirect } = await import('../lib/pageRedirect')
    const { meta, found, page } = await resolveSeoMetaForRoute(context.req, '/', [])
    seoMeta = meta

    const redirect = getPageRedirect(page)
    if (redirect && redirect.target === '_self') {
      return { redirect: { destination: redirect.url, permanent: redirect.type === 'permanent' } }
    }

    if (!found) context.res.statusCode = 404
  } catch (_e) {
    seoMeta = null
  }

  try {
    const { getMaintenancePage } = await import('../lib/maintenanceStore')
    const { renderTemplate } = await import('../lib/templateEngine')
    const { buildGlobalContext } = await import('../lib/globalVariables')
    const { prisma } = await import('../lib/prisma')
    const { html, css, js } = getMaintenancePage('loading')
    const globalVariableRows = await prisma.globalVariable.findMany({ where: { isActive: true } })
    const globalVars = buildGlobalContext(globalVariableRows)

    return {
      props: {
        initialLoadingScreenHtml: renderTemplate(html || defaultLoadingHtml, { global: globalVars }),
        initialLoadingScreenCss: css || '',
        initialLoadingScreenJs: js || '',
        seoMeta,
      },
    }
  } catch (_e) {
    return {
      props: {
        initialLoadingScreenHtml: defaultLoadingHtml,
        initialLoadingScreenCss: '',
        initialLoadingScreenJs: '',
        seoMeta,
      },
    }
  }
}
