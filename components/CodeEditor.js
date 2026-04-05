import React, { useEffect, useRef, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { registerEditorApi } from '../lib/insertHelper'

// ─── Mustache completion provider ────────────────────────────────────────────
const MUSTACHE_SYSTEM_TOKENS = [
  { label: '{{{blocks}}}',        detail: 'Child-Blöcke (HTML unescaped)',  insert: '{{{blocks}}}' },
  { label: '{{title}}',           detail: 'Seiten-Titel',                   insert: '{{title}}' },
  { label: '{{text}}',            detail: 'Text-Inhalt',                    insert: '{{text}}' },
  { label: '{{navigation:main}}', detail: 'Navigation: main',               insert: '{{navigation:main}}' },
  { label: '{{#name}}…{{/name}}', detail: 'Bedingter Block',                insert: '{{#${1:name}}}$0{{/${1:name}}}', snippet: true },
]
const SYSTEM_VAR_NAMES = new Set(['blocks', 'title', 'text'])

function registerMustacheProvider(monaco) {
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['{'],
    provideCompletionItems(model, position) {
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const m = before.match(/\{+$/)
      if (!m) return { suggestions: [] }
      const range = {
        startLineNumber: position.lineNumber, startColumn: position.column - m[0].length,
        endLineNumber:   position.lineNumber, endColumn:   position.column,
      }
      const userVars = new Set()
      for (const [, name] of model.getValue().matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g))
        userVars.add(name)
      const suggestions = MUSTACHE_SYSTEM_TOKENS.map(t => ({
        label: t.label, kind: monaco.languages.CompletionItemKind.Snippet,
        detail: t.detail, insertText: t.insert,
        insertTextRules: t.snippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range, sortText: '0' + t.label,
      }))
      for (const name of userVars) {
        if (!SYSTEM_VAR_NAMES.has(name))
          suggestions.push({
            label: `{{${name}}}`, kind: monaco.languages.CompletionItemKind.Variable,
            detail: 'Template-Variable (gefunden)', insertText: `{{${name}}}`,
            range, sortText: '1' + name,
          })
      }
      return { suggestions }
    },
  })
}

async function registerEmmet(monaco) {
  try {
    const { emmetHTML, emmetCSS } = await import('emmet-monaco-es')
    emmetHTML(monaco)
    emmetCSS(monaco)
  } catch (e) {}
}

function registerProviders(monaco) {
  if (monaco.__temphelixProviders) return
  monaco.__temphelixProviders = true
  registerMustacheProvider(monaco)
  registerEmmet(monaco) // async, fire-and-forget
}
// ─────────────────────────────────────────────────────────────────────────────

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
    registerProviders(monaco)

    // Explicit layout: observe the wrapper and call layout() with fixed px values.
    // automaticLayout:false + this pattern is the standard way to avoid Monaco's grow-loop.
    try {
      const wrapper = editor.getDomNode()?.closest('.codeeditor-wrapper')
      if (wrapper && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          try {
            const { width, height } = wrapper.getBoundingClientRect()
            if (width > 0 && height > 0) editor.layout({ width, height })
          } catch (e) {}
        })
        ro.observe(wrapper)
        editor.onDidDispose(() => ro.disconnect())
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
      try { window.__temphelix_active_editor = api } catch (e) {}
    })
    editor.onDidBlurEditorWidget(() => {
      try {
        if (window.__temphelix_active_editor === api) window.__temphelix_active_editor = null
      } catch (e) {}
    })
  }

  const monacoOptions = {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
    minimap: { enabled: false },
    wordWrap: 'on',
    tabSize: 2,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: 10 },
    automaticLayout: false,
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

