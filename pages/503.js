import { useEffect, useState } from 'react'

const default503Html = '<div style="padding: 40px; text-align: center;"><h1>Service voruebergehend nicht verfuegbar</h1><p>Bitte versuche es spaeter erneut.</p></div>'

export default function ServiceUnavailablePage() {
  const [html, setHtml] = useState(default503Html)

  useEffect(() => {
    let isMounted = true

    ;(async () => {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) return
        const settings = await res.json()
        const nextHtml = settings?.maintenance_503_html || default503Html
        if (isMounted) setHtml(nextHtml)
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
