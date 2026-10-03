/**
 * WysiwygRichTextEditor – TipTap-basierter WYSIWYG-Editor mit identischer
 * Props-Schnittstelle wie RichTextEditor (Markdown rein/raus), damit beide
 * über SmartRichTextEditor austauschbar sind, ohne dass Aufrufer sich
 * ändern müssen.
 *
 * Props:
 *   value       {string}   Markdown string (controlled)
 *   onChange    {Function} called with new Markdown string on every change
 *   readOnly    {boolean}  disable editing
 *   placeholder {string}
 *   toolbar     {string[]} subset of buttons to show (default: all unterstützten)
 */
import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { htmlToMd } from '../lib/richTextNormalize';

const ALL_TOOLBAR = ['bold', 'italic', 'strike', 'ol', 'ul', 'blockquote', 'code', 'link', 'clear'];

export default function WysiwygRichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  toolbar = ALL_TOOLBAR,
}) {
  const show = (key) => toolbar.includes(key);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal erzeugen, Sync unten per useEffect
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || 'Text eingeben…' }),
      Markdown.configure({ html: false, breaks: true, linkify: false }),
    ],
    content: htmlToMd(value),
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'wte-content' },
    },
    onUpdate({ editor: ed }) {
      onChange?.(ed.storage.markdown.getMarkdown());
    },
  }, []);

  // Extern geänderten `value` (z. B. anderer Block ausgewählt) in den Editor
  // übernehmen — aber nur, wenn er sich wirklich vom zuletzt selbst
  // gemeldeten Wert unterscheidet. Sonst würde jedes eigene Tastendruck-
  // Update (onUpdate → onChange → Eltern-State → neuer value-Prop) den
  // Cursor zurücksetzen.
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    const next = htmlToMd(value);
    if (next !== current) {
      editor.commands.setContent(next, false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  return (
    <div style={wrapStyle}>
      {!readOnly && editor && (
        <div style={toolbarStyle}>
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
                const url = window.prompt('URL:');
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }}
              style={{ ...btnStyle, ...(editor.isActive('link') ? btnActiveStyle : {}) }}
            >Link</button>
          )}
          {show('clear') && <span style={sepStyle} />}
          {show('clear') && (
            <button type="button" title="Leeren" onClick={() => editor.chain().focus().clearContent().run()} style={btnStyle}>✕</button>
          )}
        </div>
      )}

      <EditorContent editor={editor} />
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
