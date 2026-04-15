import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { renderPage } from '../lib/templateEngine'

export default function Home() {
  const router = useRouter()
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    
    // Lade Seiten-Daten und finde Startseite
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`;
    
    fetch(pagesUrl)
      .then(r => r.json())
      .then(async pages => {
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
          setHtml('<div style="padding: 40px; text-align: center;"><h1>Keine Startseite gefunden</h1></div>')
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
        if (homePage.blocks) {
          homePage.blocks.forEach(block => {
            const tname = block.template || block.type
            if (tname) templatesToLoad.add(tname)
          })
        }
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
              const flatPages = []
              const flattenPages = (nodes, parentPath = '', depth = 0) => {
                for (const n of nodes) {
                  const fullPath = parentPath ? `${parentPath}/${n.slug}` : n.slug
                  flatPages.push({ slug: fullPath, title: n.title, depth })
                  if (n.children && n.children.length > 0) flattenPages(n.children, fullPath, depth + 1)
                }
              }
              flattenPages(pages)

              const anchors = Array.isArray(homePage?.data?.anchors) ? homePage.data.anchors : []

              for (const nav of activeNavs) {
                const key = String(nav.type).toLowerCase()
                const data = key === 'page' ? { anchors } : { pages: flatPages }
                navigations[key] = { code: nav.code, data }
              }

              // If this page has a specific navigation assigned, use it as the MAIN nav
              if (homePage?.data?.pageNav) {
                try {
                  const pageNavRes = await fetch(`/api/navigations?id=${encodeURIComponent(homePage.data.pageNav)}&_t=${Date.now()}`)
                  if (pageNavRes.ok) {
                    const pageNavData = await pageNavRes.json()
                    if (pageNavData && pageNavData.code) {
                      navigations['main'] = { code: pageNavData.code, data: { pages: flatPages } }
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
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })
  }, [])

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>
  
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
