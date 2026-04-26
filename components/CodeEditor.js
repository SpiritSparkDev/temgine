import React, { useEffect, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { registerEditorApi } from '../lib/insertHelper'

export default function CodeEditor({ value = '', onChange = () => {}, language = 'html', height = '400px', options = {}, registerInserter = null }) {
  const editorRef = useRef(null)
  const apiRef = useRef(null)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Detect dark mode by observing the nearest .admin-scope element's class list
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const getScope = () => document.querySelector('.admin-scope')
    const syncDarkMode = () => {
      const scope = getScope()
      setIsDarkMode(scope ? scope.classList.contains('dark-mode') : false)
    }

    syncDarkMode()

    const observer = new MutationObserver(syncDarkMode)
    const scope = getScope()
    if (scope) observer.observe(scope, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  function handleMount(editor, monaco) {
    editorRef.current = editor

    // Keep Monaco's hidden keyboard textarea non-visible and non-resizable,
    // without touching the rendered cursor layer.
    try {
      const input = editor.getDomNode()?.querySelector('textarea.inputarea')
      if (input) {
        input.style.resize = 'none'
        input.style.boxShadow = 'none'
      }
    } catch (e) {}
    const api = {
      insert(text) {
        try {
          const model = editor.getModel()
          const selection = editor.getSelection()
          if (!model || !selection) return false
          editor.executeEdits('insert', [{ range: selection, text, forceMoveMarkers: true }])
          editor.focus()
          return true
        } catch (e) { return false }
      },
      async insertAsync(text) { return api.insert(text) },
      focus() { try { editor.focus() } catch (e) {} }
    }

    try { if (typeof registerInserter === 'function') registerInserter(api) } catch (e) {}
    try { registerEditorApi(api) } catch (e) {}
    apiRef.current = api

    editor.onDidFocusEditorWidget(() => {
      try { window.__temgine_active_editor = api } catch (e) {}
    })
    editor.onDidBlurEditorWidget(() => {
      try {
        if (window.__temgine_active_editor === api) window.__temgine_active_editor = null
      } catch (e) {}
    })
  }

  const monacoOptions = {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
    minimap: { enabled: false },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    tabCompletion: 'on',
    wordWrap: 'on',
    tabSize: 2,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: 10 },
    automaticLayout: true,
    ...options,
  }

  return (
    <div className="codeeditor-wrapper" style={{ height }}>
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        theme={isDarkMode ? 'vs-dark' : 'vs'}
        options={monacoOptions}
        onMount={handleMount}
        onChange={v => onChange(v ?? '')}
        loading={<div style={{ padding: 16, color: 'var(--text-secondary, #666)', fontFamily: 'monospace' }}>Editor wird geladen…</div>}
      />
    </div>
  )
}

