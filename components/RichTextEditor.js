/**
 * RichTextEditor – lightweight TipTap-based WYSIWYG editor.
 * Drop-in replacement for react-quill; renders HTML in, HTML out.
 *
 * Props:
 *   value       {string}   HTML string (controlled from outside)
 *   onChange    {Function} called with new HTML string on every change
 *   readOnly    {boolean}  disable editing
 *   placeholder {string}
 *   toolbar     {string[]} subset of buttons to show (default: all)
 */
import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';

const ALL_TOOLBAR = ['bold', 'italic', 'strike', 'ol', 'ul', 'blockquote', 'code', 'link', 'image', 'clear'];

export default function RichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  toolbar = ALL_TOOLBAR,
}) {
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. resetting the form)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  // Sync readOnly
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  const show = (key) => toolbar.includes(key);

  const btn = (key, label, action, title) =>
    show(key) ? (
      <button key={key} type="button" title={title || label} onClick={action} style={btnStyle}>
        {label}
      </button>
    ) : null;

  return (
    <div style={wrapStyle}>
      {editor && !readOnly && (
        <div style={toolbarStyle}>
          {btn('bold',       'B',    () => editor.chain().focus().toggleBold().run(),         'Bold')}
          {btn('italic',     'I',    () => editor.chain().focus().toggleItalic().run(),        'Italic')}
          {btn('strike',     'S̶',    () => editor.chain().focus().toggleStrike().run(),        'Strike')}
          {(show('bold') || show('italic') || show('strike')) && show('ol') && <span style={sepStyle} />}
          {btn('ol',         'OL',   () => editor.chain().focus().toggleOrderedList().run())}
          {btn('ul',         'UL',   () => editor.chain().focus().toggleBulletList().run())}
          {(show('ol') || show('ul')) && show('blockquote') && <span style={sepStyle} />}
          {btn('blockquote', '"',    () => editor.chain().focus().toggleBlockquote().run(),    'Blockquote')}
          {btn('code',       '<>',   () => editor.chain().focus().toggleCodeBlock().run(),     'Code block')}
          {(show('blockquote') || show('code')) && show('link') && <span style={sepStyle} />}
          {btn('link',       'Link', () => {
            const url = window.prompt('URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          })}
          {btn('image',      'Img',  () => {
            const url = window.prompt('Image URL:');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          })}
          {show('clear') && <span style={sepStyle} />}
          {btn('clear',      '✕',    () => editor.chain().focus().clearNodes().unsetAllMarks().run(), 'Clear formatting')}
        </div>
      )}
      <EditorContent
        editor={editor}
        style={{ padding: '8px', minHeight: '80px', outline: 'none' }}
      />
      {!editor && placeholder && (
        <div style={{ padding: '8px', color: '#9ca3af', fontStyle: 'italic' }}>{placeholder}</div>
      )}
    </div>
  );
}

const wrapStyle = {
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  background: 'white',
  overflow: 'hidden',
};

const toolbarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2px',
  padding: '4px 6px',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
};

const btnStyle = {
  padding: '2px 7px',
  fontSize: '0.8rem',
  fontWeight: 600,
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  cursor: 'pointer',
  lineHeight: 1.4,
};

const sepStyle = {
  display: 'inline-block',
  width: '1px',
  background: '#d1d5db',
  margin: '0 2px',
  alignSelf: 'stretch',
};
