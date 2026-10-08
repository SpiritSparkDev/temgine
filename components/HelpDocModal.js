import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marked } from 'marked';
import { X } from '../lib/muiIcons';

// Eigene Marked-Instanz (kein globales marked.setOptions, das RichTextEditor setzt).
// Überschriften bekommen eine id, damit die Kurzreferenz direkt zu Abschnitten springen kann.
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${slugify(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

// Anleitungen (help/*.md) in einem Fenster. `doc` = Dateiname ohne .md,
// `anchor` = Anfang einer Überschrift-id (z. B. "checkbox"), zu der gescrollt wird.
export default function HelpDocModal({ open, onClose, doc = 'templates', anchor = '', dark = true }) {
  const [docs, setDocs] = useState([]);
  const [current, setCurrent] = useState(doc);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(0);
  const anchorRef = useRef('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    anchorRef.current = anchor;
    setCurrent(doc);
  }, [open, doc, anchor]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/help').then(r => r.json()).then(list => setDocs(Array.isArray(list) ? list : [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    fetch(`/api/help/${encodeURIComponent(current)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Anleitung konnte nicht geladen werden'))))
      .then(d => { setMarkdown(d.markdown || ''); setLoaded(n => n + 1); })
      .catch(e => { setMarkdown(''); setError(e.message); });
  }, [open, current]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const html = useMemo(() => md.parse(markdown || ''), [markdown]);

  // Nach jedem Laden: zum angeforderten Abschnitt springen, sonst nach oben.
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const target = anchorRef.current
      ? Array.from(bodyRef.current.querySelectorAll('[id]')).find(el => el.id.startsWith(anchorRef.current))
      : null;
    bodyRef.current.scrollTop = target ? target.offsetTop - 8 : 0;
    // Nicht gefunden = evtl. noch der Inhalt einer anderen Anleitung: Anker für das nächste Laden behalten.
    if (target) anchorRef.current = '';
  }, [open, loaded]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`hdoc-overlay${dark ? ' hdoc-dark' : ''}`} onClick={onClose}>
      <div className="hdoc-modal" role="dialog" aria-label="Dokumentation" onClick={e => e.stopPropagation()}>
        <div className="hdoc-head">
          <h3>Dokumentation</h3>
          <nav className="hdoc-tabs" aria-label="Anleitungen">
            {docs.map(d => (
              <button key={d.name} type="button" className={`hdoc-tab${d.name === current ? ' active' : ''}`} onClick={() => { anchorRef.current = ''; setCurrent(d.name); }}>
                {d.title}
              </button>
            ))}
          </nav>
          <button type="button" className="hdoc-close" onClick={onClose} aria-label="Schließen"><X size={16} /></button>
        </div>
        <div className="hdoc-body" ref={bodyRef}>
          {error ? <p className="hdoc-error">{error}</p> : <div className="hdoc-content" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
