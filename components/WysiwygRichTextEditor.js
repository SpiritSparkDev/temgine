/**
 * WysiwygRichTextEditor – TipTap-basierter WYSIWYG-Editor mit identischer
 * Props-Schnittstelle wie RichTextEditor, damit beide über
 * SmartRichTextEditor austauschbar sind. Speichert HTML (Leerzeilen,
 * Überschriften, Bilder); Markdown-Altwerte werden beim Laden gewandelt.
 *
 * Props:
 *   value       {string}   HTML oder Markdown (controlled)
 *   onChange    {Function} called with new HTML string on every change
 *   readOnly    {boolean}  disable editing
 *   placeholder {string}
 *   toolbar     {string[]} subset of buttons to show (default: all unterstützten)
 *   toolbarExtra {ReactNode} am Ende der Werkzeugleiste (z. B. „Groß“-Knopf)
 *   expanded    {boolean}  füllt die Höhe des Elternelements (große Ansicht)
 */
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { toEditorHtml, fromEditorHtml } from '../lib/richTextHtml';
import FilePickerModal from './FilePickerModal';

const ALL_TOOLBAR = ['bold', 'italic', 'strike', 'ol', 'ul', 'blockquote', 'code', 'link', 'clear'];

export default function WysiwygRichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  toolbar = ALL_TOOLBAR,
  toolbarExtra = null,
  expanded = false,
}) {
  const show = (key) => toolbar.includes(key);
  const lastEmitted = useRef(value);
  const [pickingImage, setPickingImage] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal erzeugen, Sync unten per useEffect
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { target: null } }),
      Image,
      Placeholder.configure({ placeholder: placeholder || 'Text eingeben…' }),
    ],
    content: toEditorHtml(value),
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'wte-content' },
    },
    onUpdate({ editor: ed }) {
      const out = fromEditorHtml(ed.getHTML());
      lastEmitted.current = out;
      onChange?.(out);
    },
  }, []);

  // Extern geänderten `value` (z. B. anderer Block ausgewählt) in den Editor
  // übernehmen — aber nur, wenn er sich wirklich vom zuletzt selbst
  // gemeldeten Wert unterscheidet. Sonst würde jedes eigene Tastendruck-
  // Update (onUpdate → onChange → Eltern-State → neuer value-Prop) den
  // Cursor zurücksetzen.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toEditorHtml(value), false);
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  return (
    <div style={expanded ? { ...wrapStyle, flex: 1, minHeight: 0, border: 'none', borderRadius: 0 } : wrapStyle}>
      {!readOnly && editor && (
        <div style={toolbarStyle}>
          <button type="button" title="Rückgängig (Strg+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} style={btnStyle}>↶</button>
          <button type="button" title="Wiederholen (Strg+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} style={btnStyle}>↷</button>
          <select
            title="Absatzformat"
            value={[1, 2, 3, 4].find((l) => editor.isActive('heading', { level: l })) || 0}
            onChange={(e) => {
              const l = Number(e.target.value);
              const c = editor.chain().focus();
              (l ? c.setHeading({ level: l }) : c.setParagraph()).run();
            }}
            style={{ ...btnStyle, fontWeight: 400 }}
          >
            <option value={0}>Absatz</option>
            <option value={1}>Überschrift 1</option>
            <option value={2}>Überschrift 2</option>
            <option value={3}>Überschrift 3</option>
            <option value={4}>Überschrift 4</option>
          </select>
          <span style={sepStyle} />
          {show('bold') && (
            <button type="button" title="Fett" onClick={() => editor.chain().focus().toggleBold().run()} style={{ ...btnStyle, ...(editor.isActive('bold') ? btnActiveStyle : {}) }}><b>B</b></button>
          )}
          {show('italic') && (
            <button type="button" title="Kursiv" onClick={() => editor.chain().focus().toggleItalic().run()} style={{ ...btnStyle, ...(editor.isActive('italic') ? btnActiveStyle : {}) }}><i>I</i></button>
          )}
          {show('strike') && (
            <button type="button" title="Durchgestrichen" onClick={() => editor.chain().focus().toggleStrike().run()} style={{ ...btnStyle, ...(editor.isActive('strike') ? btnActiveStyle : {}) }}><s>S</s></button>
          )}
          {(show('bold') || show('italic') || show('strike')) && (show('ol') || show('ul')) && <span style={sepStyle} />}
          {show('ol') && (
            <button type="button" title="Nummerierte Liste" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={{ ...btnStyle, ...(editor.isActive('orderedList') ? btnActiveStyle : {}) }}>OL</button>
          )}
          {show('ul') && (
            <button type="button" title="Liste" onClick={() => editor.chain().focus().toggleBulletList().run()} style={{ ...btnStyle, ...(editor.isActive('bulletList') ? btnActiveStyle : {}) }}>UL</button>
          )}
          {(show('ol') || show('ul')) && (show('blockquote') || show('code') || show('link')) && <span style={sepStyle} />}
          {show('blockquote') && (
            <button type="button" title="Zitat" onClick={() => editor.chain().focus().toggleBlockquote().run()} style={{ ...btnStyle, ...(editor.isActive('blockquote') ? btnActiveStyle : {}) }}>&quot;</button>
          )}
          {show('code') && (
            <button type="button" title="Inline-Code" onClick={() => editor.chain().focus().toggleCode().run()} style={{ ...btnStyle, ...(editor.isActive('code') ? btnActiveStyle : {}) }}>&lt;&gt;</button>
          )}
          {show('link') && (
            <button
              type="button"
              title="Link einfügen"
              onClick={() => {
                const url = window.prompt('Adresse des Links – z. B. /seite, https://…, mailto:name@…, /uploads/datei.pdf (Hilfe: „?“-Knopf)');
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }}
              style={{ ...btnStyle, ...(editor.isActive('link') ? btnActiveStyle : {}) }}
            >Link</button>
          )}
          <button type="button" title="Trennlinie" onClick={() => editor.chain().focus().setHorizontalRule().run()} style={btnStyle}>―</button>
          <button type="button" title="Bild einfügen" onClick={() => setPickingImage(true)} style={btnStyle}>Bild</button>
          {show('clear') && <span style={sepStyle} />}
          {show('clear') && (
            <button type="button" title="Leeren" onClick={() => editor.chain().focus().clearContent().run()} style={btnStyle}>✕</button>
          )}
          {toolbarExtra && <span style={{ marginLeft: 'auto' }}>{toolbarExtra}</span>}
        </div>
      )}

      <FilePickerModal
        open={pickingImage}
        onSelect={(url) => { setPickingImage(false); editor?.chain().focus().setImage({ src: url, alt: '' }).run(); }}
        onClose={() => setPickingImage(false)}
      />
      <EditorContent editor={editor} className={expanded ? 'wte-expanded' : undefined} style={expanded ? { flex: 1, minHeight: 0, overflowY: 'auto' } : undefined} />
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
