import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';

/**
 * MarkdownEditor - Edit element content with rich text support
 * Uses TipTap editor for HTML content editing
 */
export default function MarkdownEditor({
  elementId = null,
  content = '',
  onChange = null,
  onSave = null,
}) {
  const [isDirty, setIsDirty] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      setIsDirty(true);
      onChange?.(html);
    },
  });

  const html = editor ? editor.getHTML() : content;

  const btn = (label, action, title) => (
    <button type="button" title={title} onClick={action} style={toolbarBtnStyle}>
      {label}
    </button>
  );

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      border: '1px solid #ddd',
      padding: '16px',
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>
          Edit Content
        </h4>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          Element: {elementId}
        </p>
      </div>

      {/* Toolbar */}
      {editor && (
        <div style={toolbarStyle}>
          {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          <span style={separatorStyle} />
          {btn('B', () => editor.chain().focus().toggleBold().run(), 'Bold')}
          {btn('I', () => editor.chain().focus().toggleItalic().run(), 'Italic')}
          {btn('U̲', () => editor.chain().focus().toggleStrike().run(), 'Strikethrough')}
          <span style={separatorStyle} />
          {btn('OL', () => editor.chain().focus().toggleOrderedList().run())}
          {btn('UL', () => editor.chain().focus().toggleBulletList().run())}
          <span style={separatorStyle} />
          {btn('"', () => editor.chain().focus().toggleBlockquote().run(), 'Blockquote')}
          {btn('< >', () => editor.chain().focus().toggleCodeBlock().run(), 'Code block')}
          <span style={separatorStyle} />
          {btn('Link', () => {
            const url = window.prompt('URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          })}
          {btn('Img', () => {
            const url = window.prompt('Image URL:');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          })}
          <span style={separatorStyle} />
          {btn('✕', () => editor.chain().focus().clearNodes().unsetAllMarks().run(), 'Clear formatting')}
        </div>
      )}

      <div style={{ flex: 1, minHeight: '300px', marginBottom: '12px', border: '1px solid #e5e7eb', borderRadius: '4px', overflow: 'auto' }}>
        <EditorContent editor={editor} style={{ padding: '8px', minHeight: '280px' }} />
      </div>

      {isDirty && (
        <button
          type="button"
          onClick={() => {
            onSave?.(html);
            setIsDirty(false);
          }}
          style={{
            padding: '10px',
            backgroundColor: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          Save Content
        </button>
      )}

      {/* Preview */}
      <details style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          HTML Preview
        </summary>
        <pre style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '0.8rem',
          overflow: 'auto',
          maxHeight: '200px',
          margin: 0,
        }}>
          {html}
        </pre>
      </details>
    </div>
  );
}

const toolbarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2px',
  marginBottom: '8px',
  padding: '6px',
  background: '#f3f4f6',
  borderRadius: '4px',
  border: '1px solid #e5e7eb',
};

const toolbarBtnStyle = {
  padding: '3px 8px',
  fontSize: '0.8rem',
  fontWeight: 600,
  background: 'white',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  cursor: 'pointer',
};

const separatorStyle = {
  display: 'inline-block',
  width: '1px',
  background: '#d1d5db',
  margin: '0 2px',
};

