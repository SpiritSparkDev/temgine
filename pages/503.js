import { useEffect, useState } from 'react'

const default503Html = '<div style="padding: 40px; text-align: center;"><h1>Service voruebergehend nicht verfuegbar</h1><p>Bitte versuche es spaeter erneut.</p></div>'

export default function ServiceUnavailablePage() {
  const [html, setHtml] = useState(default503Html)

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

  useEffect(() => {
    let isMounted = true

    ;(async () => {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) return
        const settings = await res.json()
        const nextHtml = settings?.maintenance_503_html || default503Html
        const cssLinks = await loadActiveCssLinks()
        if (isMounted) setHtml(injectCssLinks(nextHtml, cssLinks))
      } catch (_) {
        // Keep fallback HTML on load errors.
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
