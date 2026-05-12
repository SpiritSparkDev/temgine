import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { renderPage, renderTemplate, buildNavHtml } from '../lib/templateEngine'

export default function PageCatchAll() {
  const router = useRouter()
  const { query } = router
  const { data: session, status: sessionStatus } = useSession()
  const [page, setPage] = useState(null)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
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
    try {
      const settingsRes = await fetch('/api/settings')
      if (!settingsRes.ok) return default404Html
      const settings = await settingsRes.json()
      return settings?.maintenance_404_html || default404Html
    } catch (_) {
      return default404Html
    }
  }

  const load503Html = async () => {
    try {
      const settingsRes = await fetch('/api/settings')
      if (!settingsRes.ok) return default503Html
      const settings = await settingsRes.json()
      return settings?.maintenance_503_html || default503Html
    } catch (_) {
      return default503Html
    }
  }

  const loadLiveRenderMode = async () => {
    try {
      const settingsRes = await fetch(`/api/settings?_t=${Date.now()}`, { cache: 'no-store' })
      if (!settingsRes.ok) return 'dynamic'
      const settings = await settingsRes.json()
      return settings?.liveRenderMode === 'static' ? 'static' : 'dynamic'
    } catch (_) {
      return 'dynamic'
    }
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

    setLoading(true)

    const segments = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);

    (async () => {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const previewMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'
    const liveRenderMode = await loadLiveRenderMode()
    const shouldTryStatic = !previewMode && liveRenderMode === 'static'

    debugLog('[page-route] render mode decision', {
      isLocal,
      previewMode,
      liveRenderMode,
      shouldTryStatic,
      segments,
      currentUrl: typeof window !== 'undefined' ? window.location.href : null,
    })

    if (shouldTryStatic) {
      try {
        const routePath = segments.length ? `/${segments.join('/')}` : '/'
        const staticRoute = routePath === '/' ? '/__live/index.html' : `/__live${routePath}/index.html`
        debugLog('[page-route] trying static snapshot', { routePath, staticRoute })
        const staticRes = await fetch(`${staticRoute}?_t=${Date.now()}`, { cache: 'no-store' })
        debugLog('[page-route] static snapshot response', {
          ok: staticRes.ok,
          status: staticRes.status,
          contentType: staticRes.headers.get('content-type'),
          url: staticRoute,
        })
        if (staticRes.ok) {
          const staticHtml = await staticRes.text()
          const looksLikeLoadingShell = staticHtml.includes('Lädt') || staticHtml.includes('Lade Admin-Daten') || (staticHtml.includes('<!DOCTYPE html>') && staticHtml.length < 5000)
          debugLog('[page-route] static snapshot loaded', {
            routePath,
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

            debugLog('[page-route] static meta response', {
              ok: metaRes.ok,
              status: metaRes.status,
              contentType: metaContentType,
              preview: metaText.slice(0, 240),
              metaLooksValid,
            })

            if (metaLooksValid) {
              setPage({ title: '', data: {} })
              setHtml(staticHtml)
              setLoading(false)
              return
            }
          }

          if (routePath !== '/') {
            const notFoundRes = await fetch(`/__live/404.html?_t=${Date.now()}`, { cache: 'no-store' })
            debugLog('[page-route] static 404 response', {
              ok: notFoundRes.ok,
              status: notFoundRes.status,
              contentType: notFoundRes.headers.get('content-type'),
            })
            if (notFoundRes.ok) {
              const notFoundHtml = await notFoundRes.text()
              const looksInvalid404 = notFoundHtml.includes('Lädt') || (notFoundHtml.includes('<!DOCTYPE html>') && notFoundHtml.length < 5000)
              if (!looksInvalid404) {
                debugLog('[page-route] using static 404 fallback', { htmlLength: notFoundHtml.length })
                setPage({ title: '404', data: {} })
                setHtml(notFoundHtml)
                setLoading(false)
                return
              }
            }
          }
        }
      } catch (_e) {
        debugLog('[page-route] static snapshot failed, falling back to dynamic render', {
          error: _e?.message || String(_e),
        })
      }
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
          const maintenance404Html = await loadMaintenance404Html()
          const cssLinks = await loadActiveCssLinks()
          setPage({ title: '404', data: {} })
          setHtml(injectCssLinks(maintenance404Html, cssLinks))
          setLoading(false)
          return
        }
      }

      setPage(foundPage)

      // ── Access Control ──────────────────────────────────────────────────
      const ag = Array.isArray(foundPage.accessGroups) ? foundPage.accessGroups : [];
      if (ag.length > 0) {
        const isMember = session?.user?.accountType === 'member';
        const memberGroups = Array.isArray(session?.user?.memberGroups) ? session.user.memberGroups : [];
        if (!isMember) {
          // Not logged in → redirect to member login
          const slug = segments.join('/');
          router.replace(`/member-login?redirect=/${slug}`);
          return;
        }
        if (!ag.includes('*')) {
          // Check specific groups
          const hasAccess = ag.some(g => memberGroups.includes(g));
          if (!hasAccess) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────

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
      console.debug('catchall: templatesToLoad ->', Array.from(templatesToLoad))

      const templateCodes = {}
      const fetchTemplate = async (templateName) => {
        if (templateCodes[templateName] !== undefined) return
        templateCodes[templateName] = null
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
      await Promise.all(Array.from(templatesToLoad).map(fetchTemplate))

      let navigations = {};
      try {
        const navRes = await fetch(`/api/navigations?active=true&_t=${Date.now()}`);
        if (navRes.ok) {
          const activeNavs = await navRes.json();
          if (Array.isArray(activeNavs)) {
            const buildNestedPages = (nodes, parentPath = '') =>
              (nodes || [])
                .filter(n => (n.status === 'PUBLISHED' || n.isHomepage) && !Boolean(n?.data?.ignoreInNavigation))
                .map(n => {
                  const slug = parentPath ? `${parentPath}/${n.slug}` : n.slug;
                  const children = buildNestedPages(n.children || [], slug);
                  return { slug, title: n.title, hasChildren: children.length > 0, children };
                });
            const nestedPages = buildNestedPages(pages);
            const anchors = Array.isArray(foundPage?.data?.anchors) ? foundPage.data.anchors : [];
            for (const nav of activeNavs) {
              const key = String(nav.type).toLowerCase();
              const data = key === 'page' ? { anchors } : { pages: nestedPages };
              navigations[key] = { code: nav.code, data };
            }
            const currentPath = segments.join('/');
            navigations['auto'] = { code: buildNavHtml(pages, currentPath), data: {} };
            if (foundPage.data?.pageNav) {
              try {
                const pageNavRes = await fetch(`/api/navigations?id=${encodeURIComponent(foundPage.data.pageNav)}&_t=${Date.now()}`);
                if (pageNavRes.ok) {
                  const pageNavData = await pageNavRes.json();
                  if (pageNavData && pageNavData.code) navigations['main'] = { code: pageNavData.code, data: { pages: nestedPages } };
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

      const html = renderPage(foundPage, templateCodes, { isChild: segments.length > 1 }, navigations)
      setHtml(html)
      setLoading(false)
    } catch (err) {
      console.error('Fehler beim Laden:', err)
      setLoading(false)
    }
    })() // end IIFE
  }, [query.slug, session, sessionStatus])

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

  // Hydrate blog-channel placeholder divs after HTML is set.
  // Each <div class="blog-channel-block" data-channel="…" data-slot="…" data-template="…" data-limit="…">
  // is filled with rendered post cards fetched from the public API.
  useEffect(() => {
    if (!html) return;
    const containerId = page?.data?.wrapperId || 'page-html-output';
    const container = document.getElementById(containerId);
    if (!container) return;
    const blocks = container.querySelectorAll('.blog-channel-block[data-channel]');
    if (!blocks.length) return;

    blocks.forEach(async (el) => {
      const channelSlug = el.getAttribute('data-channel');
      const templateSlot = el.getAttribute('data-slot') || 'templateDetailPreview';
      const directTemplateName = String(el.getAttribute('data-template') || '').trim();
      const limit = parseInt(el.getAttribute('data-limit'), 10) || 6;
      if (!channelSlug) return;

      try {
        // 1. Fetch published posts
        const postsRes = await fetch(`/api/blog/public/${encodeURIComponent(channelSlug)}?limit=${limit}`);
        if (!postsRes.ok) return;
        const { channel, posts } = await postsRes.json();

        if (!posts || !posts.length) {
          el.innerHTML = '';
          return;
        }

        // 2. Resolve template candidates: explicit override first, then channel slot
        const slotTemplateName = channel && channel[templateSlot] ? String(channel[templateSlot]).trim() : '';
        const candidates = [];
        if (directTemplateName) candidates.push(directTemplateName);
        if (slotTemplateName && slotTemplateName !== directTemplateName) candidates.push(slotTemplateName);

        let tCode = '';
        for (const name of candidates) {
          try {
            const tRes = await fetch(`/api/templates?name=${encodeURIComponent(name)}`);
            if (!tRes.ok) continue;
            const tData = await tRes.json();
            if (tData && tData.code) {
              tCode = String(tData.code);
              break;
            }
          } catch (_) {
            // keep trying next candidate
          }
        }

        // 3. Render fallback when no template could be loaded
        if (!tCode) {
          el.innerHTML = posts.map((p) => (
            `<article class="blog-fallback-card">`
            + `<h3>${String(p.title || '')}</h3>`
            + `${p.excerpt ? `<p>${String(p.excerpt)}</p>` : ''}`
            + `</article>`
          )).join('\n');
          return;
        }

        // 4. Render each post and set innerHTML
        const rendered = posts.map(p =>
          renderTemplate(tCode, {
            ...p,
            channelSlug: channel.slug,
            channelUrl: `/${channel.slug}`,
            postUrl: `/${channel.slug}/${p.slug}`,
          })
        ).join('\n');

        el.innerHTML = rendered;
      } catch (e) {
        // Silently ignore — block stays empty
      }
    });
  }, [html]);

  const params = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
  const showDebug = params && params.get('debug') === '1'

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>
  if (accessDenied) return (
    <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Kein Zugriff</h1>
      <p style={{ color: '#6b7280' }}>Du hast keine Berechtigung, diese Seite zu sehen.</p>
    </div>
  )
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
