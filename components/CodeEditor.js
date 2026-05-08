import React, { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, completionKeymap, closeBrackets } from '@codemirror/autocomplete'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { registerEditorApi } from '../lib/insertHelper'

const languageExtension = (lang) => {
  if (lang === 'css') return css()
  if (lang === 'javascript') return javascript()
  return html() // default: html
}

export default function CodeEditor({ value = '', onChange = () => {}, language = 'html', height = '400px', options = {}, registerInserter = null }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const isDarkRef = useRef(isDarkMode)
  const themeCompartment = useRef(new Compartment())
  const apiRef = useRef(null)

  // Keep onChange ref fresh
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Detect dark mode by observing the nearest .admin-scope element's class list
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const getScope = () => document.querySelector('.admin-scope')
    const syncDarkMode = () => {
      const scope = getScope()
      const dark = scope ? scope.classList.contains('dark-mode') : false
      setIsDarkMode(dark)
      isDarkRef.current = dark
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: themeCompartment.current.reconfigure(dark ? oneDark : []),
        })
      }
    }

    syncDarkMode()

    const observer = new MutationObserver(syncDarkMode)
    const scope = getScope()
    if (scope) observer.observe(scope, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  // Build the editor once the container is mounted
  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const focusExt = EditorView.domEventHandlers({
      focus() {
        try { if (apiRef.current) window.__temgine_active_editor = apiRef.current } catch (e) {}
      },
      blur() {
        try {
          if (window.__temgine_active_editor === apiRef.current) window.__temgine_active_editor = null
        } catch (e) {}
      },
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        closeBrackets(),
        autocompletion(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        EditorView.lineWrapping,
        languageExtension(language),
        themeCompartment.current.of(isDarkRef.current ? oneDark : []),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', fontFamily: 'monospace' },
          '.cm-scroller': { overflow: 'auto' },
        }),
        updateListener,
        focusExt,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    const api = {
      insert(text) {
        try {
          const { state: s, dispatch } = view
          const range = s.selection.main
          dispatch(s.update({
            changes: { from: range.from, to: range.to, insert: text },
            selection: { anchor: range.from + text.length },
          }))
          view.focus()
          return true
        } catch (e) { return false }
      },
      async insertAsync(text) { return api.insert(text) },
      focus() { try { view.focus() } catch (e) {} },
    }

    try { if (typeof registerInserter === 'function') registerInserter(api) } catch (e) {}
    try { registerEditorApi(api) } catch (e) {}
    apiRef.current = api

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run on mount — value & language changes handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  // Sync value from outside (only when it differs from current doc)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="codeeditor-wrapper"
      style={{ height, overflow: 'hidden' }}
    />
  )
}

