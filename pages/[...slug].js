import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { renderTemplate } from '../lib/templateEngine'
import { getPageRedirect, buildRedirectLinkHtml } from '../lib/pageRedirect'
import { loadStaticSnapshot, loadPageData, renderPageHtml, runInlineScripts, hydrateBlogChannels, hydratePage, useRerender } from '../lib/renderPipeline'
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

export default function PageCatchAll({ initialLoadingScreenHtml = defaultLoadingHtml, initialLoadingScreenCss = '', initialLoadingScreenJs = '', seoMeta = null }) {
  const router = useRouter()
  const { query } = router
  const { data: session, status: sessionStatus } = useSession()
  const [page, setPage] = useState(null)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingScreenHtml, setLoadingScreenHtml] = useState(
    applyMaintenanceAssets(initialLoadingScreenHtml, initialLoadingScreenCss, initialLoadingScreenJs)
  )
  const [accessDenied, setAccessDenied] = useState(false)
  const [passwordGate, setPasswordGate] = useState(null) // { pageId } | null
  // reload: nach Passwort-Entsperren; rerender: Picgine-Entsperren/Logout ohne Ladebildschirm
  const { token: reloadToken, reload, rerender, consumeSilent } = useRerender()
  const debugRender = process.env.NEXT_PUBLIC_DEBUG_RENDER === 'true'
  const debugLog = (...args) => {
    if (debugRender) console.log(...args)
  }

  const default404Html = '<div style="padding: 40px; text-align: center;"><h1>Seite nicht gefunden</h1></div>'
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
      const settingsRes = await fetch('/api/settings')
      if (!settingsRes.ok) return null
      return await settingsRes.json()
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
      const settingsRes = await fetch('/api/settings')
      if (!settingsRes.ok) return false
      const settings = await settingsRes.json()
      return settings?.maintenance_mode_enabled === 'true'
    } catch (_) {
      return false
    }
  }

  const loadMaintenance404Html = async () => {
    const settings = await loadMaintenanceSettings()
    return buildMaintenanceHtml(settings, 'maintenance_404', default404Html)
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
    const raw = query.slug
    if (raw === undefined) return

    debugLog('[page-route] route effect start', {
      raw,
      pathname: router.pathname,
      asPath: router.asPath,
      query,
    })

    if (!consumeSilent()) setLoading(true)
    setPasswordGate(null)

    let cancelled = false

    const segments = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);

    (async () => {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const snapshot = await loadStaticSnapshot(segments)
    if (snapshot) {
      if (cancelled) return
      setPage(snapshot.notFound ? { title: '404', data: {} } : { title: '', data: {} })
      setHtml(snapshot.html)
      setLoading(false)
      return
    }

    debugLog('[page-route] falling back to dynamic render', { segments })

    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`;

    // Prüfe zuerst Wartungsmodus
    const isMaintenanceMode = await checkMaintenanceMode()
    debugLog('[page-route] maintenance mode check', { isMaintenanceMode })
    if (isMaintenanceMode) {
      const maintenance503Html = await load503Html()
      const cssLinks = await loadActiveCssLinks()
      debugLog('[page-route] using maintenance html', {
        htmlLength: maintenance503Html.length,
        cssLinksLength: cssLinks.length,
      })
      if (cancelled) return
      setPage({ title: '503', data: {} })
      setHtml(injectCssLinks(maintenance503Html, cssLinks))
      setLoading(false)
      return
    }

    // ── Blog routing: check if the first segment matches a BlogChannel slug ──
    // Pattern: /[channelSlug]/[postSlug] → reading page
    if (segments.length === 2) {
      try {
        const blogRes = await fetch(`/api/blog/public/${encodeURIComponent(segments[0])}/${encodeURIComponent(segments[1])}`)
        if (blogRes.ok) {
          const { channel, post } = await blogRes.json()
          // Load reading template
          const templateName = channel.templateReading
          let postHtml = ''
          if (templateName) {
            const tRes = await fetch(`/api/templates?name=${encodeURIComponent(templateName)}`)
            if (tRes.ok) {
              const tData = await tRes.json()
              postHtml = renderTemplate(tData.code, {
                ...post,
                channel,
                channelUrl: `/${channel.slug}`,
                postUrl: `/${channel.slug}/${post.slug}`,
              })
            }
          }
          if (!postHtml) {
            // Fallback: minimal HTML if no template assigned
            postHtml = `<article><h1>${post.title || ''}</h1>${post.body || ''}</article>`
          }
          if (cancelled) return
          setHtml(postHtml)
          setPage({ title: post.title, data: {} })
          setLoading(false)
          return
        }
        // 404 from blog API → fall through to normal page routing
      } catch (e) {
        // Network error → fall through to normal page routing
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      const pagesRaw = await fetch(pagesUrl)
      const pages = await pagesRaw.json()
      if (cancelled) return
      if (!Array.isArray(pages)) {
        setPage(null); setLoading(false); return
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
      if (!foundPage && segments.length === 0) foundPage = pages.find(p => p.isHomepage === true)
      if (!foundPage) {
        const maintenance404Html = await loadMaintenance404Html()
        const cssLinks = await loadActiveCssLinks()
        if (cancelled) return
        setPage({ title: '404', data: {} })
        setHtml(injectCssLinks(maintenance404Html, cssLinks))
        setLoading(false)
        return
      }

      if (cancelled) return
      setPage(foundPage)

      // ── Access Control ──────────────────────────────────────────────────
      const ag = Array.isArray(foundPage.accessGroups) ? foundPage.accessGroups : [];
      if (ag.length > 0) {
        const isMember = session?.user?.accountType === 'member';
        const memberGroups = Array.isArray(session?.user?.memberGroups) ? session.user.memberGroups : [];
        if (!isMember) {
          // Not logged in → redirect to member login
          if (cancelled) return;
          const slug = segments.join('/');
          router.replace(`/member-login?redirect=/${slug}`);
          return;
        }
        if (!ag.includes('*')) {
          // Check specific groups
          const hasAccess = ag.some(g => memberGroups.includes(g));
          if (!hasAccess) {
            if (cancelled) return;
            setAccessDenied(true);
            setLoading(false);
            return;
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Passwortschutz (entschärfte Variante ohne Mitgliedskonto) ───────
      if (foundPage.passwordProtected) {
        let unlocked = false;
        try {
          const lockRes = await fetch(`/api/pages/password-lock?pageId=${encodeURIComponent(foundPage.id)}`);
          const lockData = lockRes.ok ? await lockRes.json() : { unlocked: false };
          unlocked = Boolean(lockData.unlocked);
        } catch (_e) {
          unlocked = false;
        }
        if (!unlocked) {
          if (cancelled) return;
          setPasswordGate({ pageId: foundPage.id });
          setLoading(false);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // target "_self" ist bereits serverseitig in getServerSideProps als echte
      // HTTP-Weiterleitung abgefangen worden (siehe oben) — läuft dieser Code
      // trotzdem noch (z. B. Vorschau eines Entwurfs lokal, der dort nicht
      // geladen wird), greift hier derselbe Fallback. "_blank" kann grundsätzlich
      // nicht automatisch weiterleiten (ein neuer Tab lässt sich nicht per
      // HTTP-Header öffnen) und rendert stattdessen einen normalen, klickbaren
      // Link zum Ziel — siehe lib/pageRedirect.js.
      const pageRedirect = getPageRedirect(foundPage)
      if (pageRedirect) {
        if (cancelled) return
        if (pageRedirect.target === '_blank') {
          setHtml(buildRedirectLinkHtml(foundPage.title, pageRedirect.url))
        } else {
          window.location.href = pageRedirect.url
          setHtml('<div style="padding: 40px; text-align: center;"><p>Weiterleitung...</p></div>')
        }
        setLoading(false)
        return
      }

      const pageData = await loadPageData(foundPage, pages, { currentPath: segments.join('/') })
      const html = renderPageHtml(foundPage, pageData, { isChild: segments.length > 1 })
      if (cancelled) return
      setHtml(html)
      setLoading(false)
    } catch (err) {
      console.error('Fehler beim Laden:', err)
      if (!cancelled) setLoading(false)
    }
    })() // end IIFE

    return () => { cancelled = true }
  }, [query.slug, session, sessionStatus, reloadToken])

  async function submitPasswordUnlock(pageId, password) {
    try {
      const res = await fetch('/api/pages/password-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, password }),
      })
      if (res.ok) {
        reload()
        return { ok: true }
      }
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.error || 'Falsches Passwort.' }
    } catch (_e) {
      return { ok: false, error: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.' }
    }
  }

  useEffect(() => {
    loadLoadingScreenHtml().then(setLoadingScreenHtml).catch(() => setLoadingScreenHtml(defaultLoadingHtml))
  }, [])

  // Inline-Scripts ausführen, Blog-Kanäle füllen, dann Kontaktformulare, Picgine und
  // Consent-Embeds verdrahten (lib/renderPipeline.js). Kernverhalten, nicht Teil des
  // abschaltbaren /api/js-Bundles.
  useEffect(() => {
    if (!html) return
    const containerId = page?.data?.wrapperId || 'page-html-output'
    const container = document.getElementById(containerId)
    runInlineScripts(container)
    hydrateBlogChannels(container)
    hydratePage(container, rerender)
  }, [html])

  const params = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
  const showDebug = params && params.get('debug') === '1'

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
  if (accessDenied) return (
    <>
      <SeoHead meta={seoMeta} />
      <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Kein Zugriff</h1>
        <p style={{ color: '#6b7280' }}>Du hast keine Berechtigung, diese Seite zu sehen.</p>
      </div>
    </>
  )
  if (passwordGate) return (
    <>
      <SeoHead meta={seoMeta} />
      <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Geschützter Bereich</h1>
        <p style={{ color: '#6b7280', marginBottom: '8px' }}>Diese Seite ist passwortgeschützt. Bitte gib das Passwort ein.</p>
        <PasswordGateForm onSubmit={(password) => submitPasswordUnlock(passwordGate.pageId, password)} />
      </div>
    </>
  )
  if (!page) return (
    <>
      <SeoHead meta={seoMeta} />
      <div style={{ padding: 20 }}>Seite nicht gefunden</div>
    </>
  )

  const wrapperProps = { id: 'page-html-output' };
  if (page?.data?.wrapperId) wrapperProps.id = page.data.wrapperId;
  if (page?.data?.wrapperClass) wrapperProps.className = page.data.wrapperClass;

  return (
    <div>
      <SeoHead meta={seoMeta} />
      <div {...wrapperProps} dangerouslySetInnerHTML={{ __html: gatedHtml }} />
      {showDebug && (
        <div style={{ padding: 12, marginTop: 12, background: '#fff', border: '1px solid #ddd' }}>
          <strong>Debug: rendered HTML (first 2000 chars)</strong>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{String(html || '').slice(0, 2000)}</pre>
        </div>
      )}
    </div>
  )
}

function PasswordGateForm({ onSubmit }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!value || submitting) return
    setSubmitting(true)
    setError('')
    const result = await onSubmit(value)
    setSubmitting(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline-block', textAlign: 'left', marginTop: '16px' }}>
      <input
        type="password"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Passwort"
        autoFocus
        autoComplete="current-password"
        style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', marginRight: '8px' }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{ padding: '10px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
      >
        {submitting ? 'Prüfe…' : 'Bestätigen'}
      </button>
      {error && <p style={{ color: '#991b1b', marginTop: '10px', fontSize: '0.875rem' }}>{error}</p>}
    </form>
  )
}

export async function getServerSideProps(context) {
  const rawSlug = context?.params?.slug
  const slug = Array.isArray(rawSlug) ? rawSlug.filter(Boolean) : (rawSlug ? [rawSlug] : [])
  const path = slug.length ? `/${slug.join('/')}` : '/'
  const staticPrefixes = ['/extern_css', '/uploads', '/assets', '/favicon', '/_next']

  if (staticPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) {
    return {
      notFound: true,
    }
  }

  let seoMeta = null
  try {
    const { resolveSeoMetaForRoute, findBlogPostForRoute, buildBlogPostMeta } = await import('../lib/seo')
    const { getPageRedirect } = await import('../lib/pageRedirect')
    const { meta, found, settings, baseUrl, page } = await resolveSeoMetaForRoute(context.req, path, slug)
    seoMeta = meta
    let resolvedFound = found

    // Weiterleitung auf Ziel-Target "_self" ist eine echte HTTP-Weiterleitung —
    // muss feuern, bevor überhaupt Blöcke/HTML gerendert werden (auch für
    // Crawler/curl, die kein JS ausführen). "_blank" kann das nicht (siehe
    // lib/pageRedirect.js) und wird stattdessen clientseitig behandelt.
    const redirect = getPageRedirect(page)
    if (redirect && redirect.target === '_self') {
      return { redirect: { destination: redirect.url, permanent: redirect.type === 'permanent' } }
    }

    if (!found && slug.length === 2) {
      // Route matcht keine Page — evtl. ein Blog-Beitrag (/[channelSlug]/[postSlug]),
      // die eigene Tabellen statt des Page-Baums nutzen (siehe Blog-Routing weiter unten).
      const blogMatch = await findBlogPostForRoute(slug[0], slug[1])
      if (blogMatch) {
        seoMeta = buildBlogPostMeta({ post: blogMatch.post, routePath: path, baseUrl, settings })
        resolvedFound = true
      }
    }

    // Kein Treffer per Pfad: entweder eine clientseitig per Wartungsseite
    // dargestellte 404 oder wirklich nichts vorhanden — in beiden Fällen ist
    // "nicht gefunden" der korrekte HTTP-Status.
    if (!resolvedFound) context.res.statusCode = 404
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
