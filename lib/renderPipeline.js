/**
 * lib/renderPipeline.js
 *
 * Gemeinsame Render-Pipeline der öffentlichen Seiten (pages/index.js, pages/[...slug].js):
 *   1. loadStaticSnapshot — Snapshot-Entscheidung (statischer Modus, requiresDynamic der Sections)
 *   2. loadPageData       — Templates, Navigationen, Footer, globale Variablen, Widgets,
 *                           Section-Daten (lib/sections/) für eine Seite laden
 *   3. renderPageHtml     — renderPage() mit den geladenen Daten
 *   4. hydratePage        — Hydration nach dem Einsetzen des HTML
 *   useRerender           — Rerender ohne Seiten-Reload (Picgine-Entsperren/Logout)
 * Seitenspezifisches (Startseite vs. Unterseite, 404, Weiterleitung, Zugriff, SEO) bleibt in
 * den Pages. Plugins hängen sich nur hier ein (hydrate seit Plugin-System P1, Sections ab P2).
 */
import { useCallback, useRef, useState } from 'react'
import { renderPage, renderTemplate, buildNavHtml, collectNavigationBlockIds, collectSectionKeys } from './templateEngine'
import { findRawPageNodeById, findRawPageNodeByPath } from './navTreeHelpers'
import { hydrateContactForms } from './contactFormRuntime'
import { hydratePicgine } from './picgineRuntime'
import { loadSectionDataClient, sectionsRequireDynamic } from './sections'
import { hydrateConsentGatedEmbeds } from './cookieConsentRuntime'
import { hydratePlugins } from './plugins/client'

const debugRender = process.env.NEXT_PUBLIC_DEBUG_RENDER === 'true'
const debugLog = (...args) => {
  if (debugRender) console.log('[render-pipeline]', ...args)
}

const currentQuery = () => Object.fromEntries(new URLSearchParams(window.location.search))

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

/**
 * Liefert den Live-Snapshot der Route, wenn er benutzt werden darf:
 *   { html }              — Snapshot der Seite
 *   { html, notFound }    — statische 404-Seite (nur Unterseiten)
 *   null                  — dynamisch rendern
 * Dynamisch gerendert wird bei ?preview=1, im dynamischen Modus und wenn ein Section-Provider
 * per requiresDynamic({ html, query }) darauf besteht — vor dem Laden anhand der URL (z. B.
 * ?picgine=, Unterordner gibt es nicht im Snapshot), danach anhand des Snapshot-HTML (z. B.
 * gesperrte Picgine-Galerie: nur dynamisch greift der Viewer-Token des Besuchers).
 */
export async function loadStaticSnapshot(segments) {
  const previewMode = new URLSearchParams(window.location.search).get('preview') === '1'
  const liveRenderMode = await loadLiveRenderMode()
  const query = currentQuery()
  const shouldTryStatic = !previewMode && liveRenderMode === 'static' && !sectionsRequireDynamic({ html: '', query })
  debugLog('render mode decision', { previewMode, liveRenderMode, shouldTryStatic, segments })
  if (!shouldTryStatic) return null

  try {
    const routePath = segments.length ? `/${segments.join('/')}` : '/'
    const staticRoute = routePath === '/' ? '/__live/index.html' : `/__live${routePath}/index.html`
    const staticRes = await fetch(`${staticRoute}?_t=${Date.now()}`, { cache: 'no-store' })
    debugLog('static snapshot response', { ok: staticRes.ok, status: staticRes.status, url: staticRoute })
    if (!staticRes.ok) return null

    const staticHtml = await staticRes.text()
    const looksLikeLoadingShell = staticHtml.includes('Lädt') || staticHtml.includes('Lade Admin-Daten') || (staticHtml.includes('<!DOCTYPE html>') && staticHtml.length < 5000)
    const dynamic = sectionsRequireDynamic({ html: staticHtml, query })
    debugLog('static snapshot loaded', { routePath, htmlLength: staticHtml.length, looksLikeLoadingShell, dynamic })

    if (!looksLikeLoadingShell) {
      const metaRes = await fetch(`/__live/__meta.json?_t=${Date.now()}`, { cache: 'no-store' })
      const metaText = await metaRes.text().catch(() => '')
      const metaContentType = metaRes.headers.get('content-type') || ''
      const metaLooksValid = metaRes.ok && metaContentType.includes('application/json') && !metaText.includes('<!DOCTYPE html>')
      debugLog('static meta response', { ok: metaRes.ok, status: metaRes.status, contentType: metaContentType, metaLooksValid })
      if (metaLooksValid && !dynamic) return { html: staticHtml }
    }

    // Section verlangt dynamisches Rendern: Snapshot existiert, also kein 404
    if (routePath !== '/' && !dynamic) {
      const notFoundRes = await fetch(`/__live/404.html?_t=${Date.now()}`, { cache: 'no-store' })
      debugLog('static 404 response', { ok: notFoundRes.ok, status: notFoundRes.status })
      if (notFoundRes.ok) {
        const notFoundHtml = await notFoundRes.text()
        const looksInvalid404 = notFoundHtml.includes('Lädt') || (notFoundHtml.includes('<!DOCTYPE html>') && notFoundHtml.length < 5000)
        if (!looksInvalid404) return { html: notFoundHtml, notFound: true }
      }
    }
  } catch (e) {
    debugLog('static snapshot failed, falling back to dynamic render', { error: e?.message || String(e) })
  }
  return null
}

async function loadTemplateCodes(blocks) {
  const templatesToLoad = new Set()
  const collect = (list) => {
    if (!Array.isArray(list)) return
    for (const block of list) {
      const tname = block.template || block.type
      if (tname) templatesToLoad.add(tname)
      if (block.children && block.children.length > 0) collect(block.children)
    }
  }
  collect(blocks)

  const templateCodes = {}
  await Promise.all(Array.from(templatesToLoad).map(async (templateName) => {
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
  }))
  return templateCodes
}

// currentPath: Pfad der Unterseite ("a/b"); null für die Startseite. Davon hängen ab:
// isCurrent (Pfad bzw. id), childPages (Suche per Pfad bzw. id) und die Auto-Navigation
// (nur Unterseiten).
async function loadNavigations(page, pages, currentPath) {
  const navigations = {}
  try {
    const navRes = await fetch(`/api/navigations?active=true&_t=${Date.now()}`)
    if (!navRes.ok) return navigations
    const activeNavs = await navRes.json()
    if (!Array.isArray(activeNavs)) return navigations

    const isHome = currentPath === null
    // isCurrent/data let a page-level nav template exclude the page it's
    // rendered on (e.g. "other artists") and read custom per-page fields
    // (e.g. data.navImage) without any block-specific plumbing.
    const buildNestedPages = (nodes, parentPath = '') =>
      (nodes || [])
        .filter(n => (n.status === 'PUBLISHED' || n.isHomepage) && !Boolean(n?.data?.ignoreInNavigation))
        .map(n => {
          const slug = parentPath ? `${parentPath}/${n.slug}` : n.slug
          const children = buildNestedPages(n.children || [], slug)
          return { id: n.id, slug, title: n.title, hasChildren: children.length > 0, children, isCurrent: isHome ? n.id === page?.id : slug === currentPath, data: n.data || {} }
        })
    const nestedPages = buildNestedPages(pages)
    const anchors = Array.isArray(page?.data?.anchors) ? page.data.anchors : []
    const customAnchors = Array.isArray(page?.data?.customAnchors) ? page.data.customAnchors : []
    // Unterseiten der aktuell gerenderten Seite — für PAGE-Navs, die z. B. nur
    // "{{{nav:unterseiten}}}" der aktuellen Seite zeigen sollen (siehe help/navigationen.md).
    // Suche über den rohen (ungefilterten) Baum, nicht über nestedPages: die aktuelle Seite
    // kann selbst ein Entwurf sein (dann fehlt sie in nestedPages). Unterseiten werden per
    // Pfad gesucht (zuverlässiger als die client-seitig vergebene id), die Startseite per id
    // (sie kann verschachtelt liegen).
    const rawMatch = isHome ? findRawPageNodeById(pages, page?.id) : findRawPageNodeByPath(pages, currentPath)
    const childPages = rawMatch ? buildNestedPages(rawMatch.node.children || [], rawMatch.parentPath) : []
    const navData = { pages: nestedPages, anchors, customAnchors, childPages }

    for (const nav of activeNavs) {
      navigations[String(nav.type).toLowerCase()] = { code: nav.code, data: navData }
    }
    if (!isHome) navigations['auto'] = { code: buildNavHtml(pages, currentPath), data: {} }

    // If this page has a specific navigation assigned, use it as the optional page nav
    if (page.data?.pageNav) {
      try {
        const pageNavRes = await fetch(`/api/navigations?id=${encodeURIComponent(page.data.pageNav)}&_t=${Date.now()}`)
        if (pageNavRes.ok) {
          const pageNavData = await pageNavRes.json()
          if (pageNavData && pageNavData.code) navigations['page'] = { code: pageNavData.code, data: navData }
        }
      } catch (e) {
        console.warn('Seiten-spezifische Navigation konnte nicht geladen werden:', e.message)
      }
    }

    // Jede (aktive) Navigation ist zusätzlich per {{{nav:<Name>}}} ansprechbar —
    // navigations.byId (mit name, für die Platzhalter-Auflösung in templateEngine.js)
    // deckt damit standardmäßig schon alle PAGE-Navs ab.
    navigations.byId = {}
    for (const nav of activeNavs) {
      if (nav?.id && nav?.code) navigations.byId[nav.id] = { name: nav.name, code: nav.code, data: navData }
    }

    // Navigations, die als eigener Block (type: 'navigation') platziert wurden aber
    // (z. B. eine MAIN-Nav) nicht in activeNavs enthalten sind, werden per ID nachgeladen.
    const navBlockIds = collectNavigationBlockIds(page?.blocks).filter((id) => !navigations.byId[id])
    await Promise.all(navBlockIds.map(async (id) => {
      try {
        const res = await fetch(`/api/navigations?id=${encodeURIComponent(id)}&_t=${Date.now()}`)
        if (res.ok) {
          const nav = await res.json()
          if (nav && nav.code) navigations.byId[id] = { name: nav.name, code: nav.code, data: navData }
        }
      } catch (e) {
        console.warn('Navigations-Block konnte nicht geladen werden:', e.message)
      }
    }))
  } catch (e) {
    console.warn('Navigations konnten nicht geladen werden:', e.message)
  }
  return navigations
}

async function loadFooter(page) {
  let footer = null
  try {
    const footerRes = await fetch(`/api/footers?active=true&_t=${Date.now()}`)
    if (footerRes.ok) {
      const activeFooter = await footerRes.json()
      if (activeFooter && activeFooter.code) footer = { code: activeFooter.code, data: {} }
    }
  } catch (e) {
    console.warn('Footer konnte nicht geladen werden:', e.message)
  }
  if (page.data?.pageFooter) {
    try {
      const pageFooterRes = await fetch(`/api/footers?id=${encodeURIComponent(page.data.pageFooter)}&_t=${Date.now()}`)
      if (pageFooterRes.ok) {
        const pageFooterData = await pageFooterRes.json()
        if (pageFooterData && pageFooterData.code) footer = { code: pageFooterData.code, data: {} }
      }
    } catch (e) {
      console.warn('Seiten-spezifischer Footer konnte nicht geladen werden:', e.message)
    }
  }
  return footer
}

async function loadGlobalVars() {
  try {
    const globalRes = await fetch(`/api/global-variables?active=true&_t=${Date.now()}`)
    if (globalRes.ok) return await globalRes.json()
  } catch (e) {
    console.warn('Globale Variablen konnten nicht geladen werden:', e.message)
  }
  return {}
}

async function loadGlobalPages() {
  const globalPages = { byId: {} }
  try {
    const widgetsRes = await fetch(`/api/global-pages?active=true&role=WIDGET&_t=${Date.now()}`)
    if (widgetsRes.ok) {
      const widgets = await widgetsRes.json()
      for (const w of (Array.isArray(widgets) ? widgets : [])) {
        if (w?.id) globalPages.byId[w.id] = { code: w.code }
      }
    }
  } catch (e) {
    console.warn('Widgets konnten nicht geladen werden:', e.message)
  }
  return globalPages
}

/**
 * Lädt alles, was renderPage() für `page` braucht. `pages` ist der Seitenbaum aus /api/pages,
 * `currentPath` der Pfad der Unterseite bzw. null für die Startseite.
 */
export async function loadPageData(page, pages, { currentPath = null } = {}) {
  const templateCodes = await loadTemplateCodes(page.blocks)
  const navigations = await loadNavigations(page, pages, currentPath)
  const footer = await loadFooter(page)
  const globalVars = await loadGlobalVars()
  const globalPages = await loadGlobalPages()
  const sectionData = await loadSectionDataClient(collectSectionKeys(page.blocks, templateCodes), { basePath: window.location.pathname, query: currentQuery() })
  return { templateCodes, navigations, footer, globalVars, globalPages, sectionData }
}

export function renderPageHtml(page, { templateCodes, ...data }, { isChild = false } = {}) {
  return renderPage(page, templateCodes, { isChild, basePath: window.location.pathname, query: currentQuery(), ...data })
}

// Führt inline <script>-Tags im gerenderten HTML aus — dangerouslySetInnerHTML wertet
// Scripts nicht aus. Nur Scripts ohne src-Attribut (keine externen URLs).
export function runInlineScripts(container) {
  if (!container) return
  container.querySelectorAll('script:not([src])').forEach(old => {
    const s = document.createElement('script')
    s.textContent = old.textContent
    document.body.appendChild(s)
    document.body.removeChild(s)
  })
}

// Füllt <div class="blog-channel-block" data-channel="…" data-slot="…" data-template="…"
// data-limit="…"> mit gerenderten Beiträgen aus der öffentlichen Blog-API.
export function hydrateBlogChannels(container) {
  if (!container) return
  container.querySelectorAll('.blog-channel-block[data-channel]').forEach(async (el) => {
    const channelSlug = el.getAttribute('data-channel')
    const templateSlot = el.getAttribute('data-slot') || 'templateDetailPreview'
    const directTemplateName = String(el.getAttribute('data-template') || '').trim()
    const limit = parseInt(el.getAttribute('data-limit'), 10) || 6
    if (!channelSlug) return

    try {
      // 1. Fetch published posts
      const postsRes = await fetch(`/api/blog/public/${encodeURIComponent(channelSlug)}?limit=${limit}`)
      if (!postsRes.ok) return
      const { channel, posts } = await postsRes.json()

      if (!posts || !posts.length) {
        el.innerHTML = ''
        return
      }

      // 2. Resolve template candidates: explicit override first, then channel slot
      const slotTemplateName = channel && channel[templateSlot] ? String(channel[templateSlot]).trim() : ''
      const candidates = []
      if (directTemplateName) candidates.push(directTemplateName)
      if (slotTemplateName && slotTemplateName !== directTemplateName) candidates.push(slotTemplateName)

      let tCode = ''
      for (const name of candidates) {
        try {
          const tRes = await fetch(`/api/templates?name=${encodeURIComponent(name)}`)
          if (!tRes.ok) continue
          const tData = await tRes.json()
          if (tData && tData.code) {
            tCode = String(tData.code)
            break
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
        )).join('\n')
        return
      }

      // 4. Render each post and set innerHTML
      el.innerHTML = posts.map(p =>
        renderTemplate(tCode, {
          ...p,
          channelSlug: channel.slug,
          channelUrl: `/${channel.slug}`,
          postUrl: `/${channel.slug}/${p.slug}`,
        })
      ).join('\n')
    } catch (e) {
      // Silently ignore — block stays empty
    }
  })
}

// Hydration nach jedem Rendern: Kontaktformulare (lib/contactFormRuntime.js), Picgine
// (Entsperren/Logout → rerender), Consent-gesperrte Embeds, dann hydrate() aktiver Plugins
// und das Event temgine:rendered (picgine:rendered bleibt als Alias in hydratePicgine).
export function hydratePage(container, rerender) {
  hydrateContactForms(container)
  hydratePicgine(container, rerender)
  hydrateConsentGatedEmbeds(container)
  hydratePlugins(container, rerender)
}

/**
 * Neu laden/rendern einer Page-Komponente: `token` gehört in die Effect-Dependencies.
 * reload()   — mit Ladebildschirm (z. B. nach Passwort-Entsperren)
 * rerender() — still, ohne Ladebildschirm (Picgine-Entsperren/Logout, siehe lib/picgineRuntime.js)
 * consumeSilent() — im Effect: true, wenn der aktuelle Lauf von rerender() ausgelöst wurde.
 */
export function useRerender() {
  const silent = useRef(false)
  const [token, setToken] = useState(0)
  const reload = useCallback(() => setToken(k => k + 1), [])
  const rerender = useCallback(() => {
    silent.current = true
    setToken(k => k + 1)
  }, [])
  const consumeSilent = () => {
    const wasSilent = silent.current
    silent.current = false
    return wasSilent
  }
  return { token, reload, rerender, consumeSilent }
}
