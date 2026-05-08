import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Copy, ChevronDown, ChevronUp } from '../lib/muiIcons';

/**
 * DOMCanvas - Visual editor for DOM elements
 * Allows adding, editing, moving, and deleting DOM elements
 */
export default function DOMCanvas({
  pageLayout = [],
  selectedElementId = null,
  onAddElement = null,
  onDeleteElement = null,
  onMoveElement = null,
  onSelectElement = null,
  onUpdateElement = null,
}) {
  const [expandedElements, setExpandedElements] = useState(new Set());

  const toggleExpanded = useCallback((elementId) => {
    const next = new Set(expandedElements);
    if (next.has(elementId)) {
      next.delete(elementId);
    } else {
      next.add(elementId);
    }
    setExpandedElements(next);
  }, [expandedElements]);

  const renderElement = (element, index, parentPath = null, depth = 0) => {
    if (!element) return null;

    const elementPath = parentPath !== null ? `${parentPath}.${index}` : String(index);
    const isSelected = selectedElementId === element.id;
    const isExpanded = expandedElements.has(element.id);
    const hasChildren = Array.isArray(element.children) && element.children.length > 0;

    return (
      <div
        key={element.id}
        style={{
          marginLeft: `${depth * 20}px`,
          marginBottom: '8px',
          borderRadius: '4px',
          border: isSelected ? '2px solid #667eea' : '1px solid #ddd',
          backgroundColor: isSelected ? 'rgba(102, 126, 234, 0.08)' : 'transparent',
        }}
      >
        {/* Element Header */}
        <div
          onClick={() => onSelectElement?.(element.id)}
          style={{
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'rgba(102, 126, 234, 0.12)' : '#fafafa',
            borderBottom: hasChildren && isExpanded ? '1px solid #eee' : 'none',
          }}
        >
          {/* Expand/Collapse Toggle */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(element.id);
              }}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
              }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          ) : (
            <div style={{ width: '24px' }} />
          )}

          {/* Tag Name */}
          <code style={{ fontWeight: 'bold', color: '#667eea', flex: 1 }}>
            &lt;{element.tag}&gt;
          </code>

          {/* Class/ID Display */}
          {element.attrs?.class && (
            <span style={{ fontSize: '0.85rem', color: '#666', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              .{element.attrs.class.split(' ')[0]}
            </span>
          )}

          {/* Content Preview */}
          {element.content && (
            <span style={{ fontSize: '0.85rem', color: '#999', maxWidth: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              "{element.content}"
            </span>
          )}

          {/* Actions */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}
          >
            <button
              type="button"
              onClick={() => onAddElement?.(elementPath, { tag: 'div', id: `elem_${Date.now()}`, attrs: {}, children: [], content: '' })}
              title="Add child element"
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '3px',
                cursor: 'pointer',
                backgroundColor: '#fff',
              }}
            >
              <Plus size={14} />
            </button>

            {index > 0 && (
              <button
                type="button"
                onClick={() => onMoveElement?.('up', index, parentPath)}
                title="Move up"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  backgroundColor: '#fff',
                }}
              >
                ↑
              </button>
            )}

            <button
              type="button"
              onClick={() => onDeleteElement?.(element.id)}
              title="Delete element"
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '3px',
                cursor: 'pointer',
                backgroundColor: '#fff',
                color: '#d32f2f',
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div style={{ paddingLeft: '20px', paddingTop: '8px', paddingBottom: '8px' }}>
            {element.children.map((child, idx) =>
              renderElement(child, idx, elementPath, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #ddd',
        padding: '16px',
        maxHeight: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => onAddElement?.(null, { tag: 'div', id: `elem_${Date.now()}`, attrs: {}, children: [], content: '' })}
          title="Add root-level element"
          style={{
            padding: '8px 12px',
            fontSize: '0.9rem',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#667eea',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Add Element
        </button>
      </div>

      {pageLayout && pageLayout.length > 0 ? (
        <div>
          {pageLayout.map((element, idx) => renderElement(element, idx))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#999', padding: '32px 0' }}>
          <p>No elements yet. Add one to get started.</p>
        </div>
      )}
    </div>
  );
}
