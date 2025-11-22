let editorApi = null

export function registerEditorApi(api) {
  editorApi = api
  try { window.__temphelix_editor_api = api } catch (e) {}
}

export function getEditorApi() {
  return editorApi || (typeof window !== 'undefined' && (window.__temphelix_active_editor || window.__temphelix_editor_api)) || null
}

export async function insertText(text, fallback) {
  const api = getEditorApi()
  try {
    if (api) {
      // try immediate sync insert
      if (typeof api.insert === 'function') {
        try {
          const ok = api.insert(text)
          if (ok) return true
        } catch (e) {}
      }

      // try async
      if (typeof api.insertAsync === 'function') {
        try {
          const ok = await api.insertAsync(text)
          if (ok) return true
        } catch (e) {}
      }

      // focus + delayed retry
      try { if (typeof api.focus === 'function') api.focus() } catch (e) {}
      await new Promise(r => setTimeout(r, 60))
      try {
        if (typeof api.insert === 'function') {
          try { const ok = api.insert(text); if (ok) return true } catch (e) {}
          await new Promise(r => setTimeout(r, 50))
          try { api.insert(text); return true } catch (e) {}
        }
      } catch (e) {}

      // global fallback
      try {
        const g = typeof window !== 'undefined' && (window.__temphelix_editor_api || window.__temphelix_active_editor)
        if (g && typeof g.insert === 'function') {
          try { const ok = g.insert(text); if (ok) return true } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}

  // final fallback to caller-provided fallback function
  if (typeof fallback === 'function') {
    try { fallback() } catch (e) {}
  }
  return false
}

export function createButtonHandlers(text, fallback) {
  return {
    onMouseDown: (e) => { e.preventDefault(); insertText(text, fallback) },
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertText(text, fallback) } }
  }
}
