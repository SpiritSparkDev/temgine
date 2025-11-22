import React, { useState, useEffect } from 'react';
import { GripVertical, X } from 'lucide-react';
import { extractTemplateVariables, guessInputType, generateDefaultProps } from '../lib/templateParser';
import { renderTemplate } from '../lib/templateEngine';

export default function PageEditor({ page, templates, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [pageData, setPageData] = useState({});
  const [templateCodes, setTemplateCodes] = useState({});

  useEffect(() => {
    if (page) {
      setTitle(page.title || '');
      setSlug(page.slug || '');
      setTemplate(page.template || '');
      setBlocks(page.blocks || []);
      setPageData(page.data || {});
    }
  }, [page]);

  useEffect(() => {
    // Lade Template-Codes für alle Templates
    const loadTemplateCodes = async () => {
      const codes = {};
      for (const templateName of templates) {
        try {
          const res = await fetch(`/api/templates?name=${encodeURIComponent(templateName)}`);
          if (res.ok) {
            const data = await res.json();
            codes[templateName] = data.code;
          }
        } catch (e) {
          console.error('Template laden fehlgeschlagen:', e);
        }
      }
      setTemplateCodes(codes);
    };
    if (templates.length > 0) {
      loadTemplateCodes();
    }
  }, [templates]);

  function handleAddBlock(type) {
    const newBlock = {
      type,
      template: '',
      props: type === 'text' 
        ? { title: '', content: '' }
        : type === 'gallery'
        ? { images: [] }
        : {}
    };
    setBlocks([...blocks, newBlock]);
  }

  function handleUpdateBlock(index, props) {
    const updated = [...blocks];
    updated[index].props = { ...updated[index].props, ...props };
    setBlocks(updated);
  }

  function handleUpdateBlockTemplate(index, templateName) {
    const updated = [...blocks];
    updated[index].template = templateName;
    
    // Wenn Template gewählt wurde, generiere Default-Props
    if (templateName && templateCodes[templateName]) {
      const defaultProps = generateDefaultProps(templateCodes[templateName]);
      // Merge mit existierenden Props
      updated[index].props = { ...defaultProps, ...updated[index].props };
    }
    
    setBlocks(updated);
  }

  function handleUpdatePageTemplate(templateName) {
    setTemplate(templateName);
    
    // Wenn Template gewählt wurde, generiere Default-Props für Seiten-Daten
    if (templateName && templateCodes[templateName]) {
      const defaultProps = generateDefaultProps(templateCodes[templateName]);
      // Merge mit existierenden Seiten-Daten
      setPageData({ ...defaultProps, ...pageData });
    }
  }

  function handleUpdatePageData(updates) {
    // Tiefes Merge für verschachtelte Objekte
    const deepMerge = (target, source) => {
      const result = { ...target };
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    };
    
    setPageData(deepMerge(pageData, updates));
  }

  function handleDeleteBlock(index) {
    setBlocks(blocks.filter((_, i) => i !== index));
  }

  function handleSave() {
    const updatedPage = {
      ...page,
      title,
      slug: slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      template,
      blocks,
      data: pageData
    };
    onSave && onSave(updatedPage, {});
  }

  function handleSaveAndClose() {
    handleSave({ close: true });
  }

  function handleSaveAndView() {
    handleSave({ view: true });
  }

  return (
    <div className="page-editor">
      <h2>Seite bearbeiten</h2>
      
      <div className="field-group">
        <label className="field-label">Titel</label>
        <input 
          type="text" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          placeholder="Seitentitel"
          className="input-field"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Slug (URL)</label>
        <input 
          type="text" 
          value={slug} 
          onChange={e => setSlug(e.target.value)}
          placeholder="seiten-url"
          className="input-field"
        />
        <small className="url-hint">URL: /{slug || 'seiten-url'}</small>
      </div>

      {/* Seiten-Template Auswahl */}
      <div className="field-group">
        <label className="field-label">Seiten-Template (Optional)</label>
        <select 
          value={template} 
          onChange={e => handleUpdatePageTemplate(e.target.value)}
          className="input-field"
        >
          <option value="">-- Kein Template (nur Blöcke) --</option>
          {templates.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <small className="url-hint">
          Wähle ein Template für das Gesamtlayout der Seite. Blöcke werden an {'{{blocks}}'} eingefügt.
        </small>
      </div>

      <div className="hidden-section">
        {/* Template-spezifische Felder */}
        {template && templateCodes[template] && (
          <div className="page-data-section">
            <h4 style={{ marginBottom: 10, fontSize: '0.95rem' }}>Template-Daten für "{template}"</h4>
            {extractTemplateVariables(templateCodes[template]).map(varName => {
              const inputType = guessInputType(varName);
              
              // Verschachtelte Felder behandeln (z.B. "button.url")
              const isNested = varName.includes('.');
              let value = '';
              
              if (isNested) {
                const parts = varName.split('.');
                let current = pageData;
                for (const part of parts) {
                  if (current && current[part] !== undefined) {
                    current = current[part];
                  } else {
                    current = '';
                    break;
                  }
                }
                value = current;
              } else {
                value = pageData[varName] || '';
              }
              
              // Funktion zum Aktualisieren verschachtelter Werte
              const handleNestedUpdate = (newValue) => {
                if (isNested) {
                  const parts = varName.split('.');
                  const updated = { ...pageData };
                  let current = updated;
                  
                  for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (!current[part] || typeof current[part] !== 'object') {
                      current[part] = {};
                    }
                    current = current[part];
                  }
                  
                  current[parts[parts.length - 1]] = newValue;
                  handleUpdatePageData(updated);
                } else {
                  handleUpdatePageData({ [varName]: newValue });
                }
              };
              
              if (inputType === 'textarea') {
                return (
                  <div key={varName} style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', fontWeight: 'bold' }}>{varName}</label>
                    <textarea 
                      placeholder={varName}
                      value={value}
                      onChange={e => handleNestedUpdate(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, resize: 'vertical', fontSize: '0.9rem' }}
                    />
                  </div>
                );
              }
              
              if (inputType === 'array') {
                return (
                  <div key={varName} style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', fontWeight: 'bold' }}>{varName} (Array)</label>
                    <textarea 
                      placeholder="Ein Wert pro Zeile"
                      value={Array.isArray(value) ? value.join('\n') : ''}
                      onChange={e => handleNestedUpdate(e.target.value.split('\n').filter(v => v.trim()))}
                      rows={3}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, resize: 'vertical', fontSize: '0.9rem' }}
                    />
                  </div>
                );
              }
              
              return (
                <div key={varName} style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', fontWeight: 'bold' }}>{varName}</label>
                  <input 
                    type={inputType === 'number' ? 'number' : 'text'}
                    placeholder={varName}
                    value={value}
                    onChange={e => handleNestedUpdate(e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, fontSize: '0.9rem' }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h3 className="blocks-title">Blöcke (Drag & Drop zum Sortieren)</h3>

      <div className="blocks-container">


        {blocks.map((block, idx) => {
          // Rendere Preview
          let previewHtml = '';
          if (block.template && templateCodes[block.template]) {
            try {
              previewHtml = renderTemplate(templateCodes[block.template], block.props);
            } catch (e) {
              previewHtml = '<div style="color: #d32f2f; padding: 10px;">Vorschau-Fehler</div>';
            }
          }

          return (
          <div 
            key={idx} 
            className="block-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('blockIndex', idx);
              e.currentTarget.style.opacity = '0.4';
            }}
            onDragEnd={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = 'transparent';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'transparent';
              const fromIndex = parseInt(e.dataTransfer.getData('blockIndex'));
              const toIndex = idx;
              if (fromIndex !== toIndex) {
                const newBlocks = [...blocks];
                const [moved] = newBlocks.splice(fromIndex, 1);
                newBlocks.splice(toIndex, 0, moved);
                setBlocks(newBlocks);
              }
            }}
            style={{ cursor: 'move', border: '2px solid transparent', transition: 'all 0.2s' }}
          >
            <div className="block-header">
              <GripVertical size={16} style={{ color: '#999', marginRight: '0.5rem' }} />
              <strong>Block {idx + 1}: {block.type}</strong>
              <button className="icon-btn delete" onClick={() => handleDeleteBlock(idx)}>
                <X size={16} />
              </button>
            </div>

            <div className="block-grid">
              {/* Linke Spalte: Eingabefelder */}
              <div>
                <div className="template-select-group">
                  <label className="preview-label">Block-Template</label>
                  <select 
                    value={block.template || ''} 
                    onChange={e => handleUpdateBlockTemplate(idx, e.target.value)}
                    className="input-field-small"
                  >
                    <option value="">-- Kein Template --</option>
                    {templates.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Dynamische Felder basierend auf Template */}
                {block.template && templateCodes[block.template] && (
              <div>
                {extractTemplateVariables(templateCodes[block.template]).map(varName => {
                  const inputType = guessInputType(varName);
                  const value = block.props[varName] || '';
                  
                  if (inputType === 'textarea') {
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{varName}</label>
                        <textarea 
                          placeholder={varName}
                          value={value}
                          onChange={e => handleUpdateBlock(idx, { [varName]: e.target.value })}
                          rows={3}
                          className="textarea-field"
                        />
                      </div>
                    );
                  }
                  
                  if (inputType === 'array') {
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{varName} (Array - ein Wert pro Zeile)</label>
                        <textarea 
                          placeholder="Ein Wert pro Zeile"
                          value={Array.isArray(value) ? value.join('\n') : ''}
                          onChange={e => handleUpdateBlock(idx, { [varName]: e.target.value.split('\n').filter(v => v.trim()) })}
                          rows={3}
                          className="textarea-field"
                        />
                      </div>
                    );
                  }
                  
                  return (
                    <div key={varName} className="field-item">
                      <label className="field-label-xs">{varName}</label>
                      <input 
                        type={inputType === 'number' ? 'number' : 'text'}
                        placeholder={varName}
                        value={value}
                        onChange={e => handleUpdateBlock(idx, { [varName]: e.target.value })}
                        className="input-field-small"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fallback: Standard-Felder wenn kein Template */}
            {!block.template && block.type === 'text' && (
              <>
                <input 
                  type="text" 
                  placeholder="Titel" 
                  value={block.props.title || ''} 
                  onChange={e => handleUpdateBlock(idx, { title: e.target.value })}
                  className="input-field-small"
                  style={{ marginBottom: 8 }}
                />
                <textarea 
                  placeholder="Inhalt" 
                  value={block.props.content || ''} 
                  onChange={e => handleUpdateBlock(idx, { content: e.target.value })}
                  rows={4}
                  className="textarea-field"
                />
              </>
            )}

            {!block.template && block.type === 'gallery' && (
              <div>
                <button 
                  className="primary" 
                  onClick={() => {
                    const url = prompt('Bild-URL:');
                    if (url) {
                      const images = [...(block.props.images || []), { src: url, alt: 'Bild' }];
                      handleUpdateBlock(idx, { images });
                    }
                  }}
                  style={{ marginBottom: 10 }}
                >
                  + Bild hinzufügen
                </button>
                <div className="gallery-images">
                  {(block.props.images || []).map((img, imgIdx) => (
                    <div key={imgIdx} className="gallery-image-wrapper">
                      <img src={img.src} alt={img.alt} className="gallery-image" />
                      <button 
                        onClick={() => {
                          const images = block.props.images.filter((_, i) => i !== imgIdx);
                          handleUpdateBlock(idx, { images });
                        }}
                        className="gallery-delete-btn"
                      >
                        ✖
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </div>

              {/* Rechte Spalte: Live-Vorschau */}
              <div>
                <label className="preview-label">Live-Vorschau</label>
                <div className="preview-container">
                  {previewHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  ) : (
                    <div className="preview-placeholder">
                      Wähle ein Template, um die Vorschau zu sehen
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Fixierte untere Aktionsleiste */}
      <div className="action-bar">
        <button 
          type="button"
          className="primary" 
          onClick={() => handleAddBlock('content')}
        >
          + Neuen Block hinzufügen
        </button>
        
        <div className="action-bar-right">
          <button type="button" className="primary" onClick={handleSave}>Speichern</button>
          <button type="button" className="primary" onClick={handleSaveAndClose}>Speichern und schließen</button>
          <button type="button" className="primary" onClick={handleSaveAndView}>Speichern und anzeigen</button>
          <button type="button" className="icon-btn" onClick={onCancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
