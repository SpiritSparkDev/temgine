import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import boundSnippets from '../data/boundSnippets.json'
import { renderPage } from '../lib/templateEngine'

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
        if (foundPage.blocks) {
          foundPage.blocks.forEach(block => {
            const tname = block.template || block.type
            if (tname) templatesToLoad.add(tname)
          })
        }
        if (foundPage.template) templatesToLoad.add(foundPage.template)

        // Debug: show which templates we will try to load for this page
        // eslint-disable-next-line no-console
        console.debug('catchall: templatesToLoad ->', Array.from(templatesToLoad))

        const templateCodes = {}
        await Promise.all(
          Array.from(templatesToLoad).map(async templateName => {
            try {
              const res = await fetch(`/api/templates?name=${encodeURIComponent(templateName)}&_t=${Date.now()}`)
              if (res.ok) {
                const data = await res.json()
                // Map both the requested name and the canonical DB name to the template code
                templateCodes[templateName] = data.code
                if (data.name && data.name !== templateName) templateCodes[data.name] = data.code
              }
            } catch (e) {
              console.error(`Fehler beim Laden von Template "${templateName}":`, e)
            }
          })
        )

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

        // Load snippets and build a simple map label -> snippet string
        const snippetsMap = {}
        try {
          const sres = await fetch(`/api/snippets?_t=${Date.now()}`)
          if (sres.ok) {
            const sdata = await sres.json()
            if (Array.isArray(sdata)) {
              sdata.forEach(si => {
                // snippets handler returns { label, snippet, type }
                if (si && si.label) snippetsMap[String(si.label)] = si.snippet || ''
              })
            }
          }
        } catch (e) {
          console.error('Fehler beim Laden der Snippets:', e)
        }

        // Populate bound snippets (derived from current page metadata)
        try {
          const resolvePath = (obj, path) => {
            if (!path) return undefined
            // special helper: 'isChild' computed from segments length
            if (path === 'isChild') return segments && segments.length > 1
            const parts = String(path).split('.')
            let cur = obj
            for (const p of parts) {
              if (cur === undefined || cur === null) return undefined
              if (/^\d+$/.test(p)) {
                const idx = parseInt(p, 10)
                cur = Array.isArray(cur) ? cur[idx] : undefined
              } else {
                cur = cur[p]
              }
            }
            return cur
          }
          ;(boundSnippets || []).forEach(b => {
            try {
              const val = resolvePath(foundPage, b.path)
              snippetsMap[String(b.label)] = val === undefined || val === null ? '' : String(val)
            } catch (e) {
              snippetsMap[String(b.label)] = ''
            }
          })
        } catch (e) {
          console.error('Fehler beim Generieren gebundener Snippets:', e)
        }

        const pageTemplateCode = foundPage.template ? templateCodes[foundPage.template] : null
        const html = renderPage(foundPage, templateCodes, pageTemplateCode, pages, navigationTemplates, templateCodes, snippetsMap)
        // Debug: log length and preview on the client so we can verify insertion
        try {
          // eslint-disable-next-line no-console
          console.debug('catchall: rendered html length ->', html ? String(html.length) : '0')
          // eslint-disable-next-line no-console
          console.debug('catchall: rendered html preview ->', html ? String(html).slice(0, 500) : '')
        } catch (e) {}
        setHtml(html)
        setLoading(false)
      })
      .catch(err => {
        console.error('Fehler beim Laden:', err)
        setLoading(false)
      })
  }, [query.slug])

  const params = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
  const showDebug = params && params.get('debug') === '1'

  if (loading) return <div style={{ padding: 20 }}>Lädt...</div>
  if (!page) return <div style={{ padding: 20 }}>Seite nicht gefunden</div>

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {showDebug && (
        <div style={{ padding: 12, marginTop: 12, background: '#fff', border: '1px solid #ddd' }}>
          <strong>Debug: rendered HTML (first 2000 chars)</strong>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{String(html || '').slice(0, 2000)}</pre>
        </div>
      )}
    </div>
  )
}
