import React, { useState, useEffect } from 'react';
import { Save } from '../lib/muiIcons';

/**
 * ElementPropertyEditor - Edit properties of a selected DOM element
 * Allows changing tag, attributes, content, etc.
 */
export default function ElementPropertyEditor({
  element = null,
  onUpdate = null,
}) {
  const [tag, setTag] = useState('');
  const [content, setContent] = useState('');
  const [id, setId] = useState('');
  const [className, setClassName] = useState('');
  const [dataAttributes, setDataAttributes] = useState({});
  const [otherAttributes, setOtherAttributes] = useState({});

  // Common HTML tags
  const commonTags = [
    'div', 'section', 'article', 'header', 'footer', 'nav',
    'main', 'aside', 'figure', 'figcaption',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'span', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code',
    'a', 'button', 'form', 'input', 'textarea', 'select', 'label',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'video', 'audio', 'canvas'
  ];

  // Load element properties when element changes
  useEffect(() => {
    if (element) {
      setTag(element.tag || 'div');
      setContent(element.content || '');
      setId(element.attrs?.id || '');
      setClassName(element.attrs?.class || '');
      
      // Separate data attributes from others
      const data = {};
      const other = {};
      
      if (element.attrs) {
        for (const [key, value] of Object.entries(element.attrs)) {
          if (key.startsWith('data-')) {
            data[key] = value;
          } else if (key !== 'id' && key !== 'class') {
            other[key] = value;
          }
        }
      }
      
      setDataAttributes(data);
      setOtherAttributes(other);
    }
  }, [element?.id]);

  const handleSave = () => {
    if (!element) return;

    const updated = {
      ...element,
      tag,
      content,
      attrs: {
        ...element.attrs,
        id: id || undefined,
        class: className || undefined,
        ...dataAttributes,
        ...otherAttributes,
      }
    };

    // Clean up undefined values
    Object.keys(updated.attrs).forEach(key => {
      if (updated.attrs[key] === undefined) {
        delete updated.attrs[key];
      }
    });

    onUpdate?.(updated);
  };

  if (!element) {
    return (
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #ddd',
        padding: '16px',
        textAlign: 'center',
        color: '#999',
      }}>
        <p>Select an element to edit its properties</p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      border: '1px solid #ddd',
      padding: '16px',
      maxHeight: '100%',
      overflowY: 'auto',
    }}>
      <h4 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1rem' }}>
        Element Properties
      </h4>

      {/* Tag Selection */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
          HTML Tag
        </label>
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}
        >
          {commonTags.map(t => (
            <option key={t} value={t}>&lt;{t}&gt;</option>
          ))}
          <option value="">--- Custom ---</option>
        </select>
        {!commonTags.includes(tag) && tag && (
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Custom tag name"
            style={{
              width: '100%',
              padding: '6px',
              marginTop: '4px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
          Text Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Element text content"
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
            resize: 'vertical',
          }}
        />
      </div>

      {/* ID */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
          ID
        </label>
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="element-id"
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}
        />
      </div>

      {/* Class */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
          Class
        </label>
        <input
          type="text"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          placeholder="class-name another-class"
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}
        />
      </div>

      {/* Data Attributes */}
      <div style={{ marginBottom: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
          Data Attributes
        </label>
        {Object.entries(dataAttributes).map(([key, value]) => (
          <div key={key} style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            <input
              type="text"
              value={key}
              placeholder="data-*"
              readOnly
              style={{
                flex: 1,
                padding: '6px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                backgroundColor: '#f5f5f5',
              }}
            />
            <input
              type="text"
              value={value}
              onChange={(e) => {
                const next = { ...dataAttributes };
                next[key] = e.target.value;
                setDataAttributes(next);
              }}
              style={{
                flex: 2,
                padding: '6px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.8rem',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...dataAttributes };
                delete next[key];
                setDataAttributes(next);
              }}
              style={{
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#fff',
                color: '#d32f2f',
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const newKey = `data-attr${Object.keys(dataAttributes).length + 1}`;
            setDataAttributes({ ...dataAttributes, [newKey]: '' });
          }}
          style={{
            padding: '6px 12px',
            fontSize: '0.8rem',
            border: '1px solid #667eea',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: '#fff',
            color: '#667eea',
          }}
        >
          + Add Data Attr
        </button>
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#667eea',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <Save size={16} />
        Save Changes
      </button>
    </div>
  );
}
