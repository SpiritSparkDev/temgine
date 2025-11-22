import React, { useEffect, useRef } from 'react'
import { registerEditorApi } from '../lib/insertHelper'
import Editor from 'react-simple-code-editor'
import Highlight, { defaultProps } from 'prism-react-renderer'
import theme from 'prism-react-renderer/themes/github'

function PrismHighlight({ code, language }) {
  return (
    <Highlight {...defaultProps} code={code} language={language} theme={theme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={{ ...style, margin: 0, fontFamily: 'monospace' }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

export default function CodeEditor({ value = '', onChange = () => {}, language = 'html', height = '400px', options = {}, registerInserter = null }) {
  const textareaRef = useRef(null)
  const textareaIdRef = useRef('temphelix-editor-' + Math.random().toString(36).slice(2, 9))
  const apiRef = useRef(null)

  useEffect(() => {
    const api = {
      insert(text) {
        try {
          const el = textareaRef.current
          if (!el) return false
          const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length
          const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start
          const newVal = el.value.slice(0, start) + text + el.value.slice(end)
          onChange(newVal)
          setTimeout(() => {
            try { el.focus(); const pos = start + text.length; el.setSelectionRange(pos, pos) } catch (e) {}
          }, 0)
          return true
        } catch (e) { return false }
      },
      async insertAsync(text) { return api.insert(text) },
      focus() { try { textareaRef.current && textareaRef.current.focus() } catch (e) {} }
    }
    try { if (typeof registerInserter === 'function') registerInserter(api) } catch (e) {}
    try { registerEditorApi(api) } catch (e) {}
    apiRef.current = api
  }, [registerInserter, onChange])

  // Ensure we have a reference to the underlying textarea element.
  useEffect(() => {
    try {
      const el = document.getElementById(textareaIdRef.current)
      if (el) textareaRef.current = el
    } catch (e) {}
  }, [])

  const highlight = code => <PrismHighlight code={code} language={language} />

  return (
    <div className="codeeditor-wrapper" style={{ height }}>
      <Editor
        value={value}
        onValueChange={code => onChange(code)}
        highlight={highlight}
        padding={10}
        textareaId={textareaIdRef.current}
        onFocus={() => {
          try {
            const a = apiRef.current
            if (a) {
              try { window.__temphelix_active_editor = a } catch (e) {}
              try { if (typeof a.focus === 'function') a.focus() } catch (e) {}
            }
          } catch (e) {}
        }}
        onBlur={() => {
          try {
            const a = apiRef.current
            if (a && window.__temphelix_active_editor === a) {
              try { window.__temphelix_active_editor = null } catch (e) {}
            }
          } catch (e) {}
        }}
        padding={10}
        style={{
          fontFamily: 'monospace',
          fontSize: 13,
          minHeight: height,
          outline: 0
        }}
      />
    </div>
  )
}

