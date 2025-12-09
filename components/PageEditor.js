import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import { GripVertical, X, Layout, Grid } from 'lucide-react';
import { extractTemplateVariables, extractSnippetLabels, guessInputType, generateDefaultProps } from '../lib/templateParser';
import { renderTemplate } from '../lib/templateEngine';

export default function PageEditor({ page, templates, onSave, onCancel, allPages }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [pageData, setPageData] = useState({});
  const [templateCodes, setTemplateCodes] = useState({});
  const [snippetLabels, setSnippetLabels] = useState({});
  const [redirectType, setRedirectType] = useState('none');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [isHomepage, setIsHomepage] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileModalCallback, setFileModalCallback] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  // templates is expected to be an array of objects { name, type }
  const templateObjs = Array.isArray(templates) ? templates : [];
  const templateNames = templateObjs.map(t => t.name);
  const siteTemplateNames = templateObjs.filter(t => String(t.type).toUpperCase() === 'SITE').map(t => t.name);
  const blockTemplateNames = templateObjs.filter(t => String(t.type).toUpperCase() === 'BLOCK').map(t => t.name);

  useEffect(() => {
    if (page) {
      setTitle(page.title || '');
      setSlug(page.slug || '');
      setTemplate(page.template || '');
      setBlocks(page.blocks || []);
      setPageData(page.data || {});
      setRedirectType(page.redirectType || 'none');
      setRedirectUrl(page.redirectUrl || '');
      setIsHomepage(page.isHomepage || false);
    }
  }, [page]);

  useEffect(() => {
    // Lade Template-Codes für alle Templates
    const loadTemplateCodes = async () => {
      const codes = {};
      const labels = {};
      for (const tmplName of templateNames) {
        try {
          const res = await fetch(`/api/templates?name=${encodeURIComponent(tmplName)}`);
          if (res.ok) {
            const data = await res.json();
            codes[tmplName] = data.code;
            // Extrahiere auch die Snippet-Labels
            labels[tmplName] = extractSnippetLabels(data.code);
          }
        } catch (e) {
          console.error('Template laden fehlgeschlagen:', e);
        }
      }
      setTemplateCodes(codes);
      setSnippetLabels(labels);
    };
    if (templateNames.length > 0) {
      loadTemplateCodes();
    }
  }, [templates]);

  useEffect(() => {
    // Lade hochgeladene Dateien
    const loadFiles = async () => {
      try {
        const res = await fetch('/api/files');
        if (res.ok) {
          const data = await res.json();
          setUploadedFiles(data.files || []);
        }
      } catch (e) {
        console.error('Dateien laden fehlgeschlagen:', e);
      }
    };
    loadFiles();
  }, []);

  // Prüfe ob Variable einen URL-Bezug hat
  const isUrlVariable = (varName) => {
    return /url/i.test(varName);
  };

  // Entfernt HTML-Tags aus einem String
  const stripTags = (s) => {
    if (!s) return '';
    try {
      return String(s).replace(/<[^>]*>/g, '');
    } catch (e) {
      return String(s);
    }
  };

  const openFileModal = (callback) => {
    setFileModalCallback(() => callback);
    setShowFileModal(true);
  };

  const selectFile = (fileUrl) => {
    if (fileModalCallback) {
      fileModalCallback(fileUrl);
    }
    setShowFileModal(false);
    setFileModalCallback(null);
  };

  const getFilePreview = (file) => {
    if (!file || !file.filename) return '📎';

    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.filename);
    if (isImage) {
      return file.url;
    }
    // Fallback icons für andere Dateitypen
    const ext = file.filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['zip', 'rar'].includes(ext)) return '📦';
    if (['mp4', 'mov', 'avi'].includes(ext)) return '🎬';
    return '📎';
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/files', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const error = await res.json();
          console.error('Upload-Fehler:', error);
          alert(`Fehler beim Hochladen von ${file.name}: ${error.error || 'Unbekannter Fehler'}`);
          continue;
        }

        const result = await res.json();
        console.log('Datei hochgeladen:', result);
      } catch (error) {
        console.error('Upload-Fehler:', error);
        alert(`Fehler beim Hochladen von ${file.name}`);
      }
    }

    // Dateien neu laden
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setUploadedFiles(data.files || []);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Dateien:', error);
    }

    setUploading(false);
    e.target.value = ''; // Reset input
  };

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
    // support both numeric index (top-level) and path strings like '2.1.0'
    if (typeof index === 'string') {
      const parts = index.split('.').map(p => parseInt(p, 10));
      const copy = JSON.parse(JSON.stringify(blocks || []));
      if (parts.length === 1) {
        copy.splice(parts[0], 1);
        setBlocks(copy);
        return;
      }
      let cur = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur[parts[i]].children = cur[parts[i]].children || [];
      }
      cur.splice(parts[parts.length - 1], 1);
      setBlocks(copy);
      return;
    }
    setBlocks(blocks.filter((_, i) => i !== index));
  }

  // Nested block helpers: operate on nested `blocks` structure by path (e.g. '0', '1.2')
  const addNestedBlock = (path, type = 'content', asChild = false) => {
    const newBlock = {
      type,
      template: '',
      props: type === 'text' ? { title: '', content: '' } : {}
    };
    const copy = JSON.parse(JSON.stringify(blocks || []));
    if (!path) {
      copy.push(newBlock);
      setBlocks(copy);
      return;
    }
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        if (asChild) {
          cur[idx].children = cur[idx].children || [];
          cur[idx].children.push(newBlock);
        } else {
          // insert sibling after
          cur.splice(idx + 1, 0, newBlock);
        }
      } else {
        cur = cur[idx].children = cur[idx].children || [];
      }
    }
    setBlocks(copy);
  }

  const updateNestedBlock = (path, updates) => {
    // Avoid updating state if props would be unchanged (prevents render loops)
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    const copy = JSON.parse(JSON.stringify(blocks || []));
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        const existing = cur[idx].props || {};
        const merged = { ...(existing || {}), ...updates };
        // shallow compare keys in updates — if nothing would change, skip setBlocks
        let changed = false;
        for (const k of Object.keys(updates || {})) {
          const a = existing ? existing[k] : undefined;
          const b = merged[k];
          if (a === undefined && b !== undefined) { changed = true; break }
          // simple equality check for primitive/string/number; for objects/arrays do JSON compare
          if (typeof a === 'object' || typeof b === 'object') {
            try {
              if (JSON.stringify(a) !== JSON.stringify(b)) { changed = true; break }
            } catch (e) { changed = true; break }
          } else if (a !== b) { changed = true; break }
        }
        if (!changed) return;
        cur[idx].props = merged;
      } else {
        cur = cur[idx].children = cur[idx].children || [];
      }
    }
    setBlocks(copy);
  }

  // Update template for a nested block (set template and merge default props)
  const updateNestedBlockTemplate = (path, templateName) => {
    const copy = JSON.parse(JSON.stringify(blocks || []));
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        cur[idx].template = templateName || '';
        if (templateName && templateCodes && templateCodes[templateName]) {
          try {
            const defaultProps = generateDefaultProps(templateCodes[templateName]);
            cur[idx].props = { ...defaultProps, ...(cur[idx].props || {}) };
          } catch (e) {
            // ignore default prop generation errors
          }
        }
      } else {
        cur = cur[idx].children = cur[idx].children || [];
      }
    }
    setBlocks(copy);
  }

  function handleSave(options = {}) {
    // Prüfe ob bereits eine andere 404-Seite existiert
    if (redirectType === '404' && allPages) {
      const find404Page = (nodes) => {
        for (const node of nodes) {
          if (node.id !== page.id && node.redirectType === '404') return node;
          if (node.children && node.children.length > 0) {
            const found = find404Page(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      const existing404 = find404Page(allPages);
      if (existing404) {
        showToast?.(`Es existiert bereits eine 404-Seite: "${existing404.title}". Es kann nur eine 404-Seite pro Website geben.`, 'error');
        return;
      }
    }

    const updatedPage = {
      ...page,
      title,
      slug: slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      template,
      blocks,
      data: pageData,
      redirectType,
      redirectUrl: redirectType !== 'none' ? redirectUrl : undefined,
      isHomepage
    };
    onSave && onSave(updatedPage, options);
  }

  function handleSaveAndClose() {
    handleSave({ close: true });
  }

  function handleSaveAndView() {
    handleSave({ view: true });
  }

  // Render helpers for nested block editor
  const renderBlockEditor = (block, path, depth = 0) => {
    const isTop = depth === 0;
    const idx = path;
    const previewHtml = (block.template && templateCodes[block.template]) ? (() => { try { return renderTemplate(templateCodes[block.template], block.props) } catch (e) { return '<div style="color: #d32f2f; padding: 10px;">Vorschau-Fehler</div>' } })() : '';

    const containerProps = isTop ? {
      onDragOver: (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '#667eea';
        e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.02)';
      },
      onDragLeave: (e) => { 
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.backgroundColor = 'white';
      },
      onDrop: (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.backgroundColor = 'white';
        const fromPath = e.dataTransfer.getData('blockPath');
        const toPath = path;
        if (!fromPath) return;
        // Only support top-level move via drag-drop (both should be single-index paths)
        if (fromPath.indexOf('.') === -1 && String(toPath).indexOf('.') === -1) {
          const fromIndex = parseInt(fromPath, 10);
          const toIndex = parseInt(toPath, 10);
          if (!isNaN(fromIndex) && !isNaN(toIndex) && fromIndex !== toIndex) {
            const newBlocks = [...blocks];
            const [moved] = newBlocks.splice(fromIndex, 1);
            newBlocks.splice(toIndex, 0, moved);
            setBlocks(newBlocks);
          }
        }
      }
    } : {};

    const handleGripDragStart = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('blockPath', String(path));
      e.currentTarget.parentElement.parentElement.style.opacity = '0.5';
    };

    const handleGripDragEnd = (e) => {
      e.currentTarget.parentElement.parentElement.style.opacity = '1';
    };

    return (
      <div key={path} className="block-item" style={{ cursor: 'default', border: '2px solid transparent', transition: 'all 0.2s', marginLeft: depth * 16, marginBottom: 16, borderRadius: 8, backgroundColor: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }} {...containerProps}>
        {/* Block Header */}
        <div className="block-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isTop ? (
              <div
                draggable
                onDragStart={handleGripDragStart}
                onDragEnd={handleGripDragEnd}
                style={{ 
                  cursor: 'grab',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <GripVertical size={18} style={{ color: '#667eea', pointerEvents: 'none' }} />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
              <Grid size={16} style={{ color: '#667eea' }} />
              <select
                value={block.template || ''}
                onChange={e => updateNestedBlockTemplate(path, e.target.value)}
                className="input-field-small"
                style={{ fontSize: '0.95rem', backgroundColor: 'white', borderRadius: 6, border: '1px solid #ddd', padding: '6px 10px' }}
              >
                <option value="">-- Kein Template --</option>
                {blockTemplateNames.map(tn => (
                  <option key={tn} value={tn}>{tn}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-modern-small" onClick={() => addNestedBlock(path, 'content', true)} title="Kind-Block hinzufügen">👶 Kind</button>
            <button className="btn-modern-small" onClick={() => addNestedBlock(path, 'content', false)} title="Sibling-Block hinzufügen">👥 Sibling</button>
            <button className="icon-btn delete" onClick={() => handleDeleteBlock(path)} style={{ padding: '6px 10px', color: '#d32f2f' }}><X size={16} /></button>
          </div>
        </div>

        {/* Block Content */}
        <div style={{ padding: '16px' }}>
          {/* Anchor ID field - Modern Design */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f4ff', borderRadius: 8, border: '1px solid #e3ebff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '18px' }}>🔗</span>
              <label style={{ fontWeight: '600', color: '#333', margin: 0 }}>Anchor ID</label>
              <span style={{ fontSize: '11px', backgroundColor: '#dce6ff', color: '#667eea', padding: '2px 8px', borderRadius: 12, fontWeight: 500 }}>optional</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="z. B. section-intro" 
                value={block.props && block.props.anchorId ? block.props.anchorId : ''} 
                onChange={e => updateNestedBlock(path, { anchorId: e.target.value })} 
                className="input-field-small" 
                style={{ flex: 1, borderRadius: 6, border: '1px solid #ddd', padding: '8px 12px', fontSize: '0.9rem' }} 
              />
              <button 
                type="button" 
                className="btn-modern-small" 
                onClick={() => {
                  let gen = '';
                  if (block.props && block.props.headingText) gen = block.props.headingText;
                  else if (block.props && block.props.title) gen = block.props.title;
                  else {
                    for (let i = 1; i <= 5; i++) {
                      if (block.props && block.props[`h${i}`]) { gen = block.props[`h${i}`]; break; }
                    }
                  }
                  if (gen) {
                    const id = String(gen).toLowerCase().trim().replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
                    updateNestedBlock(path, { anchorId: id });
                  } else {
                    alert('Kein geeigneter Text zum Generieren gefunden (heading/title)');
                  }
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                ✨ Generieren
              </button>
            </div>
            <small style={{ display: 'block', marginTop: 6, color: '#666', fontSize: '12px' }}>Wird für Anker-Links verwendet (#section-intro)</small>
          </div>

          {/* Template specific fields (reuse existing logic) */}
          {block.template && templateCodes[block.template] && (
            <div>
              {/* Grid layout for non-textarea fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                {extractTemplateVariables(templateCodes[block.template])
                  .filter(varName => guessInputType(varName) !== 'textarea')
                  .map(varName => {
                    const inputType = guessInputType(varName);
                    const value = block.props[varName] || '';
                    const label = snippetLabels[block.template]?.[varName] || varName;
                    
                    if (isUrlVariable(varName)) {
                      return (
                        <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                          <label className="field-label-xs" style={{ color: '#333', fontWeight: '600' }}>🔗 {label}</label>
                          <div style={{ display: 'flex', gap: '6px', marginTop: 6, flexDirection: 'column' }}>
                            <input type="text" placeholder="URL oder Dateipfad" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small" style={{ flex: 1, borderRadius: 6, border: '1px solid #ddd', padding: '8px' }} />
                            <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small" style={{ whiteSpace: 'nowrap', width: '100%' }}>📁 Datei</button>
                          </div>
                        </div>
                      )
                    }

                    // Special handling for heading variables
                    if (varName.toLowerCase() === 'heading' || varName.toLowerCase().endsWith('heading')) {
                      const textValue = block.props[`${varName}Text`] || (block.props[varName] ? stripTags(block.props[varName]) : '');
                      const levelValue = block.props[`${varName}Level`] || 'h2';

                      const applyHeading = (newText, newLevel) => {
                        const lv = newLevel || levelValue;
                        const rawText = newText !== undefined ? newText : textValue;
                        const tx = stripTags(rawText);
                        const updatedProps = { ...(block.props || {}) };
                        updatedProps[`${varName}Text`] = tx;
                        updatedProps[`${varName}Level`] = lv;
                        updatedProps[varName] = `<${lv}>${tx}</${lv}>`;
                        updateNestedBlock(path, updatedProps);
                      };

                      return (
                        <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                          <label className="field-label-xs" style={{ color: '#333', fontWeight: '600' }}>📝 {label}</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6, flexDirection: 'column' }}>
                            <select value={levelValue} onChange={e => applyHeading(undefined, e.target.value)} className="input-field-small" style={{ width: '100%', borderRadius: 6, border: '1px solid #ddd', padding: '6px' }}>
                              <option value="h1">H1</option>
                              <option value="h2">H2</option>
                              <option value="h3">H3</option>
                              <option value="h4">H4</option>
                              <option value="h5">H5</option>
                            </select>
                            <input type="text" placeholder="Heading text" value={textValue} onChange={e => applyHeading(e.target.value, undefined)} className="input-field-small" style={{ width: '100%', borderRadius: 6, border: '1px solid #ddd', padding: '6px 10px' }} />
                          </div>
                        </div>
                      )
                    }

                    if (inputType === 'array') {
                      const arrayLabel = snippetLabels[block.template]?.[varName] || varName;
                      return (
                        <div key={varName} className="field-item" style={{ gridColumn: 'span 1', padding: 12, backgroundColor: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                          <label className="field-label-xs" style={{ color: '#333', fontWeight: '600' }}>📋 {arrayLabel}</label>
                          <textarea placeholder="Ein Wert pro Zeile" value={Array.isArray(value) ? value.join('\n') : ''} onChange={e => updateNestedBlock(path, { [varName]: e.target.value.split('\n').filter(v => v.trim()) })} rows={2} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', fontSize: '0.9rem', fontFamily: 'monospace', marginTop: 6 }} />
                        </div>
                      )
                    }

                    // Default text/number input
                    const defaultLabel = snippetLabels[block.template]?.[varName] || varName;
                    return (
                      <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                        <label className="field-label-xs" style={{ color: '#333', fontWeight: '600' }}>📌 {defaultLabel}</label>
                        <input type={inputType === 'number' ? 'number' : 'text'} placeholder={varName} value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', marginTop: 6 }} />
                      </div>
                    )
                  })}
              </div>

              {/* Separate textarea fields (full width) - NACH dem Grid */}
              {extractTemplateVariables(templateCodes[block.template])
                .filter(varName => guessInputType(varName) === 'textarea')
                .map(varName => {
                  const value = block.props[varName] || '';
                  const label = snippetLabels[block.template]?.[varName] || varName;
                  return (
                    <div key={varName} className="field-item" style={{ marginBottom: 12 }}>
                      <label className="field-label-xs" style={{ color: '#333', fontWeight: '600' }}>✏️ {label}</label>
                      <div style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden', marginTop: 6 }}>
                        <ReactQuill value={value || ''} onChange={(val) => updateNestedBlock(path, { [varName]: val })} theme="snow" />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Fallback simple text/gallery editors when no template */}
          {!block.template && block.type === 'text' && (
            <>
              <input type="text" placeholder="Titel" value={block.props.title || ''} onChange={e => updateNestedBlock(path, { title: e.target.value })} className="input-field-small" style={{ marginBottom: 8, borderRadius: 6, border: '1px solid #ddd', padding: '8px', width: '100%' }} />
              <div style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
                <ReactQuill value={block.props.content || ''} onChange={(val) => updateNestedBlock(path, { content: val })} theme="snow" />
              </div>
            </>
          )}

          {!block.template && block.type === 'gallery' && (
            <div>
              <button className="btn-modern" onClick={() => {
                const url = prompt('Bild-URL:'); if (url) { const images = [...(block.props.images || []), { src: url, alt: 'Bild' }]; updateNestedBlock(path, { images }); }
              }} style={{ marginBottom: 10 }}>➕ Bild hinzufügen</button>
              <div className="gallery-images">{(block.props.images || []).map((img, imgIdx) => (
                <div key={imgIdx} className="gallery-image-wrapper">
                  <img src={img.src} alt={img.alt} className="gallery-image" />
                  <button onClick={() => { const images = block.props.images.filter((_, i) => i !== imgIdx); updateNestedBlock(path, { images }); }} className="gallery-delete-btn">✖</button>
                </div>
              ))}</div>
            </div>
          )}

          {/* Render children editors recursively */}
          {(block.children || []).map((child, i) => renderBlockEditor(child, `${path}.${i}`, depth + 1))}
        </div>
      </div>
    )
  }

  const renderBlocksList = () => {
    return (blocks || []).map((b, i) => renderBlockEditor(b, String(i), 0))
  }

  return (
    <div className="page-editor">

      {/* Tab Navigation */}
      <div className="tabs-container" style={{
        display: 'flex',
        gap: '0',
        borderBottom: '2px solid #e0e0e0',
        marginBottom: '20px',
        backgroundColor: '#f8f8f8'
      }}>
        <button
          onClick={() => setActiveTab('info')}
          className={activeTab === 'info' ? 'tab-active' : 'tab-inactive'}
          style={{
            padding: '12px 20px',
            border: 'none',
            backgroundColor: activeTab === 'info' ? 'white' : 'transparent',
            borderBottom: activeTab === 'info' ? '3px solid #667eea' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'info' ? 'bold' : 'normal',
            color: activeTab === 'info' ? '#667eea' : '#666',
            transition: 'all 0.3s ease'
          }}
        >
          ℹ️ Seiten-Informationen
        </button>
        <button
          onClick={() => setActiveTab('blocks')}
          className={activeTab === 'blocks' ? 'tab-active' : 'tab-inactive'}
          style={{
            padding: '12px 20px',
            border: 'none',
            backgroundColor: activeTab === 'blocks' ? 'white' : 'transparent',
            borderBottom: activeTab === 'blocks' ? '3px solid #667eea' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'blocks' ? 'bold' : 'normal',
            color: activeTab === 'blocks' ? '#667eea' : '#666',
            transition: 'all 0.3s ease'
          }}
        >
          📦 Blöcke
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="tab-content info-tab">
          <div className="field-group">

            <h2>Seiten-Informationen</h2>

            {/* Grid Layout für wichtige Felder */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {/* Titel */}
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label">📄 Titel</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Seitentitel"
                  className="input-field"
                />
              </div>

              {/* Slug */}
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label">🔗 Slug (URL)</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  placeholder="seiten-url"
                  className="input-field"
                />
                <small className="url-hint">URL: /{slug || 'seiten-url'}</small>
              </div>
            </div>

            {/* Startseite setzen */}
            <div className="field-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isHomepage}
                  onChange={e => setIsHomepage(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>🏠 Als Startseite festlegen</span>
              </label>
              <small className="url-hint">Diese Seite wird als Standard-Startseite verwendet, wenn keine Slug eingegeben wird.</small>
            </div>

            {/* Weiterleitungsoptionen */}
            <div className="field-group">
              <label className="field-label">Weiterleitung</label>
              <select
                value={redirectType}
                onChange={e => setRedirectType(e.target.value)}
                className="input-field"
              >
                <option value="none">Keine Weiterleitung</option>
                <option value="404">404 - Seite nicht gefunden</option>
                <option value="503">503 - Service nicht verfügbar</option>
                <option value="external">Externe URL</option>
              </select>
            </div>

            {redirectType === 'external' && (
              <div className="field-group">
                <label className="field-label">Externe URL</label>
                <input
                  type="url"
                  value={redirectUrl}
                  onChange={e => setRedirectUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="input-field"
                />
                <small className="url-hint">Vollständige URL mit http:// oder https://</small>
              </div>
            )}

            {/* Seiten-Template Auswahl */}
            <div className="field-group">
              <label className="field-label">Seiten-Template (Optional)</label>
              <select
                value={template}
                onChange={e => handleUpdatePageTemplate(e.target.value)}
                className="input-field"
              >
                <option value="">-- Kein Template (nur Blöcke) --</option>
                {siteTemplateNames.map(tn => (
                  <option key={tn} value={tn}>{tn}</option>
                ))}
              </select>
              {template ? (
                <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {siteTemplateNames.includes(template) ? <Layout size={14} /> : <Grid size={14} />}
                  <small style={{ color: 'var(--text-secondary)' }}>{siteTemplateNames.includes(template) ? 'Site' : 'Block'}</small>
                </span>
              ) : null}
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

                    // URL-Felder: Zeige Dateiauswahl
                    if (isUrlVariable(varName)) {
                      return (
                        <div key={varName} style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', fontWeight: 'bold' }}>{varName}</label>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <input
                              type="text"
                              placeholder="URL oder Dateipfad"
                              value={value}
                              onChange={e => handleNestedUpdate(e.target.value)}
                              style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 4, fontSize: '0.9rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => openFileModal(handleNestedUpdate)}
                              style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              📁 Datei wählen
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (inputType === 'textarea') {
                      return (
                        <div key={varName} style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', fontWeight: 'bold' }}>{varName}</label>
                          <div style={{ border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
                            <ReactQuill
                              value={value || ''}
                              onChange={(val) => handleNestedUpdate(val)}
                              theme="snow"
                            />
                          </div>
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

          </div>
        </div>
      )}

      {/* Blöcke Tab */}
      {activeTab === 'blocks' && (
        <div className="tab-content blocks-tab">
          <div className="blocks-container">
            <h3 className="blocks-title">Blöcke (Drag & Drop zum Sortieren)</h3>
            {renderBlocksList()}
          </div>
        </div>
      )}

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

      {/* Datei-Auswahl Modal */}
      {showFileModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: '20px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '2px solid #667eea',
              paddingBottom: '10px'
            }}>
              <h3 style={{ margin: 0, color: '#333' }}>Datei auswählen</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{
                  padding: '8px 16px',
                  background: '#667eea',
                  color: 'white',
                  borderRadius: 4,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: uploading ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}>
                  {uploading ? '⏳ Hochladen...' : '⬆️ Hochladen'}
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    style={{ display: 'none' }}
                  />
                </label>
                <button
                  onClick={() => setShowFileModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#666',
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '15px',
              overflowY: 'auto',
              padding: '10px'
            }}>
              {uploadedFiles.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#999' }}>
                  Keine Dateien hochgeladen
                </div>
              ) : (
                uploadedFiles.map(file => {
                  const filename = file.filename || file.name;
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
                  const preview = isImage ? file.url : getFilePreview(file);

                  return (
                    <div
                      key={file.url}
                      onClick={() => selectFile(file.url)}
                      style={{
                        border: '2px solid #ddd',
                        borderRadius: 8,
                        padding: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                        background: 'white'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = '#667eea';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.2)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#ddd';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        width: '100%',
                        height: '120px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '8px',
                        background: '#f5f5f5',
                        borderRadius: 4,
                        overflow: 'hidden'
                      }}>
                        {isImage ? (
                          <img
                            src={file.url}
                            alt={filename}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain'
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '48px' }}>{preview}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        textAlign: 'center',
                        color: '#333',
                        wordBreak: 'break-word',
                        width: '100%'
                      }}>
                        {filename}
                      </div>
                      {file.size && (
                        <div style={{
                          fontSize: '10px',
                          color: '#999',
                          marginTop: '4px'
                        }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{
              marginTop: '20px',
              paddingTop: '15px',
              borderTop: '1px solid #eee',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowFileModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f5f5f5',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
