/**
 * RichTextEditor – Markdown textarea with toolbar helpers + live preview.
 *
 * Props:
 *   value       {string}   Markdown string (controlled)
 *   onChange    {Function} called with new Markdown string on every change
 *   readOnly    {boolean}  disable editing
 *   placeholder {string}
 *   toolbar     {string[]} subset of buttons to show (default: all)
 */
import React, { useState, useRef, useMemo } from 'react';
import { marked } from 'marked';

// Configure marked: safe defaults, no mangling
marked.setOptions({ breaks: true, gfm: true });

// Normalize incoming value: if it contains HTML (from old TipTap content),
// convert it to approximate markdown so the textarea shows clean syntax.
function htmlToMd(html) {
  if (!html || typeof html !== 'string') return html || '';
  if (!/<[a-z]/i.test(html)) return html; // already plain text / markdown
  return html
    .replace(/<strong>([\/\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\/\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\/\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i>([\/\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<del>([\/\s\S]*?)<\/del>/gi, '~~$1~~')
    .replace(/<s>([\/\s\S]*?)<\/s>/gi, '~~$1~~')
    .replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<li>([\/\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ALL_TOOLBAR = ['bold', 'italic', 'strike', 'ol', 'ul', 'blockquote', 'code', 'link', 'clear', 'preview'];

export default function RichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  toolbar = ALL_TOOLBAR,
}) {
  // Normalize: if incoming value is legacy HTML, display as markdown
  const mdValue = useMemo(() => htmlToMd(value), [value]);

  // mode: 'source' | 'split' | 'preview'
  const [mode, setMode] = useState('source');
  const taRef = useRef(null);

  const show = (key) => toolbar.includes(key);

  /** Wrap the current selection with markdown syntax. */
  const wrap = (before, after = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = mdValue.slice(s, e);
    const newVal = mdValue.slice(0, s) + before + selected + after + mdValue.slice(e);
    onChange?.(newVal);
    requestAnimationFrame(() => {
      if (!taRef.current) return;
      taRef.current.selectionStart = s + before.length;
      taRef.current.selectionEnd   = e + before.length;
      taRef.current.focus();
    });
  };

  /** Prefix each selected line (e.g. '- ' or '1. ' or '> '). */
  const prefixLines = (prefix) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const head = mdValue.slice(0, s);
    const sel  = mdValue.slice(s, e) || '';
    const tail = mdValue.slice(e);
    const lineStart = head.lastIndexOf('\n') + 1;
    const prefixed = (head.slice(lineStart) + sel)
      .split('\n').map(l => prefix + l).join('\n');
    onChange?.(head.slice(0, lineStart) + prefixed + tail);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const insertLink = () => {
    const url = window.prompt('URL:');
    if (!url) return;
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const label = mdValue.slice(s, e) || 'Link';
    const md = `[${label}](${url})`;
    onChange?.(mdValue.slice(0, s) + md + mdValue.slice(e));
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const previewHtml = marked.parse(mdValue || '');

  const btn = (key, label, action, title) =>
    show(key) ? (
      <button key={key} type="button" title={title || (typeof label === 'string' ? label : '')} onClick={action} style={btnStyle}>
        {label}
      </button>
    ) : null;

  return (
    <div style={wrapStyle}>
      {!readOnly && (
        <div style={toolbarStyle}>
          {btn('bold',       <b>B</b>,  () => wrap('**'),          'Bold (**text**)')}
          {btn('italic',     <i>I</i>,  () => wrap('*'),           'Italic (*text*)')}
          {btn('strike',     <s>S</s>,  () => wrap('~~'),          'Strikethrough (~~text~~)')}
          {(show('bold') || show('italic') || show('strike')) && (show('ol') || show('ul')) && <span style={sepStyle} />}
          {btn('ol',         'OL',      () => prefixLines('1. '),  'Ordered list')}
          {btn('ul',         'UL',      () => prefixLines('- '),   'Unordered list')}
          {(show('ol') || show('ul')) && (show('blockquote') || show('code') || show('link')) && <span style={sepStyle} />}
          {btn('blockquote', '"',       () => prefixLines('> '),   'Blockquote')}
          {btn('code',       '<>',      () => wrap('`'),           'Inline code')}
          {btn('link',       'Link',    insertLink,                'Insert link')}
          {show('clear') && <span style={sepStyle} />}
          {btn('clear',      '✕',      () => onChange?.(''),      'Clear')}
          {show('preview') && <span style={{ ...sepStyle, marginLeft: 'auto' }} />}
          {show('preview') && (
            <>
              <button
                type="button"
                title="Nur Markdown"
                onClick={() => setMode('source')}
                style={{ ...btnStyle, ...(mode === 'source' ? btnActiveStyle : {}) }}
              >MD</button>
              <button
                type="button"
                title="Split: Markdown + Vorschau"
                onClick={() => setMode('split')}
                style={{ ...btnStyle, ...(mode === 'split' ? btnActiveStyle : {}) }}
              >⬜⬜</button>
              <button
                type="button"
                title="Nur Vorschau"
                onClick={() => setMode('preview')}
                style={{ ...btnStyle, ...(mode === 'preview' ? btnActiveStyle : {}) }}
              >👁</button>
            </>
          )}
        </div>
      )}

      {mode === 'preview' ? (
        <div style={previewStyle} dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : mode === 'split' ? (
        <div style={splitWrapStyle}>
          <textarea
            ref={taRef}
            value={mdValue}
            onChange={e => onChange?.(e.target.value)}
            disabled={readOnly}
            placeholder={placeholder || 'Markdown eingeben…'}
            style={{ ...textareaStyle, borderRight: '1px solid var(--border-color)', resize: 'none', flex: 1 }}
            spellCheck={false}
          />
          <div style={{ ...previewStyle, flex: 1, borderLeft: 'none' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={mdValue}
          onChange={e => onChange?.(e.target.value)}
          disabled={readOnly}
          placeholder={placeholder || 'Markdown eingeben…'}
          rows={4}
          style={textareaStyle}
          spellCheck={false}
        />
      )}
    </div>
  );
}

const wrapStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-secondary)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const splitWrapStyle = {
  display: 'flex',
  flexDirection: 'row',
  minHeight: '120px',
  flex: 1,
};

const toolbarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 6px',
  background: 'var(--bg-tertiary)',
  borderBottom: '1px solid var(--border-color)',
  flexShrink: 0,
};

const btnStyle = {
  padding: '2px 7px',
  fontSize: '0.8rem',
  fontWeight: 600,
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  lineHeight: 1.4,
  fontFamily: 'inherit',
};

const btnActiveStyle = {
  background: 'var(--accent-primary)',
  color: '#fff',
  borderColor: 'var(--accent-primary)',
};

const sepStyle = {
  display: 'inline-block',
  width: '1px',
  background: 'var(--border-color)',
  margin: '2px 2px',
  alignSelf: 'stretch',
};

const textareaStyle = {
  flex: 1,
  width: '100%',
  minHeight: '90px',
  padding: '8px 10px',
  border: 'none',
  outline: 'none',
  resize: 'vertical',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: '0.875rem',
  lineHeight: 1.6,
  boxSizing: 'border-box',
  caretColor: 'var(--accent-primary)',
};

const previewStyle = {
  flex: 1,
  padding: '10px 12px',
  minHeight: '90px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  lineHeight: 1.7,
  overflowY: 'auto',
};
