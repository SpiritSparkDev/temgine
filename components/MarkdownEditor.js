import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

/**
 * MarkdownEditor - Edit element content with rich text support
 * Uses Quill editor for HTML content editing
 */
export default function MarkdownEditor({
  elementId = null,
  content = '',
  onChange = null,
  onSave = null,
}) {
  const [html, setHtml] = useState(content);
  const [isDirty, setIsDirty] = useState(false);

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['blockquote', 'code-block'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'script', 'sub', 'super',
    'indent',
    'blockquote', 'code-block',
    'color', 'background',
    'align',
    'link', 'image'
  ];

  const handleChange = (value) => {
    setHtml(value);
    setIsDirty(true);
    onChange?.(value);
  };

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

      <div style={{ flex: 1, minHeight: '300px', marginBottom: '12px' }}>
        <ReactQuill
          value={html}
          onChange={handleChange}
          modules={modules}
          formats={formats}
          theme="snow"
          placeholder="Enter HTML content..."
          style={{ height: '100%', backgroundColor: 'white' }}
        />
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
