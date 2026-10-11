import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import RichTextEditor from './RichTextEditor';
import WysiwygRichTextEditor from './WysiwygRichTextEditor';
import HelpDocModal from './HelpDocModal';

/**
 * Rendert je nach global unter Einstellungen → Rich-Text-Editor gewähltem
 * Modus ('markdown' | 'wysiwyg', siehe lib/useRichTextEditorMode.js)
 * entweder den bisherigen Markdown-Editor (RichTextEditor) oder den
 * TipTap-WYSIWYG-Editor (WysiwygRichTextEditor). Identische übrige Props
 * wie RichTextEditor — Aufrufer tauschen nur den Import.
 *
 * Zusätzlich: „Groß“-Knopf in der Werkzeugleiste öffnet dasselbe Feld in
 * einer bildschirmfüllenden Ansicht (Esc oder „Schließen“ beendet sie).
 * `label` (optional) erscheint als Überschrift der großen Ansicht.
 */
export default function SmartRichTextEditor({ mode, label, ...props }) {
  // Ziel des Overlays: der nächste `.admin-scope`, damit die Admin-Farbvariablen
  // (--accent-primary, …) greifen — direkt in <body> wären sie undefiniert.
  const [expanded, setExpanded] = useState(null);
  const dialogRef = useRef(null);
  const [linkHelpOpen, setLinkHelpOpen] = useState(false);
  const Editor = mode === 'wysiwyg' ? WysiwygRichTextEditor : RichTextEditor;

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      // Ist die Link-Hilfe darüber geöffnet, schließt Esc zuerst die Hilfe.
      if (e.key !== 'Escape' || document.querySelector('.hdoc-overlay')) return;
      e.stopPropagation();
      setExpanded(null);
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Schreibfläche direkt fokussieren (TipTap rendert asynchron, daher zweimal versuchen)
    const focusEditor = () => {
      const el = dialogRef.current && dialogRef.current.querySelector('textarea, .ProseMirror');
      if (el) el.focus();
      return Boolean(el);
    };
    const raf = window.requestAnimationFrame(() => { if (!focusEditor()) setTimeout(focusEditor, 150); });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  if (props.readOnly) return <Editor {...props} />;

  const linkHelp = (
    <HelpDocModal open={linkHelpOpen} doc="links" dark={false} onClose={() => setLinkHelpOpen(false)} />
  );

  const toolbarExtra = (
    <>
      <button type="button" title="Hilfe: Links richtig setzen" onClick={() => setLinkHelpOpen(true)} style={{ ...expandBtnStyle, marginRight: '2px' }}>?</button>
      <button
        type="button"
        title="Große Ansicht (Esc schließt)"
        onClick={(e) => setExpanded(e.currentTarget.closest('.admin-scope') || document.body)}
        style={expandBtnStyle}
      >⤢ Groß</button>
    </>
  );

  if (!expanded) return <>{linkHelp}<Editor {...props} toolbarExtra={toolbarExtra} /></>;

  return (
    <>
      {linkHelp}
      <div style={placeholderStyle}>
        Wird in der großen Ansicht bearbeitet …{' '}
        <button type="button" onClick={() => setExpanded(null)} style={expandBtnStyle}>Zurück</button>
      </div>
      {typeof document !== 'undefined' && createPortal(
        <div style={backdropStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(null); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label || 'Text bearbeiten'} style={dialogStyle}>
            <div style={dialogHeaderStyle}>
              <strong style={{ fontSize: '0.95rem' }}>{label || 'Text bearbeiten'}</strong>
              <button type="button" onClick={() => setExpanded(null)} style={closeBtnStyle}>Schließen</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Editor {...props} expanded />
            </div>
          </div>
        </div>,
        expanded
      )}
    </>
  );
}

const expandBtnStyle = {
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

const placeholderStyle = {
  padding: '10px 12px',
  border: '1px dashed var(--border-color)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
};

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3vh 3vw',
};

const dialogStyle = {
  width: 'min(1200px, 100%)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary, #fff)',
  borderRadius: '10px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  overflow: 'hidden',
};

const dialogHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
};

const closeBtnStyle = {
  ...expandBtnStyle,
  padding: '4px 12px',
  background: 'var(--accent-primary)',
  color: '#fff',
  borderColor: 'var(--accent-primary)',
};
