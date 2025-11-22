import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { renderPage } from '../lib/templateEngine'

export default function Page() {
  const { query } = useRouter()
  const [page, setPage] = useState(null)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query.slug) return

    setLoading(true)
    
    // Lade Seiten-Daten (mit Cache-Buster)
    // In development (localhost) include drafts so we can preview saved drafts
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const pagesUrl = `/api/pages?${isLocal ? 'includeDrafts=true&' : ''}_t=${Date.now()}`;
    fetch(pagesUrl)
      .then(r => r.json())
      .then(async pages => {
        console.log('Geladene Seiten:', pages)
        console.log('Ist Array?', Array.isArray(pages))
        console.log('Seiten Anzahl:', pages?.length)
        console.log('Suche nach Slug:', query.slug)
        
        // Prüfe ob pages ein Array ist
        if (!Array.isArray(pages)) {
          console.error('Pages ist kein Array!')
          setPage(null)
          setLoading(false)
          return
        }
        
        // Rekursive Suche durch Seiten-Hierarchie
        const findPageBySlug = (nodes, targetSlug) => {
          for (const node of nodes) {
            console.log('Prüfe Seite:', node.slug, 'gegen', targetSlug)
            if (node.slug === targetSlug) return node
            if (node.children && node.children.length > 0) {
              const found = findPageBySlug(node.children, targetSlug)
              if (found) return found
            }
          }
          return null
        }
        
        let foundPage = findPageBySlug(pages, query.slug)
        console.log('Gefundene Seite:', foundPage)
        if (!foundPage) {
          // Suche nach 404-Seite
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

        // Prüfe auf externe Weiterleitung
        if (foundPage.redirectType === 'external' && foundPage.redirectUrl) {
          window.location.href = foundPage.redirectUrl
          setHtml('<div style="padding: 40px; text-align: center;"><p>Weiterleitung...</p></div>')
          setLoading(false)
          return
        }

        // 404 und 503 werden als normale Seiten mit Blöcken gerendert
        // Die redirectType Information wird nur für die Anzeige verwendet

        // Sammle alle Block-Templates
        const templatesToLoad = new Set()
        if (foundPage.blocks) {
          foundPage.blocks.forEach(block => {
            if (block.template) {
              templatesToLoad.add(block.template)
            }
          })
        }
        
        // Füge Seiten-Template hinzu wenn vorhanden
        if (foundPage.template) {
          templatesToLoad.add(foundPage.template)
        }

        // Lade alle Templates parallel
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

        // Lade Navigations-Templates
        const navigationTemplates = {}
        try {
          const navRes = await fetch(`/api/navigations?_t=${Date.now()}`)
          if (navRes.ok) {
            const navData = await navRes.json()
            const navList = navData.navigations || []
            for (const navName of navList) {
              const navDetailRes = await fetch(`/api/navigations?name=${encodeURIComponent(navName)}&_t=${Date.now()}`)
              if (navDetailRes.ok) {
                const navDetail = await navDetailRes.json()
                navigationTemplates[navName] = navDetail.code
              }
            }
          }
        } catch (e) {
          console.error('Fehler beim Laden der Navigationen:', e)
        }

        // Rendere Seite mit optionalem Seiten-Template
        const pageTemplateCode = foundPage.template ? templateCodes[foundPage.template] : null
        const html = renderPage(foundPage, templateCodes, pageTemplateCode, pages, navigationTemplates, templateCodes)
        setHtml(html)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })
  }, [query.slug])

  console.log('Render State - Loading:', loading, 'Page:', page, 'HTML length:', html?.length)

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>
  if (!page) return <div style={{ padding: 20 }}>Seite nicht gefunden</div>

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
