/**
 * WysiwygRichTextEditor – TipTap-basierter WYSIWYG-Editor (Aufbau und
 * Bedienung wie SparkDown) mit identischer Props-Schnittstelle wie
 * RichTextEditor, damit beide über SmartRichTextEditor austauschbar sind.
 * Speichert HTML (Leerzeilen, Überschriften, Tabellen, Bilder); Markdown-
 * Altwerte werden beim Laden gewandelt. Ansichten: Markdown-Quelle,
 * WYSIWYG oder geteilt (beide editierbar, live synchron).
 *
 * Props:
 *   value       {string}   HTML oder Markdown (controlled)
 *   onChange    {Function} called with new HTML string on every change
 *   readOnly    {boolean}  disable editing
 *   placeholder {string}
 *   toolbarExtra {ReactNode} am Ende der Werkzeugleiste (z. B. „Groß“-Knopf)
 *   expanded    {boolean}  füllt die Höhe des Elternelements (große Ansicht)
 * Die Werkzeugleiste ist pro Browser anpassbar („Anpassen“, localStorage);
 * eine `toolbar`-Prop der Aufrufer wird nicht mehr ausgewertet.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { toEditorHtml, fromEditorHtml } from '../lib/richTextHtml';
import { CMD_META, loadPrefs, savePrefs, fixWordLists, srcToContent } from '../lib/wysiwygCommands';
import FilePickerModal from './FilePickerModal';
import WysiwygToolbarDialog from './WysiwygToolbarDialog';

// Leerer Absatz = Leerzeile: im Markdown als eigene <br>-Zeile, sonst ginge sie verloren.
const BlankLineParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          if (node.childCount === 0) state.write('<br>');
          else state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

const FMT = { b: { fontWeight: 700 }, i: { fontStyle: 'italic' }, u: { textDecoration: 'underline' }, s: { textDecoration: 'line-through' } };
const VIEWS = [['md', 'Markdown'], ['wys', 'WYSIWYG'], ['split', 'Split']];
const TABLE_TOOLS = [['+Zeile', 'Zeile darunter einfügen', 'addRowAfter'], ['−Zeile', 'Zeile löschen', 'deleteRow'], ['+Spalte', 'Spalte rechts einfügen', 'addColumnAfter'], ['−Spalte', 'Spalte löschen', 'deleteColumn'], ['Kopfzeile', 'Kopfzeile umschalten', 'toggleHeaderRow'], ['Tabelle ✕', 'Tabelle löschen', 'deleteTable']];
const keepFocus = (e) => { if (e.target.tagName === 'BUTTON') e.preventDefault(); };

export default function WysiwygRichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  toolbarExtra = null,
  expanded = false,
}) {
  const lastEmitted = useRef(value);
  const srcRef = useRef(null);
  const fromSrc = useRef(false);
  const pane = useRef('wys'); // zuletzt fokussiertes Feld (Quelle/WYSIWYG)
  const [prefs, setPrefs] = useState(loadPrefs);
  const [srcText, setSrcText] = useState('');
  const [pickingImage, setPickingImage] = useState(false);
  const [link, setLink] = useState(null); // null = Dialog zu, sonst { url, blank, nofollow, title }
  const [customizing, setCustomizing] = useState(false);
  const [ctx, setCtx] = useState(null);

  const update = (patch) => setPrefs((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; });
  const zoomBy = (d) => update({ zoom: Math.min(2, Math.max(0.5, +(prefs.zoom + d).toFixed(1))) });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal erzeugen, Sync unten per useEffect
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] }, paragraph: false }),
      BlankLineParagraph,
      Underline,
      Link.extend({
        addAttributes() {
          return { ...this.parent?.(), title: { default: null } };
        },
      }).configure({ openOnClick: false, HTMLAttributes: { target: null, rel: null } }),
      Image,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || 'Text eingeben…' }),
      Markdown.configure({ html: true, breaks: true, linkify: false }),
    ],
    content: toEditorHtml(value),
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'wte-content' },
      transformPastedHTML: fixWordLists,
    },
    onCreate({ editor: ed }) {
      setSrcText(ed.storage.markdown.getMarkdown());
    },
    onUpdate({ editor: ed }) {
      const out = fromEditorHtml(ed.getHTML());
      lastEmitted.current = out;
      if (!fromSrc.current) setSrcText(ed.storage.markdown.getMarkdown());
      onChange?.(out);
    },
  }, []);

  // Extern geänderten `value` (z. B. anderer Block ausgewählt) in den Editor
  // übernehmen — aber nur, wenn er nicht der zuletzt selbst gemeldete ist.
  // Sonst würde jedes eigene Tastendruck-Update den Cursor zurücksetzen.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toEditorHtml(value), false);
    setSrcText(editor.storage.markdown.getMarkdown());
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  // ---- Quelltext-Feld ----
  const applySrc = (text) => {
    setSrcText(text);
    fromSrc.current = true;
    editor.commands.setContent(srcToContent(text), true);
    fromSrc.current = false;
  };
  const inSrc = () => prefs.view === 'md' || (prefs.view === 'split' && pane.current === 'src');
  const edit = (text, selStart, selEnd) => {
    applySrc(text);
    requestAnimationFrame(() => { const t = srcRef.current; if (t) { t.focus(); t.setSelectionRange(selStart, selEnd); } });
  };
  const wrap = (a, b) => {
    const { selectionStart: s, selectionEnd: e, value: v } = srcRef.current;
    edit(v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e), s + a.length, e + a.length);
  };
  const lineStart = () => srcRef.current.value.lastIndexOf('\n', srcRef.current.selectionStart - 1) + 1;
  const prefix = (p) => {
    const t = srcRef.current; const s = lineStart();
    edit(t.value.slice(0, s) + p + t.value.slice(s), t.selectionStart + p.length, t.selectionEnd + p.length);
  };
  const setLine = (p) => {
    const t = srcRef.current; const s = lineStart();
    const m = /^#{1,6} /.exec(t.value.slice(s));
    edit(t.value.slice(0, s) + p + t.value.slice(s + (m ? m[0].length : 0)), s + p.length, s + p.length);
  };

  // ---- Befehle: [WYSIWYG-Aktion, Aktiv-Test]; Quelltext-Variante steht in CMD_META ----
  const ed = () => editor.chain().focus();
  const A = editor && {
    undo: [() => ed().undo().run(), () => false],
    redo: [() => ed().redo().run(), () => false],
    b: [() => ed().toggleBold().run(), () => editor.isActive('bold')],
    i: [() => ed().toggleItalic().run(), () => editor.isActive('italic')],
    u: [() => ed().toggleUnderline().run(), () => editor.isActive('underline')],
    s: [() => ed().toggleStrike().run(), () => editor.isActive('strike')],
    code: [() => ed().toggleCode().run(), () => editor.isActive('code')],
    p: [() => ed().setParagraph().run(), () => editor.isActive('paragraph')],
    ul: [() => ed().toggleBulletList().run(), () => editor.isActive('bulletList')],
    ol: [() => ed().toggleOrderedList().run(), () => editor.isActive('orderedList')],
    quote: [() => ed().toggleBlockquote().run(), () => editor.isActive('blockquote')],
    codeblock: [() => ed().toggleCodeBlock().run(), () => editor.isActive('codeBlock')],
    hr: [() => ed().setHorizontalRule().run(), () => false],
    table: [() => ed().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), () => editor.isActive('table')],
    link: [openLink, () => editor.isActive('link')],
    image: [() => setPickingImage(true), () => false],
  };
  if (A) {
    [1, 2, 3, 4, 5].forEach((n) => {
      A['h' + n] = [() => ed().toggleHeading({ level: n }).run(), () => editor.isActive('heading', { level: n })];
    });
  }
  const run = (id) => {
    const m = CMD_META[id];
    if (!inSrc() || ['undo', 'redo', 'link', 'image'].includes(id)) return A[id][0]();
    if (m.md) wrap(...m.md); else if (m.pre != null) prefix(m.pre); else setLine(m.line);
    return undefined;
  };

  function openLink() {
    const a = inSrc() ? {} : editor.getAttributes('link');
    setLink({ url: a.href || '', blank: a.target === '_blank', nofollow: /nofollow/.test(a.rel || ''), title: a.title || '' });
  }
  const applyLink = () => {
    const url = link.url.trim();
    const title = link.title.trim();
    const rel = [link.blank && 'noopener noreferrer', link.nofollow && 'nofollow'].filter(Boolean).join(' ') || null;
    const attrs = { href: url, target: link.blank ? '_blank' : null, rel, title: title || null };
    setLink(null);
    if (inSrc()) {
      if (!url) return;
      if (!link.blank && !link.nofollow && !title) { wrap('[', `](${url})`); return; }
      const extra = [link.blank && ' target="_blank"', rel && ` rel="${rel}"`, title && ` title="${title.replace(/"/g, '&quot;')}"`].filter(Boolean).join('');
      wrap(`<a href="${url}"${extra}>`, '</a>');
      return;
    }
    if (!url) { ed().extendMarkRange('link').unsetLink().run(); return; }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      ed().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs }] }).run();
    } else {
      ed().extendMarkRange('link').setLink(attrs).run();
    }
  };

  const pickImage = (url) => {
    setPickingImage(false);
    if (inSrc()) wrap('', `![](${url})`); else ed().setImage({ src: url, alt: '' }).run();
  };

  const showSrc = prefs.view !== 'wys';
  const showWys = prefs.view !== 'md';
  const inTable = Boolean(editor) && editor.isActive('table');
  const ctxItems = editor ? [
    ...['b', 'i', 'u'].map((id) => [CMD_META[id].n, () => A[id][0]()]),
    ['Link setzen…', () => A.link[0]()],
    ...['h2', 'h3', 'p'].map((id) => [CMD_META[id].n, () => A[id][0]()]),
    ...(inTable ? TABLE_TOOLS.map(([, t, c]) => [t, () => ed()[c]().run()]) : []),
  ] : [];

  return (
    <div style={expanded ? { ...wrapStyle, flex: 1, minHeight: 0, border: 'none', borderRadius: 0 } : wrapStyle} onClick={() => ctx && setCtx(null)}>
      {!readOnly && editor && (
        <div style={toolbarStyle} onMouseDown={keepFocus} onContextMenu={(e) => { e.preventDefault(); setCustomizing(true); }}>
          <div style={segStyle}>
            {VIEWS.map(([v, l]) => (
              <button key={v} type="button" title={`${l}-Ansicht`} onClick={() => update({ view: v })} style={{ ...btnStyle, border: 'none', ...(prefs.view === v ? btnActiveStyle : {}) }}>{l}</button>
            ))}
          </div>
          {prefs.bar.map((id, i) => {
            const m = CMD_META[id];
            const disabled = (id === 'undo' && !editor.can().undo()) || (id === 'redo' && !editor.can().redo());
            return (
              <React.Fragment key={id}>
                {(i === 0 || CMD_META[prefs.bar[i - 1]].g !== m.g) && <span style={sepStyle} />}
                <button type="button" title={m.n} disabled={disabled} onClick={() => run(id)} style={{ ...btnStyle, ...(A[id][1]() ? btnActiveStyle : {}) }}>
                  <span style={FMT[m.fmt]}>{m.l}</span>
                </button>
              </React.Fragment>
            );
          })}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button type="button" title="Werkzeugleiste anpassen (auch: Rechtsklick)" onClick={() => setCustomizing(true)} style={btnStyle}>☰ Anpassen</button>
            {toolbarExtra}
          </span>
        </div>
      )}
      {!readOnly && inTable && showWys && (
        <div style={{ ...toolbarStyle, background: 'var(--bg-secondary)' }} onMouseDown={keepFocus}>
          {TABLE_TOOLS.map(([l, t, c]) => (
            <button key={c} type="button" title={t} onClick={() => ed()[c]().run()} style={btnStyle}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ ...(showSrc && showWys ? splitStyle : {}), ...(expanded ? { flex: 1, minHeight: 0 } : {}) }}>
        {showSrc && (
          <textarea
            ref={srcRef}
            value={srcText}
            readOnly={readOnly}
            spellCheck={false}
            placeholder="Markdown schreiben…"
            onFocus={() => { pane.current = 'src'; }}
            onChange={(e) => applySrc(e.target.value)}
            style={{ ...srcStyle, fontSize: `${0.85 * prefs.zoom}rem`, ...(expanded ? { height: '100%' } : {}) }}
          />
        )}
        <div
          style={{ display: showWys ? 'block' : 'none', ...(expanded ? { minHeight: 0, overflowY: 'auto' } : {}) }}
          onFocus={() => { pane.current = 'wys'; }}
          onWheel={(e) => { if (e.ctrlKey) zoomBy(e.deltaY < 0 ? 0.1 : -0.1); }}
          onContextMenu={(e) => { if (readOnly || e.shiftKey) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
        >
          <EditorContent editor={editor} className={expanded ? 'wte-expanded' : undefined} style={{ fontSize: `${0.9 * prefs.zoom}rem` }} />
        </div>
      </div>

      {!readOnly && (
        <div style={statusStyle}>
          <span style={{ flex: 1 }}>{VIEWS.find(([v]) => v === prefs.view)[1]}</span>
          <button type="button" title="Verkleinern" onClick={() => zoomBy(-0.1)} style={zoomBtn}>−</button>
          <button type="button" title="Zoom zurücksetzen" onClick={() => update({ zoom: 1 })} style={zoomBtn}>{Math.round(prefs.zoom * 100)}%</button>
          <button type="button" title="Vergrößern" onClick={() => zoomBy(0.1)} style={zoomBtn}>+</button>
        </div>
      )}

      {ctx && (
        <div style={{ ...ctxStyle, left: ctx.x, top: ctx.y }} role="menu">
          {ctxItems.map(([l, fn]) => (
            <button key={l} type="button" role="menuitem" style={ctxItemStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => { setCtx(null); fn(); }}>{l}</button>
          ))}
        </div>
      )}

      {link && (
        <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) setLink(null); }}>
          <div
            style={dialogStyle}
            role="dialog"
            aria-label="Link"
            onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') applyLink(); if (e.key === 'Escape') { e.stopPropagation(); setLink(null); } }}
          >
            <label style={{ fontSize: '0.85rem' }}>Adresse des Links – z. B. /seite, https://…, mailto:name@…, /uploads/datei.pdf (leer = Link entfernen)
              <input autoFocus type="text" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} style={linkInputStyle} />
            </label>
            <label style={{ fontSize: '0.85rem', display: 'block', marginTop: '8px' }}>Titel (Tooltip, optional)
              <input type="text" value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} style={linkInputStyle} />
            </label>
            <label style={checkStyle}>
              <input type="checkbox" checked={link.blank} onChange={(e) => setLink({ ...link, blank: e.target.checked })} /> In neuem Tab öffnen (target=&quot;_blank&quot;)
            </label>
            <label style={checkStyle}>
              <input type="checkbox" checked={link.nofollow} onChange={(e) => setLink({ ...link, nofollow: e.target.checked })} /> Suchmaschinen nicht folgen (rel=&quot;nofollow&quot;)
            </label>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="button" style={btnStyle} onClick={() => setLink(null)}>Abbrechen</button>
              <button type="button" style={{ ...btnStyle, ...btnActiveStyle }} onClick={applyLink}>OK</button>
            </div>
          </div>
        </div>
      )}

      <FilePickerModal open={pickingImage} onSelect={pickImage} onClose={() => setPickingImage(false)} />
      {customizing && <WysiwygToolbarDialog bar={prefs.bar} onSave={(bar) => { update({ bar }); setCustomizing(false); }} onClose={() => setCustomizing(false)} />}
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

const segStyle = { display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginRight: '4px' };
const splitStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 };
const srcStyle = {
  width: '100%',
  minHeight: '120px',
  boxSizing: 'border-box',
  padding: '8px 10px',
  border: 'none',
  borderRight: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontFamily: "'Fira Code', monospace",
  lineHeight: 1.6,
  resize: 'vertical',
  outline: 'none',
};
const statusStyle = { display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 8px', fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', flexShrink: 0 };
const zoomBtn = { padding: '0 6px', fontSize: '0.7rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' };
const ctxStyle = { position: 'fixed', zIndex: 10002, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', padding: '4px', display: 'flex', flexDirection: 'column', minWidth: '180px' };
const ctxItemStyle = { textAlign: 'left', padding: '4px 10px', fontSize: '0.8rem', background: 'transparent', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' };
const overlayStyle = { position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const dialogStyle = { background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', width: 'min(420px, 92vw)' };
const linkInputStyle = { display: 'block', width: '100%', marginTop: '6px', padding: '5px 8px', boxSizing: 'border-box' };
const checkStyle = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginTop: '6px' };
