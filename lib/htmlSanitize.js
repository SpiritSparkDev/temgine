import sanitizeHtml from 'sanitize-html'

const defaultAllowedTags = [
  'p','br','strong','b','em','i','u','a','ul','ol','li','h1','h2','h3','h4','h5','blockquote','pre','code','img','table','thead','tbody','tr','th','td'
]

const defaultAllowedAttributes = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt']
}

export function sanitizeHtmlString(html) {
  if (!html || typeof html !== 'string') return ''
  try {
    return sanitizeHtml(String(html), {
      allowedTags: defaultAllowedTags,
      allowedAttributes: defaultAllowedAttributes,
      allowedSchemes: ['http','https','mailto','data'],
      allowProtocolRelative: false,
      transformTags: {
        'a': (tagName, attribs) => {
          // ensure links open safely
          const out = { ...attribs }
          if (!out.rel) out.rel = 'noopener noreferrer'
          return { tagName: 'a', attribs: out }
        }
      }
    })
  } catch (e) {
    console.error('sanitizeHtmlString failed', e)
    return ''
  }
}

// Recursively sanitize an object/array: strings are sanitized, others preserved
export function sanitizeRecursive(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return sanitizeHtmlString(obj)
  if (Array.isArray(obj)) return obj.map(v => sanitizeRecursive(v))
  if (typeof obj === 'object') {
    const out = {}
    for (const k of Object.keys(obj)) {
      out[k] = sanitizeRecursive(obj[k])
    }
    return out
  }
  // numbers, booleans
  return obj
}

export default sanitizeHtmlString
