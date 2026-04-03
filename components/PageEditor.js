import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import { GripVertical, Grid, Eye, ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { extractTemplateVariables, extractSnippetLabels, guessInputType, generateDefaultProps, extractBlockTargets } from '../lib/templateParser';
import { renderPage } from '../lib/templateEngine';
import Toast from './Toast';
import TemplateStructurePreview from './TemplateStructurePreview';

export default function PageEditor({ page, templates, onSave, onCancel, allPages }) {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [pageData, setPageData] = useState({});
  const [templateCodes, setTemplateCodes] = useState({});
  const [snippetTemplatesByKey, setSnippetTemplatesByKey] = useState({});
  const [snippetLabels, setSnippetLabels] = useState({});
  const [redirectType, setRedirectType] = useState('none');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [isHomepage, setIsHomepage] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileModalCallback, setFileModalCallback] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedBlockPath, setSelectedBlockPath] = useState('');
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [selectedFieldKey, setSelectedFieldKey] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [toast, setToast] = useState(null);
  const blockNodeRefs = useRef({});
  const fieldNodeRefs = useRef({});

  const normalizeSlotName = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  };

  const migrateLegacySlotMapToBlocks = (incomingBlocks = [], incomingData = {}) => {
    if (!Array.isArray(incomingBlocks) || incomingBlocks.length === 0) {
      return { blocks: incomingBlocks, migrated: false };
    }

    const legacyMap = (incomingData && incomingData.blockSlots && typeof incomingData.blockSlots === 'object')
      ? incomingData.blockSlots
      : null;

    if (!legacyMap || Object.keys(legacyMap).length === 0) {
      return { blocks: incomingBlocks, migrated: false };
    }

    const topLevelHasAssignedSlots = incomingBlocks.some((block) => normalizeSlotName(block?.slot));
    if (topLevelHasAssignedSlots) {
      return { blocks: incomingBlocks, migrated: false };
    }

    const migratedBlocks = JSON.parse(JSON.stringify(incomingBlocks));
    const availableByTemplate = {};
    migratedBlocks.forEach((block, index) => {
      const tpl = String((block && (block.template || block.type)) || '').trim();
      if (!tpl) return;
      if (!availableByTemplate[tpl]) availableByTemplate[tpl] = [];
      availableByTemplate[tpl].push(index);
    });

    Object.entries(legacyMap).forEach(([rawSlotName, rawTemplateName]) => {
      const slotName = normalizeSlotName(rawSlotName);
      const templateName = String(rawTemplateName || '').trim();
      if (!slotName || !templateName) return;
      const queue = availableByTemplate[templateName] || [];
      if (queue.length === 0) return;
      const targetIndex = queue.shift();
      if (migratedBlocks[targetIndex]) {
        migratedBlocks[targetIndex].slot = slotName;
      }
    });

    return { blocks: migratedBlocks, migrated: true };
  };

  // templates is expected to be an array of objects { name, type }
  const templateObjs = Array.isArray(templates) ? templates : [];
  const templateNames = templateObjs.map(t => t.name);
  const siteTemplateNames = templateObjs.filter(t => String(t.type).toUpperCase() === 'SITE').map(t => t.name);
  const blockTemplateNames = templateObjs.filter(t => String(t.type).toUpperCase() === 'BLOCK').map(t => t.name);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (page) {
      const initialBlocks = Array.isArray(page.blocks) ? page.blocks : [];
      const migration = migrateLegacySlotMapToBlocks(initialBlocks, page.data || {});
      setTitle(page.title || '');
      setSlug(page.slug || '');
      setTemplate(page.template || '');
      setBlocks(migration.blocks || []);
      setPageData(page.data || {});
      setRedirectType(page.redirectType || 'none');
      setRedirectUrl(page.redirectUrl || '');
      setIsHomepage(page.isHomepage || false);
      setSelectedBlockPath((migration.blocks || []).length > 0 ? '0' : '');
    }
  }, [page]);

  useEffect(() => {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      if (selectedBlockPath !== '') setSelectedBlockPath('');
      if (selectedFieldKey !== '') setSelectedFieldKey('');
      return;
    }

    const getBlockByPath = (path) => {
      if (!path && path !== '0') return null;
      const parts = String(path).split('.').map(p => parseInt(p, 10));
      let cur = blocks;
      for (let i = 0; i < parts.length; i++) {
        const idx = parts[i];
        if (!Array.isArray(cur) || idx < 0 || idx >= cur.length) return null;
        const block = cur[idx];
        if (i === parts.length - 1) return block;
        cur = block.children || [];
      }
      return null;
    };

    if (!selectedBlockPath || !getBlockByPath(selectedBlockPath)) {
      setSelectedBlockPath('0');
      setSelectedFieldKey('');
    }
  }, [blocks, selectedBlockPath, selectedFieldKey]);

  useEffect(() => {
    if (!selectedBlockPath) return;

    if (selectedFieldKey && selectedFieldKey.startsWith(`${selectedBlockPath}::`)) {
      return;
    }

    const target = blockNodeRefs.current[selectedBlockPath];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const focusFirstField = () => {
      const firstInput = target.querySelector('input:not([type="hidden"]), textarea, select, .ql-editor');
      if (!firstInput || typeof firstInput.focus !== 'function') return;
      try {
        firstInput.focus({ preventScroll: true });
      } catch (e) {
        firstInput.focus();
      }
    };

    window.requestAnimationFrame(focusFirstField);
  }, [selectedBlockPath, selectedFieldKey]);

  useEffect(() => {
    if (!selectedFieldKey) return;

    const target = fieldNodeRefs.current[selectedFieldKey];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch (e) {
        target.focus();
      }
    });
  }, [selectedFieldKey]);

  const makeFieldKey = (path, varName) => `${path}::${varName}`;

  const setFieldRef = (path, varName, node) => {
    const key = makeFieldKey(path, varName);
    if (!node) {
      delete fieldNodeRefs.current[key];
      return;
    }

    if (typeof node.matches === 'function' && node.matches('input, textarea, select, [contenteditable="true"]')) {
      fieldNodeRefs.current[key] = node;
      return;
    }

    const focusable = node.querySelector('input:not([type="hidden"]), textarea, select, [contenteditable="true"], .ql-editor');
    if (focusable) {
      fieldNodeRefs.current[key] = focusable;
    }
  };

  useEffect(() => {
    const loadSnippets = async () => {
      try {
        const res = await fetch('/api/snippets');
        if (!res.ok) return;
        const data = await res.json();
        const snippetsByKey = {};
        (data || []).forEach((snippet) => {
          const key = String(snippet?.key || '').trim();
          if (!key) return;
          snippetsByKey[key] = String(snippet?.snippet || '');
        });
        setSnippetTemplatesByKey(snippetsByKey);
      } catch (e) {
        console.error('Snippets laden fehlgeschlagen:', e);
      }
    };

    loadSnippets();
  }, []);

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
            labels[tmplName] = extractSnippetLabels(data.code, snippetTemplatesByKey);
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
  }, [templates, snippetTemplatesByKey]);

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

  const extractBlockSlotNames = (code) => {
    return extractBlockTargets(code).map((target) => target.name);
  };

  const selectedPageTemplateCode = template ? templateCodes[template] : '';
  const pageTemplateSlots = useMemo(() => extractBlockSlotNames(selectedPageTemplateCode), [selectedPageTemplateCode]);
  const firstPageTemplateSlot = pageTemplateSlots[0] || '';
  const selectedTopLevelIndex = useMemo(() => {
    if (!selectedBlockPath) return -1;
    const firstSegment = String(selectedBlockPath).split('.')[0];
    const idx = parseInt(firstSegment, 10);
    if (isNaN(idx) || idx < 0) return -1;
    return idx;
  }, [selectedBlockPath]);
  const selectedTopLevelBlock = selectedTopLevelIndex >= 0 ? (blocks?.[selectedTopLevelIndex] || null) : null;
  const activeSelectedSlot = normalizeSlotName(selectedTopLevelBlock?.slot);
  const slotUsageByName = useMemo(() => {
    const usage = {};
    (blocks || []).forEach((block) => {
      const slotName = normalizeSlotName(block?.slot) || firstPageTemplateSlot;
      if (!slotName) return;
      usage[slotName] = (usage[slotName] || 0) + 1;
    });
    return usage;
  }, [blocks, firstPageTemplateSlot]);

  const templateVariablesByName = useMemo(() => {
    const out = {};
    Object.entries(templateCodes || {}).forEach(([name, code]) => {
      try {
        out[name] = extractTemplateVariables(code, snippetTemplatesByKey) || [];
      } catch (e) {
        out[name] = [];
      }
    });
    return out;
  }, [templateCodes, snippetTemplatesByKey]);

  // Entfernt HTML-Tags aus einem String
  const stripTags = (s) => {
    if (!s) return '';
    try {
      return String(s).replace(/<[^>]*>/g, '');
    } catch (e) {
      return String(s);
    }
  };

  const formatBlockNumber = (path) => String(path).split('.').map(part => Number(part) + 1).join('.');

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
          showToast(`Fehler beim Hochladen von ${file.name}: ${error.error || 'Unbekannter Fehler'}`, 'error');
          continue;
        }

        const result = await res.json();
        console.log('Datei hochgeladen:', result);
      } catch (error) {
        console.error('Upload-Fehler:', error);
        showToast(`Fehler beim Hochladen von ${file.name}`, 'error');
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
    showToast('Dateien erfolgreich aktualisiert', 'success');
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

  function handleUpdatePageTemplate(templateName) {
    setTemplate(templateName);

    // Wenn Template gewählt wurde, generiere Default-Props für Seiten-Daten
    if (templateName && templateCodes[templateName]) {
      const defaultProps = generateDefaultProps(templateCodes[templateName], snippetTemplatesByKey);
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
            const defaultProps = generateDefaultProps(templateCodes[templateName], snippetTemplatesByKey);
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

  const updateNestedBlockSlot = (path, slotName) => {
    const normalized = normalizeSlotName(slotName);
    const copy = JSON.parse(JSON.stringify(blocks || []));
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        if (normalized) {
          cur[idx].slot = normalized;
        } else {
          delete cur[idx].slot;
        }
      } else {
        cur = cur[idx].children = cur[idx].children || [];
      }
    }
    setBlocks(copy);
  }

  const getBlockAtPath = (path) => {
    if (!path && path !== '0') return null;
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    let cur = blocks || [];
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (!Array.isArray(cur) || idx < 0 || idx >= cur.length) return null;
      const block = cur[idx];
      if (i === parts.length - 1) return block;
      cur = block.children || [];
    }
    return null;
  };

  const flattenBlocks = (items = [], prefix = '') => {
    const out = [];
    items.forEach((item, idx) => {
      const path = prefix ? `${prefix}.${idx}` : String(idx);
      out.push({ path, block: item, depth: path.split('.').length - 1 });
      if (Array.isArray(item.children) && item.children.length > 0) {
        out.push(...flattenBlocks(item.children, path));
      }
    });
    return out;
  };

  const getBlockFieldEntries = (block, path) => {
    if (!block || !block.template || !templateCodes[block.template]) return [];
    const vars = templateVariablesByName[block.template] || [];
    return vars.map((varName) => ({
      varName,
      fieldKey: makeFieldKey(path, varName),
      label: snippetLabels[block.template]?.[varName] || varName
    }));
  };

  const flattenedBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);

  const outlineFieldEntries = useMemo(() => (
    flattenedBlocks.flatMap(({ path, block, depth }) =>
      getBlockFieldEntries(block, path).map((entry) => ({ ...entry, path, depth }))
    )
  ), [flattenedBlocks, templateVariablesByName, snippetLabels]);

  function buildPreviewHtml() {
    try {
      // Build a block templates map from the loaded template codes (BLOCK type only)
      const blockTemplatesMap = {};
      const templateObjs2 = Array.isArray(templates) ? templates : [];
      templateObjs2.forEach(t => {
        if (String(t.type || '').toUpperCase() === 'BLOCK' && t.name && templateCodes[t.name]) {
          blockTemplatesMap[t.name] = templateCodes[t.name];
        }
      });

      // Also include all loaded codes as fallback (some pages use type===undefined templates)
      Object.entries(templateCodes || {}).forEach(([name, code]) => {
        if (!blockTemplatesMap[name]) blockTemplatesMap[name] = code;
      });

      const siteTemplateCode = template ? (templateCodes[template] || '') : '';

      const currentPage = {
        title,
        slug,
        template,
        blocks: blocks || [],
        data: pageData || {},
        isHomepage,
      };

      const rendered = renderPage(
        currentPage,
        blockTemplatesMap,
        siteTemplateCode || null,
        allPages || [],
        {},
        {},
        {}
      );

      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title || 'Vorschau'}</title></head><body>${rendered}</body></html>`;
    } catch (e) {
      console.error('buildPreviewHtml failed:', e);
      return `<!DOCTYPE html><html><body><pre style="color:red;padding:16px">${String(e)}</pre></body></html>`;
    }
  }

  function handleTogglePreview() {
    if (!showPreview) {
      setPreviewHtml(buildPreviewHtml());
    }
    setShowPreview(p => !p);
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

    const normalizedPageData = { ...(pageData || {}) };
    delete normalizedPageData.blockSlots;
    delete normalizedPageData.__blockSlots;

    const updatedPage = {
      ...page,
      title,
      slug: slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      template,
      blocks,
      data: normalizedPageData,
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
    const templateVariables = block.template ? (templateVariablesByName[block.template] || []) : [];

    const containerProps = isTop ? {
      onDragOver: (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '#667eea';
        e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.02)';
      },
      onDragLeave: (e) => { 
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
      },
      onDrop: (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
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
      <div
        key={path}
        ref={(el) => {
          if (el) {
            blockNodeRefs.current[path] = el;
          } else {
            delete blockNodeRefs.current[path];
          }
        }}
        data-block-path={path}
        className={`block-item ${selectedBlockPath === path ? 'selected' : ''}`}
        style={{ cursor: 'default', border: selectedBlockPath === path ? '2px solid var(--accent-primary)' : '2px solid transparent', transition: 'all 0.2s', marginLeft: depth * 16, marginBottom: 16, borderRadius: 8, backgroundColor: 'var(--bg-secondary)', boxShadow: selectedBlockPath === path ? '0 0 0 3px rgba(102, 126, 234, 0.12)' : '0 2px 8px var(--shadow)', overflow: 'hidden' }}
        onClick={() => setSelectedBlockPath(path)}
        title={devTitle(`Komponente: Block ${formatBlockNumber(path)}. Funktion: Block auswaehlen und Inhalte bearbeiten.`)}
        {...containerProps}
      >
        {/* Block Header */}
        <div className="block-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isTop ? (
              <div
                draggable
                onDragStart={handleGripDragStart}
                onDragEnd={handleGripDragEnd}
                title={devTitle(`Funktion: Block ${formatBlockNumber(path)} per Drag-and-Drop neu anordnen`)}
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
              <span className="page-block-index">Block {path.split('.').map(part => Number(part) + 1).join('.')}</span>
              <span className="page-block-template-pill">{block.template || 'Freier Block'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isTop && pageTemplateSlots.length > 0 && (
              <select
                value={normalizeSlotName(block.slot)}
                onChange={(e) => updateNestedBlockSlot(path, e.target.value)}
                className="input-field-small"
                style={{ minWidth: 170 }}
                onClick={(e) => e.stopPropagation()}
                title={devTitle(`Feld: Slot-Zuordnung fuer Block ${formatBlockNumber(path)}`)}
                aria-label={`Slot-Zuordnung fuer Block ${formatBlockNumber(path)}`}
              >
                <option value="">-- Kein Slot --</option>
                {pageTemplateSlots.map((slotName) => (
                  <option key={`${path}-slot-${slotName}`} value={slotName}>{slotName}</option>
                ))}
              </select>
            )}
            <small style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {Array.isArray(block.children) ? block.children.length : 0} Kindblöcke
            </small>
          </div>
        </div>

        {/* Block Content */}
        <div style={{ padding: '16px' }}>
          {/* Template specific fields (reuse existing logic) */}
          {block.template && templateCodes[block.template] && (
            <div>
              {/* Grid layout for non-textarea fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                {templateVariables
                  .filter(varName => guessInputType(varName) !== 'textarea')
                  .map(varName => {
                    const inputType = guessInputType(varName);
                    const value = block.props[varName] || '';
                    const label = snippetLabels[block.template]?.[varName] || varName;

                    if (varName.toLowerCase().includes('headinglevel')) {
                      const normalizedLevel = String(value || '2').replace(/^h/i, '');
                      return (
                        <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                          <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>🏷️ {label}</label>
                          <select
                            ref={(el) => setFieldRef(path, varName, el)}
                            value={normalizedLevel}
                            onChange={e => updateNestedBlock(path, { [varName]: e.target.value })}
                            className="input-field-small"
                            style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border-color)', padding: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', marginTop: 6 }}
                          >
                            <option value="1">H1</option>
                            <option value="2">H2</option>
                            <option value="3">H3</option>
                            <option value="4">H4</option>
                            <option value="5">H5</option>
                            <option value="6">H6</option>
                          </select>
                        </div>
                      )
                    }
                    
                    if (isUrlVariable(varName)) {
                      return (
                        <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                          <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>🔗 {label}</label>
                          <div style={{ display: 'flex', gap: '6px', marginTop: 6, flexDirection: 'column' }}>
                            <input ref={(el) => setFieldRef(path, varName, el)} type="text" placeholder="URL oder Dateipfad" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small" style={{ flex: 1, borderRadius: 6, border: '1px solid var(--border-color)', padding: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                            <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small" style={{ whiteSpace: 'nowrap', width: '100%' }} title={devTitle(`Datei fuer Feld ${label} auswaehlen`)} aria-label={`Datei fuer Feld ${label} auswaehlen`}>📁 Datei</button>
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
                        <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                          <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>📝 {label}</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6, flexDirection: 'column' }}>
                            <select ref={(el) => setFieldRef(path, `${varName}Level`, el)} value={levelValue} onChange={e => applyHeading(undefined, e.target.value)} className="input-field-small" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border-color)', padding: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                              <option value="h1">H1</option>
                              <option value="h2">H2</option>
                              <option value="h3">H3</option>
                              <option value="h4">H4</option>
                              <option value="h5">H5</option>
                            </select>
                            <input ref={(el) => setFieldRef(path, `${varName}Text`, el)} type="text" placeholder="Heading text" value={textValue} onChange={e => applyHeading(e.target.value, undefined)} className="input-field-small" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border-color)', padding: '6px 10px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                          </div>
                        </div>
                      )
                    }

                    if (inputType === 'array') {
                      const arrayLabel = snippetLabels[block.template]?.[varName] || varName;
                      return (
                        <div key={varName} className="field-item" style={{ gridColumn: 'span 1', padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                          <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>📋 {arrayLabel}</label>
                          <textarea ref={(el) => setFieldRef(path, varName, el)} placeholder="Ein Wert pro Zeile" value={Array.isArray(value) ? value.join('\n') : ''} onChange={e => updateNestedBlock(path, { [varName]: e.target.value.split('\n').filter(v => v.trim()) })} rows={2} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: 6, resize: 'vertical', fontSize: '0.9rem', fontFamily: 'monospace', marginTop: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                        </div>
                      )
                    }

                    // Default text/number input
                    const defaultLabel = snippetLabels[block.template]?.[varName] || varName;
                    return (
                      <div key={varName} className="field-item" style={{ padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>📌 {defaultLabel}</label>
                        <input ref={(el) => setFieldRef(path, varName, el)} type={inputType === 'number' ? 'number' : 'text'} placeholder={varName} value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: '0.9rem', marginTop: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                      </div>
                    )
                  })}
              </div>

              {/* Separate textarea fields (full width) - NACH dem Grid */}
              {templateVariables
                .filter(varName => guessInputType(varName) === 'textarea')
                .map(varName => {
                  const value = block.props[varName] || '';
                  const label = snippetLabels[block.template]?.[varName] || varName;
                  return (
                    <div key={varName} className="field-item" style={{ marginBottom: 12 }}>
                      <label className="field-label-xs" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>✏️ {label}</label>
                      <div ref={(el) => setFieldRef(path, varName, el)} style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', marginTop: 6, background: 'var(--bg-secondary)' }}>
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
              <input ref={(el) => setFieldRef(path, 'title', el)} type="text" placeholder="Titel" value={block.props.title || ''} onChange={e => updateNestedBlock(path, { title: e.target.value })} className="input-field-small" style={{ marginBottom: 8, borderRadius: 6, border: '1px solid var(--border-color)', padding: '8px', width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              <div ref={(el) => setFieldRef(path, 'content', el)} style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                <ReactQuill value={block.props.content || ''} onChange={(val) => updateNestedBlock(path, { content: val })} theme="snow" />
              </div>
            </>
          )}

          {!block.template && block.type === 'gallery' && (
            <div>
              <button className="btn-modern" onClick={() => {
                const url = prompt('Bild-URL:'); if (url) { const images = [...(block.props.images || []), { src: url, alt: 'Bild' }]; updateNestedBlock(path, { images }); }
              }} style={{ marginBottom: 10 }} title={devTitle('Bild zur Galerie hinzufuegen')} aria-label="Bild zur Galerie hinzufuegen">➕ Bild hinzufügen</button>
              <div className="gallery-images">{(block.props.images || []).map((img, imgIdx) => (
                <div key={imgIdx} className="gallery-image-wrapper">
                  <img src={img.src} alt={img.alt} className="gallery-image" />
                  <button onClick={() => { const images = block.props.images.filter((_, i) => i !== imgIdx); updateNestedBlock(path, { images }); }} className="gallery-delete-btn" title={devTitle(`Bild ${imgIdx + 1} aus Galerie entfernen`)} aria-label={`Bild ${imgIdx + 1} aus Galerie entfernen`}>✖</button>
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

  const assignSelectedTopLevelSlot = (slotName) => {
    let targetIndex = selectedTopLevelIndex;
    if (targetIndex < 0) {
      if (!Array.isArray(blocks) || blocks.length === 0) return;
      targetIndex = 0;
      setSelectedBlockPath('0');
    }
    updateNestedBlockSlot(String(targetIndex), slotName);
    setSelectedFieldKey('');
  };

  const handleStructureBlockClick = (path) => {
    if (!path && path !== '0') return;
    setSelectedBlockPath(String(path));
    setSelectedFieldKey('');
  };

  return (
    <div className="page-editor">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}


      <div className="tab-content blocks-tab">

          <div className="page-editor-workspace">
            <aside className="page-editor-outline" title={devTitle('Bereich: Seiteneinstellungen und Strukturvorschau')}>
              <div className="page-editor-outline-head">
                <span className="page-editor-outline-eyebrow">Aktuelle Seite</span>
                {showDevHints && <div className="page-editor-panel-hint">Bereich: Seiteneinstellungen und Struktur</div>}
                <strong>{title || page?.title || 'Unbenannte Seite'}</strong>
                <span>/{slug || 'seiten-url'}</span>
              </div>

              <div className="page-editor-outline-settings">
                <label className="field-label-xs">Seitentitel</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Seitentitel"
                  className="input-field-small"
                  title={devTitle('Feld: Seitentitel')}
                  aria-label="Seitentitel"
                />

                <label className="field-label-xs">Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  placeholder="seiten-url"
                  className="input-field-small"
                  title={devTitle('Feld: URL-Slug')}
                  aria-label="URL-Slug"
                />

                <label className="field-label-xs">Seiten-Template</label>
                <select
                  value={template}
                  onChange={e => handleUpdatePageTemplate(e.target.value)}
                  className="input-field-small"
                  title={devTitle('Feld: Seiten-Template')}
                  aria-label="Seiten-Template"
                >
                  <option value="">-- Kein Template --</option>
                  {siteTemplateNames.map(tn => (
                    <option key={tn} value={tn}>{tn}</option>
                  ))}
                </select>

                <label className="field-label-xs">Weiterleitung</label>
                <select
                  value={redirectType}
                  onChange={e => setRedirectType(e.target.value)}
                  className="input-field-small"
                  title={devTitle('Feld: Weiterleitungstyp')}
                  aria-label="Weiterleitungstyp"
                >
                  <option value="none">Keine</option>
                  <option value="404">404</option>
                  <option value="503">503</option>
                  <option value="external">Externe URL</option>
                </select>

                {redirectType === 'external' && (
                  <input
                    type="url"
                    value={redirectUrl}
                    onChange={e => setRedirectUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="input-field-small"
                    title={devTitle('Feld: Ziel-URL fuer externe Weiterleitung')}
                    aria-label="Ziel-URL fuer externe Weiterleitung"
                  />
                )}

                <label className="page-editor-outline-toggle" title={devTitle('Option: Diese Seite als Startseite markieren')}>
                  <input
                    type="checkbox"
                    checked={isHomepage}
                    onChange={e => setIsHomepage(e.target.checked)}
                  />
                  Als Startseite
                </label>
              </div>


              <div className="page-editor-outline-structure">
                <div className="page-editor-outline-structure-head">
                  {showDevHints && <div className="page-editor-panel-hint">Komponente: Strukturvorschau, Funktion: Slots und Blöcke zuordnen</div>}
                  <strong>Strukturvorschau</strong>
                  <span>
                    {blocks.length > 0
                      ? 'Klicke auf einen Slot zur Zuweisung oder auf einen Block zum Springen'
                      : 'Lege zuerst einen Block an'}
                  </span>
                </div>

                {!selectedPageTemplateCode ? (
                  <div className="page-editor-outline-empty">Kein Seiten-Template ausgewählt.</div>
                ) : (
                  <TemplateStructurePreview
                    code={selectedPageTemplateCode}
                    blocks={blocks}
                    activeSlot={activeSelectedSlot}
                    activeBlockPath={selectedBlockPath}
                    slotUsage={slotUsageByName}
                    onSlotClick={blocks.length > 0 ? assignSelectedTopLevelSlot : null}
                    onBlockClick={blocks.length > 0 ? handleStructureBlockClick : null}
                    previewClassName="template-wire-preview page-editor-structure-wire"
                  />
                )}

                {pageTemplateSlots.length > 0 && (
                  <div className="page-editor-outline-slot-legend">
                    {pageTemplateSlots.map((slotName) => {
                      const count = slotUsageByName[slotName] || 0;
                      return (
                        <span key={`slot-legend-${slotName}`} className={`page-editor-outline-slot-pill ${count > 0 ? 'mapped' : ''}`}>
                          {slotName} ({count})
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            <div className="page-editor-canvas" title={devTitle('Bereich: Inhaltsbloecke der Seite')}>
              <div className="blocks-container">
                {blocks.length > 0 ? renderBlocksList() : (
                  <div className="page-block-empty-state">
                    <strong>Noch keine Blöcke vorhanden</strong>
                    <p>Füge den ersten Inhaltsblock hinzu, um die Seite modular aufzubauen.</p>
                    <button
                      type="button"
                      className="btn-modern"
                      onClick={() => {
                        handleAddBlock('content');
                        setSelectedBlockPath('0');
                      }}
                      title={devTitle('Ersten Inhaltsblock anlegen')}
                      aria-label="Ersten Inhaltsblock anlegen"
                    >
                      Ersten Block hinzufügen
                    </button>
                  </div>
                )}
              </div>
            </div>

            <aside className="page-editor-inspector" title={devTitle('Bereich: Block-Inspektor fuer Metadaten und Aktionen')}>
              {(() => {
                const toggleSection = (id) => setCollapsedSections(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                });
                const selectedBlock = getBlockAtPath(selectedBlockPath);

                return (
                  <>
                    {/* Inspector Header */}
                    <div className="inspector-header">
                      <div className="inspector-header-left">
                        {showDevHints && <div className="page-editor-panel-hint">Bereich: Block-Inspektor</div>}
                        <span className="inspector-title">Block Inspector</span>
                        <span className="inspector-subtitle">Block-Metadaten</span>
                      </div>
                      {selectedBlock && (
                        <span className="inspector-badge">
                          #{selectedBlockPath.split('.').map(part => Number(part) + 1).join('.')}
                        </span>
                      )}
                    </div>

                    {!selectedBlock ? (
                      <div className="page-editor-inspector-empty">Wähle einen Block in der Mitte oder links aus, um Metadaten zu bearbeiten.</div>
                    ) : (
                      <>
                        {/* Section 1: Metadaten & Konfiguration */}
                        <div className="inspector-section">
                          <button
                            type="button"
                            className="inspector-section-head"
                            onClick={() => toggleSection('meta')}
                            aria-expanded={!collapsedSections.has('meta')}
                          >
                            <span className="inspector-section-icon">⚙</span>
                            <span className="inspector-section-label">Metadaten &amp; Konfiguration</span>
                            {collapsedSections.has('meta') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>

                          {!collapsedSections.has('meta') && (
                            <div className="inspector-section-body">
                              <label className="field-label-xs">Template</label>
                              <select
                                value={selectedBlock.template || ''}
                                onChange={e => updateNestedBlockTemplate(selectedBlockPath, e.target.value)}
                                className="input-field-small"
                                title={devTitle('Feld: Block-Template')}
                                aria-label="Block-Template"
                              >
                                <option value="">-- Kein Template --</option>
                                {blockTemplateNames.map(tn => (
                                  <option key={tn} value={tn}>{tn}</option>
                                ))}
                              </select>

                              {pageTemplateSlots.length > 0 && selectedBlockPath.indexOf('.') === -1 && (
                                <>
                                  <label className="field-label-xs" style={{ marginTop: 8 }}>Slot</label>
                                  <select
                                    value={normalizeSlotName(selectedBlock.slot)}
                                    onChange={e => updateNestedBlockSlot(selectedBlockPath, e.target.value)}
                                    className="input-field-small"
                                    title={devTitle('Feld: Slot fuer den ausgewaehlten Block')}
                                    aria-label="Slot fuer den ausgewaehlten Block"
                                  >
                                    <option value="">-- Kein Slot --</option>
                                    {pageTemplateSlots.map((slotName) => (
                                      <option key={`inspector-slot-${slotName}`} value={slotName}>{slotName}</option>
                                    ))}
                                  </select>
                                </>
                              )}

                              <label className="field-label-xs" style={{ marginTop: 8 }}>Anchor ID</label>
                              <input
                                type="text"
                                className="input-field-small"
                                placeholder="z. B. section-intro"
                                value={selectedBlock.props?.anchorId || ''}
                                onChange={e => updateNestedBlock(selectedBlockPath, { anchorId: e.target.value })}
                                title={devTitle('Feld: Anchor-ID fuer den ausgewaehlten Block')}
                                aria-label="Anchor-ID fuer den ausgewaehlten Block"
                              />
                            </div>
                          )}
                        </div>

                        {/* Section 2: Zugeordnete Felder */}
                        <div className="inspector-section">
                          <button
                            type="button"
                            className="inspector-section-head"
                            onClick={() => toggleSection('fields')}
                            aria-expanded={!collapsedSections.has('fields')}
                          >
                            <span className="inspector-section-icon">▤</span>
                            <span className="inspector-section-label">Zugeordnete Felder</span>
                            {collapsedSections.has('fields') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>

                          {!collapsedSections.has('fields') && (
                            <div className="inspector-section-body">
                              {(() => {
                                const vars = selectedBlock.template ? (templateVariablesByName[selectedBlock.template] || []) : [];
                                if (!selectedBlock.template) {
                                  return <p className="inspector-fields-empty">Kein Template zugeordnet</p>;
                                }
                                if (vars.length === 0) {
                                  return <p className="inspector-fields-empty">Keine Felder erkannt</p>;
                                }
                                return (
                                  <ul className="inspector-field-list">
                                    {vars.map(varName => {
                                      const inputType = guessInputType(varName);
                                      const isTextarea = inputType === 'textarea' || inputType === 'richtext';
                                      const label = (snippetLabels[selectedBlock.template]?.[varName]) || varName;
                                      return (
                                        <li key={varName} className="inspector-field-item">
                                          <span className="inspector-field-icon">{isTextarea ? '≡' : 'T'}</span>
                                          <span className="inspector-field-label">{label}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Block Actions */}
                        <div className="inspector-block-actions">
                          <button type="button" className="inspector-action-btn" onClick={() => addNestedBlock(selectedBlockPath, 'content', true)} title={devTitle('Unterblock anlegen')}>
                            <Plus size={13} /> Kind hinzufügen
                          </button>
                          <button type="button" className="inspector-action-btn" onClick={() => addNestedBlock(selectedBlockPath, 'content', false)} title={devTitle('Sibling-Block anlegen')}>
                            <Plus size={13} /> Sibling hinzufügen
                          </button>
                          <button
                            type="button"
                            className="inspector-action-btn danger"
                            onClick={() => {
                              const currentPath = selectedBlockPath;
                              handleDeleteBlock(currentPath);
                              const segments = currentPath.split('.');
                              setSelectedBlockPath(segments.length > 1 ? segments.slice(0, -1).join('.') : '0');
                            }}
                            title={devTitle('Ausgewaehlten Block loeschen')}
                          >
                            <Trash2 size={13} /> Block löschen
                          </button>
                        </div>
                      </>
                    )}

                    {/* Global Actions */}
                    <div className="inspector-global-actions">
                      <button type="button" className="btn-modern-small green" onClick={handleSave} title={devTitle('Seite speichern')}>Speichern</button>
                      <button
                        type="button"
                        className={`btn-modern-small${showPreview ? ' green' : ' hollow'}`}
                        onClick={handleTogglePreview}
                        title={devTitle('Live-Vorschau ein-/ausblenden')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Eye size={13} /> Vorschau
                      </button>
                      <button
                        type="button"
                        className="btn-modern-small"
                        onClick={() => { const p = String((blocks || []).length); handleAddBlock('content'); setSelectedBlockPath(p); }}
                        title={devTitle('Neuen Top-Level-Block anlegen')}
                      >
                        + Neuer Block
                      </button>
                      <button type="button" className="btn-modern-small green hollow" onClick={handleSaveAndView} title={devTitle('Seite speichern und im Frontend anzeigen')}>Speichern &amp; Anzeigen</button>
                      <button type="button" className="btn-modern-small green hollow" onClick={handleSaveAndClose} title={devTitle('Seite speichern und Editor schliessen')}>Speichern &amp; Schließen</button>
                      <button type="button" className="btn-modern-small red hollow" onClick={onCancel} title={devTitle('Bearbeitung abbrechen')}>Abbrechen</button>
                      <button
                        type="button"
                        className="inspector-sparkle-btn"
                        onClick={handleTogglePreview}
                        title="Vorschau"
                        aria-label="Vorschau öffnen"
                      >✦</button>
                    </div>
                  </>
                );
              })()}
            </aside>
          </div>
        </div>

      {/* Live-Vorschau Panel */}
      {showPreview && (
        <div style={{
          borderTop: '2px solid var(--accent-primary)',
          backgroundColor: 'var(--bg-primary)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Vorschau — aktueller Stand (ungespeichert)
            </strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-modern-small hollow"
                onClick={() => setPreviewHtml(buildPreviewHtml())}
                title="Vorschau aktualisieren"
              >
                Aktualisieren
              </button>
              <button
                type="button"
                className="btn-modern-small red hollow"
                onClick={() => setShowPreview(false)}
                title="Vorschau schließen"
              >
                ✕
              </button>
            </div>
          </div>
          <iframe
            srcDoc={previewHtml}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: '100%',
              minHeight: 520,
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              background: '#fff',
            }}
            title="Seiten-Vorschau"
          />
        </div>
      )}

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
                      title={devTitle(`Datei auswaehlen: ${filename}`)}
                      aria-label={`Datei auswaehlen: ${filename}`}
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
                title={devTitle('Dateiauswahl abbrechen')}
                aria-label="Dateiauswahl abbrechen"
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
