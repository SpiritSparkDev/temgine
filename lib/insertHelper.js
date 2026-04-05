let editorApi = null

function registerEditorApi(api) {
  editorApi = api
  try { window.__temgine_editor_api = api } catch (e) {}
}

function getEditorApi() {
  return editorApi || (typeof window !== 'undefined' && (window.__temgine_active_editor || window.__temgine_editor_api)) || null
}

async function insertText(text, fallback) {
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
        const g = typeof window !== 'undefined' && (window.__temgine_editor_api || window.__temgine_active_editor)
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

// Call the exported insertText if present so tests can spyOn it; otherwise call local insertText
function callInsertText(text, fallback) {
  try {
    if (typeof module !== 'undefined' && module.exports && typeof module.exports.insertText === 'function') {
      return module.exports.insertText(text, fallback)
    }
  } catch (e) {}
  try { return insertText(text, fallback) } catch (e) { return false }
}

function createButtonHandlers(text, fallback) {
  return {
    onMouseDown: (e) => { e.preventDefault(); callInsertText(text, fallback) },
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callInsertText(text, fallback) } }
  }
}

// Provide CommonJS-compatible exports for Jest tests and non-ESM environments
try {
  module.exports = module.exports || {}
  module.exports.registerEditorApi = registerEditorApi
  module.exports.getEditorApi = getEditorApi
  module.exports.insertText = insertText
  module.exports.createButtonHandlers = createButtonHandlers
} catch (e) {
  // ignore (likely running in ESM-only environment)
}

// Also export for ESM consumers
try {
  // eslint-disable-next-line no-undef
  if (typeof exports !== 'undefined') {
    exports.registerEditorApi = registerEditorApi
    exports.getEditorApi = getEditorApi
    exports.insertText = insertText
    exports.createButtonHandlers = createButtonHandlers
  }
} catch (e) {}
