import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import { GripVertical, Grid, Eye, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2, Folder, LayoutGrid, ArrowLeft, History, Layers } from 'lucide-react';
import { extractTemplateVariables, extractTypedVariables, guessInputType, generateDefaultProps, extractRepeaterBlocks } from '../lib/templateParser';
import { renderPage } from '../lib/templateEngine';
import Toast from './Toast';
import TemplateStructurePreview from './TemplateStructurePreview';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import SeoPanel from './SeoPanel';
import WorkflowPanel from './WorkflowPanel';
import DOMCanvas from './DOMCanvas';
import ElementPropertyEditor from './ElementPropertyEditor';
import { migratePage, pageNeedsMigration } from '../lib/blockToDomMigration';

export default function PageEditor({ page, templates, onSave, onCancel, allPages, onDirtyChange, userRole }) {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const [showRevisions, setShowRevisions] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

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
  const [fileModalTab, setFileModalTab] = useState('gallery');
  const [fileModalFolder, setFileModalFolder] = useState('');
  const [fileModalFolderContents, setFileModalFolderContents] = useState({ files: [], folders: [] });
  const [selectedBlockPath, setSelectedBlockPath] = useState('');
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [outlineCollapsed, setOutlineCollapsed] = useState(new Set(['outline-seo', 'outline-workflow']));
  const [selectedFieldKey, setSelectedFieldKey] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [enabledCssFiles, setEnabledCssFiles] = useState([]);
  const [toast, setToast] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState('gespeichert');
  const [useDOMEditor, setUseDOMEditor] = useState(false);
  const [domLayout, setDomLayout] = useState([]);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [pageStatus, setPageStatus] = useState((page?.status || 'DRAFT').toUpperCase());
  const blockNodeRefs = useRef({});
  const fieldNodeRefs = useRef({});
  const initialSnapshotRef = useRef('');
  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);

  const buildSnapshot = ({
    title,
    slug,
    blocks,
    pageData,
    redirectType,
    redirectUrl,
    isHomepage,
  }) => JSON.stringify({
    title: title || '',
    slug: slug || '',
    blocks: Array.isArray(blocks) ? blocks : [],
    pageData: pageData || {},
    redirectType: redirectType || 'none',
    redirectUrl: redirectUrl || '',
    isHomepage: Boolean(isHomepage),
  });

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
  const blockTemplateNames = templateObjs.filter(t => String(t.type).toUpperCase() === 'BLOCK').map(t => t.name);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (page) {
      const initialBlocks = Array.isArray(page.blocks) ? page.blocks : [];
      const migration = migrateLegacySlotMapToBlocks(initialBlocks, page.data || {});
      const migratedBlocks = migration.blocks || [];
      const initialTitle = page.title || '';
      const initialSlug = page.slug || '';
      const initialRedirectType = page.redirectType || 'none';
      const initialRedirectUrl = page.redirectUrl || '';
      const initialIsHomepage = page.isHomepage || false;
      const initialPageData = page.data || {};

      setTitle(page.title || '');
      setSlug(page.slug || '');
      setBlocks(migratedBlocks);
      setPageData(page.data || {});
      setRedirectType(initialRedirectType);
      setRedirectUrl(initialRedirectUrl);
      setIsHomepage(initialIsHomepage);
      setSelectedBlockPath(migratedBlocks.length > 0 ? '0' : '');

      // Check if page needs DOM migration and migrate if necessary
      if (pageNeedsMigration(page)) {
        try {
          const domMigrated = migratePage(page);
          if (domMigrated && Array.isArray(domMigrated.layout)) {
            setDomLayout(domMigrated.layout);
            setUseDOMEditor(true);
          }
        } catch (e) {
          console.error('DOM migration failed:', e);
        }
      }

      initialSnapshotRef.current = buildSnapshot({
        title: initialTitle,
        slug: initialSlug,
        blocks: migratedBlocks,
        pageData: initialPageData,
        redirectType: initialRedirectType,
        redirectUrl: initialRedirectUrl,
        isHomepage: initialIsHomepage,
      });
      setPageStatus((page.status || 'DRAFT').toUpperCase());
      setIsDirty(false);
      setAutosaveStatus('gespeichert');
      onDirtyChange?.(false);
    }
  }, [page]);

  useEffect(() => {
    if (!initialSnapshotRef.current) {
      initialSnapshotRef.current = buildSnapshot({
        title,
        slug,
        blocks,
        pageData,
        redirectType,
        redirectUrl,
        isHomepage,
      });
    }

    const currentSnapshot = buildSnapshot({
      title,
      slug,
      blocks,
      pageData,
      redirectType,
      redirectUrl,
      isHomepage,
    });
    const dirty = currentSnapshot !== initialSnapshotRef.current;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [title, slug, blocks, pageData, redirectType, redirectUrl, isHomepage, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

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
    const loadTemplateCodes = async () => {
      const codes = {};
      const labels = {};

      const fetchTemplate = async (tmplName) => {
        if (codes[tmplName] !== undefined) return; // already fetched or pending
        codes[tmplName] = null; // pending sentinel
        try {
          const res = await fetch(`/api/templates?name=${encodeURIComponent(tmplName)}`);
          if (res.ok) {
            const data = await res.json();
            codes[tmplName] = data.code;
            labels[tmplName] = {};
          }
        } catch (e) {
          console.error('Template laden fehlgeschlagen:', e);
        }
      };

      // Load directly referenced templates
      await Promise.all(templateNames.map(fetchTemplate));

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

  useEffect(() => {
    // Lade aktivierte CSS-Dateien für Vorschau
    fetch('/api/css')
      .then(r => r.json())
      .then(data => {
        const files = (data.files || []).filter(f => f.enabled !== false);
        setEnabledCssFiles(files);
      })
      .catch(() => {});
  }, []);

  // Prüfe ob Variable einen URL-Bezug hat
  const isUrlVariable = (varName) => {
    return /url/i.test(varName);
  };

  const templateVariablesByName = useMemo(() => {
    const out = {};
    Object.entries(templateCodes || {}).forEach(([name, code]) => {
      try {
        // extractTemplateVariables returns plain var name strings (used in existing field-key logic)
        out[name] = extractTemplateVariables(code) || [];
      } catch (e) {
        out[name] = [];
      }
    });
    return out;
  }, [templateCodes]);

  // Maps template name → { varName: explicitType|null }
  const templateTypeMapByName = useMemo(() => {
    const out = {};
    Object.entries(templateCodes || {}).forEach(([name, code]) => {
      try {
        const typed = extractTypedVariables(code) || [];
        const map = {};
        typed.forEach(({ varName, explicitType }) => { map[varName] = explicitType; });
        out[name] = map;
      } catch (e) {
        out[name] = {};
      }
    });
    return out;
  }, [templateCodes]);

  // Maps template name → repeater blocks [{ sectionName, subFields: [{ name, type }] }]
  const templateRepeatersByName = useMemo(() => {
    const out = {};
    Object.entries(templateCodes || {}).forEach(([name, code]) => {
      try {
        out[name] = extractRepeaterBlocks(code) || [];
      } catch (e) {
        out[name] = [];
      }
    });
    return out;
  }, [templateCodes]);

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
    setFileModalTab('gallery');
    setFileModalFolder('');
    setFileModalFolderContents({ files: [], folders: [] });
    setShowFileModal(true);
  };

  const loadFolderContents = async (folder) => {
    const safe = folder || '';
    setFileModalFolder(safe);
    try {
      const res = await fetch(`/api/files?folder=${encodeURIComponent(safe)}`);
      if (res.ok) {
        const data = await res.json();
        setFileModalFolderContents({ files: data.files || [], folders: data.folders || [] });
      }
    } catch (e) {
      console.error('Ordner laden fehlgeschlagen:', e);
    }
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

  // Helper: navigate nested copy to the sibling array of a given path
  const _getSiblingArr = (copy, parts) => {
    let arr = copy;
    for (let i = 0; i < parts.length - 1; i++) {
      arr = arr[parts[i]].children = arr[parts[i]].children || [];
    }
    return arr;
  };

  const moveBlockUp = (path) => {
    const parts = String(path).split('.').map(Number);
    const idx = parts[parts.length - 1];
    if (idx === 0) return;
    const copy = JSON.parse(JSON.stringify(blocks));
    const arr = _getSiblingArr(copy, parts);
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setBlocks(copy);
    const np = [...parts]; np[np.length - 1] = idx - 1;
    setSelectedBlockPath(np.join('.'));
  };

  const moveBlockDown = (path) => {
    const parts = String(path).split('.').map(Number);
    const idx = parts[parts.length - 1];
    const copy = JSON.parse(JSON.stringify(blocks));
    const arr = _getSiblingArr(copy, parts);
    if (idx >= arr.length - 1) return;
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    setBlocks(copy);
    const np = [...parts]; np[np.length - 1] = idx + 1;
    setSelectedBlockPath(np.join('.'));
  };

  // Indent: make block a child of the previous sibling
  const indentBlock = (path) => {
    const parts = String(path).split('.').map(Number);
    const idx = parts[parts.length - 1];
    if (idx === 0) return;
    const copy = JSON.parse(JSON.stringify(blocks));
    const arr = _getSiblingArr(copy, parts);
    const [movedBlock] = arr.splice(idx, 1);
    const prevSibling = arr[idx - 1];
    prevSibling.children = prevSibling.children || [];
    prevSibling.children.push(movedBlock);
    setBlocks(copy);
    setSelectedBlockPath([...parts.slice(0, -1), idx - 1, prevSibling.children.length - 1].join('.'));
  };

  // Outdent: promote block to sibling of its parent
  const outdentBlock = (path) => {
    const parts = String(path).split('.').map(Number);
    if (parts.length === 1) return;
    const idx = parts[parts.length - 1];
    const parentIdx = parts[parts.length - 2];
    const copy = JSON.parse(JSON.stringify(blocks));
    let grandparentArr = copy;
    for (let i = 0; i < parts.length - 2; i++) {
      grandparentArr = grandparentArr[parts[i]].children;
    }
    const parent = grandparentArr[parentIdx];
    const [movedBlock] = parent.children.splice(idx, 1);
    grandparentArr.splice(parentIdx + 1, 0, movedBlock);
    setBlocks(copy);
    setSelectedBlockPath([...parts.slice(0, -2), parentIdx + 1].join('.'));
  };

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

      const currentPage = {
        title,
        slug,
        blocks: blocks || [],
        data: pageData || {},
        isHomepage,
      };

      const rendered = renderPage(
        currentPage,
        blockTemplatesMap,
        {}
      );

      const cssLinkTags = enabledCssFiles
        .map(f => `    <link rel="stylesheet" href="${String(f.href || '').replace(/"/g, '&quot;')}">`)
        .join('\n');

      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title || 'Vorschau'}</title>\n${cssLinkTags}</head><body>${rendered}</body></html>`;
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

  async function handleSave(options = {}) {
    const opts = {
      close: false,
      view: false,
      silent: false,
      autosave: false,
      ...options,
    };

    if (opts.autosave && autosaveInFlightRef.current) {
      return false;
    }

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
        if (!opts.silent) {
          showToast?.(`Es existiert bereits eine 404-Seite: "${existing404.title}". Es kann nur eine 404-Seite pro Website geben.`, 'error');
        }
        if (opts.autosave) setAutosaveStatus('fehler');
        return false;
      }
    }

    const normalizedPageData = { ...(pageData || {}) };
    delete normalizedPageData.blockSlots;
    delete normalizedPageData.__blockSlots;

    // Store DOM layout if in DOM editor mode
    if (useDOMEditor && domLayout.length > 0) {
      normalizedPageData.domLayout = domLayout;
    }

    const normalizedSlug = slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const updatedPage = {
      ...page,
      title,
      slug: normalizedSlug,
      blocks,
      data: normalizedPageData,
      redirectType,
      redirectUrl: redirectType !== 'none' ? redirectUrl : undefined,
      isHomepage,
      status: pageStatus,
    };

    try {
      if (opts.autosave) {
        autosaveInFlightRef.current = true;
      }

      const saveOk = onSave ? await onSave(updatedPage, opts) : true;
      if (!saveOk) {
        if (opts.autosave) setAutosaveStatus('fehler');
        return false;
      }

      if (!slug && normalizedSlug) {
        setSlug(normalizedSlug);
      }

      initialSnapshotRef.current = buildSnapshot({
        title,
        slug: normalizedSlug,
        blocks,
        pageData: normalizedPageData,
        redirectType,
        redirectUrl,
        isHomepage,
      });
      setIsDirty(false);
      setAutosaveStatus('gespeichert');
      onDirtyChange?.(false);
      return true;
    } catch (error) {
      if (!opts.silent) {
        showToast('Speichern fehlgeschlagen. Bitte Eingaben pruefen und erneut speichern. Details: ' + (error.message || 'Unbekannter Fehler'), 'error');
      }
      if (opts.autosave) setAutosaveStatus('fehler');
      return false;
    } finally {
      if (opts.autosave) {
        autosaveInFlightRef.current = false;
      }
    }
  }

  async function handleSaveAndClose() {
    await handleSave({ close: true });
  }

  async function handleSaveAndView() {
    await handleSave({ view: true });
  }

  useEffect(() => {
    if (!page?.id || !isDirty) {
      if (!isDirty) setAutosaveStatus('gespeichert');
      return undefined;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus('speichert');
      await handleSave({ silent: true, autosave: true });
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [page?.id, isDirty, title, slug, blocks, pageData, redirectType, redirectUrl, isHomepage]);

  function handleCancelClick() {
    if (isDirty) {
      const confirmed = window.confirm('Du hast ungespeicherte Aenderungen. Wirklich verwerfen und Editor verlassen?');
      if (!confirmed) return;
    }
    onCancel?.();
  }

  // Render helpers for nested block editor
  const renderBlockEditor = (block, path, depth = 0) => {
    const isTop = depth === 0;
    const templateVariables = block.template ? (templateVariablesByName[block.template] || []) : [];
    const typeMap = block.template ? (templateTypeMapByName[block.template] || {}) : {};
    // Resolve effective input type: explicit annotation wins over guessed type
    const resolveInputType = (varName) => typeMap[varName] || guessInputType(varName);

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
        className={`block-item${selectedBlockPath === path ? ' selected' : ''}`}
        style={{ marginLeft: depth * 16 }}
        onClick={() => setSelectedBlockPath(path)}
        title={devTitle(`Komponente: Block ${formatBlockNumber(path)}. Funktion: Block auswaehlen und Inhalte bearbeiten.`)}
        {...containerProps}
      >
        {/* Block Header */}
        <div className="block-header">
          <div className="block-header-left">
            {isTop ? (
              <div
                draggable
                onDragStart={handleGripDragStart}
                onDragEnd={handleGripDragEnd}
                title={devTitle(`Funktion: Block ${formatBlockNumber(path)} per Drag-and-Drop neu anordnen`)}
                className="block-drag-handle"
              >
                <GripVertical size={18} style={{ pointerEvents: 'none' }} />
              </div>
            ) : null}
            <div className="block-title-row">
              <Grid size={16} />
              <span className="page-block-index">Block {path.split('.').map(part => Number(part) + 1).join('.')}</span>
                            <input
                type="text"
                className="block-anchor-input"
                placeholder="Anchor ID"
                value={block.props?.anchorId || ''}
                onChange={e => { e.stopPropagation(); updateNestedBlock(path, { anchorId: e.target.value }); }}
                onClick={e => e.stopPropagation()}
                title={devTitle('Feld: Anchor-ID')}
                aria-label="Anchor-ID"
              />
              <select
                value={block.template || ''}
                onChange={e => { e.stopPropagation(); updateNestedBlockTemplate(path, e.target.value); }}
                onClick={e => e.stopPropagation()}
                className="block-template-select"
                title={devTitle('Feld: Block-Template')}
                aria-label="Block-Template"
              >
                <option value="">-- Template --</option>
                {blockTemplateNames.map(tn => (
                  <option key={tn} value={tn}>{tn}</option>
                ))}
              </select>

            </div>
          </div>
          <div className="block-header-right">
            {(() => {
              const parts = String(path).split('.').map(Number);
              const idx = parts[parts.length - 1];
              const depth = parts.length - 1;
              let parentChildren = blocks;
              for (let i = 0; i < parts.length - 1; i++) parentChildren = (parentChildren[parts[i]]?.children || []);
              const sibCount = parentChildren.length;
              return (
                <div className="block-move-controls" onClick={e => e.stopPropagation()}>
                  <button type="button" className="block-move-btn" disabled={idx === 0}
                    onClick={() => moveBlockUp(path)} title="Nach oben verschieben">
                    <ChevronUp size={12} /></button>
                  <button type="button" className="block-move-btn" disabled={idx >= sibCount - 1}
                    onClick={() => moveBlockDown(path)} title="Nach unten verschieben">
                    <ChevronDown size={12} /></button>
                  <button type="button" className="block-move-btn" disabled={depth === 0}
                    onClick={() => outdentBlock(path)} title="Ebene rauf (Outdent)">
                    <ChevronLeft size={12} /></button>
                  <button type="button" className="block-move-btn" disabled={idx === 0}
                    onClick={() => indentBlock(path)} title="Als Kind einrücken (Indent)">
                    <ChevronRight size={12} /></button>
                </div>
              );
            })()}
            <small className="block-kindblock-count">
              {Array.isArray(block.children) ? block.children.length : 0} Kindblöcke
            </small>
          </div>
        </div>

        {/* Block Content */}
        <div className="block-card-body">
          {/* Template specific fields (reuse existing logic) */}
          {block.template && templateCodes[block.template] && (
            <div>
              {/* Grid layout for non-textarea fields */}
              <div className="block-fields-grid">
                {templateVariables
                  .filter(varName => resolveInputType(varName) !== 'textarea')
                  .map(varName => {
                    const inputType = resolveInputType(varName);
                    const value = block.props[varName] || '';
                    const label = snippetLabels[block.template]?.[varName] || varName;

                    if (varName.toLowerCase().includes('headinglevel')) {
                      const normalizedLevel = String(value || '2').replace(/^h/i, '');
                      return (
                        <div key={varName} className="field-item">
                          <label className="field-label-xs">{label}</label>
                          <select
                            ref={(el) => setFieldRef(path, varName, el)}
                            value={normalizedLevel}
                            onChange={e => updateNestedBlock(path, { [varName]: e.target.value })}
                            className="input-field-small field-input-full"
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

                    if (inputType === 'image') {
                      return (
                        <div key={varName} className="field-item">
                          <label className="field-label-xs">{label}</label>
                          <div className="field-url-row">
                            <input ref={(el) => setFieldRef(path, varName, el)} type="text" placeholder="Bild-URL" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                            <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small" title={devTitle(`Bild fuer Feld ${label} auswaehlen`)} aria-label={`Bild fuer Feld ${label} auswaehlen`}>📁 Bild</button>
                          </div>
                        </div>
                      )
                    }

                    if (isUrlVariable(varName)) {
                      return (
                        <div key={varName} className="field-item">
                          <label className="field-label-xs">{label}</label>
                          <div className="field-url-row">
                            <input ref={(el) => setFieldRef(path, varName, el)} type="text" placeholder="URL oder Dateipfad" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                            <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small field-input-full" title={devTitle(`Datei fuer Feld ${label} auswaehlen`)} aria-label={`Datei fuer Feld ${label} auswaehlen`}>📁 Datei</button>
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
                        <div key={varName} className="field-item">
                          <label className="field-label-xs">{label}</label>
                          <div className="field-heading-row">
                            <select ref={(el) => setFieldRef(path, `${varName}Level`, el)} value={levelValue} onChange={e => applyHeading(undefined, e.target.value)} className="input-field-small field-input-full">
                              <option value="h1">H1</option>
                              <option value="h2">H2</option>
                              <option value="h3">H3</option>
                              <option value="h4">H4</option>
                              <option value="h5">H5</option>
                            </select>
                            <input ref={(el) => setFieldRef(path, `${varName}Text`, el)} type="text" placeholder="Heading text" value={textValue} onChange={e => applyHeading(e.target.value, undefined)} className="input-field-small field-input-full" />
                          </div>
                        </div>
                      )
                    }

                    if (inputType === 'array') {
                      const arrayLabel = snippetLabels[block.template]?.[varName] || varName;
                      return (
                        <div key={varName} className="field-item">
                          <label className="field-label-xs">{arrayLabel}</label>
                          <textarea ref={(el) => setFieldRef(path, varName, el)} placeholder="Ein Wert pro Zeile" value={Array.isArray(value) ? value.join('\n') : ''} onChange={e => updateNestedBlock(path, { [varName]: e.target.value.split('\n').filter(v => v.trim()) })} rows={2} className="input-field-small field-input-full field-array-textarea" />
                        </div>
                      )
                    }

                    // Default text/number input
                    const defaultLabel = snippetLabels[block.template]?.[varName] || varName;
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{defaultLabel}</label>
                        <input ref={(el) => setFieldRef(path, varName, el)} type={inputType === 'number' ? 'number' : 'text'} placeholder={varName} value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                      </div>
                    )
                  })}
              </div>

              {/* Separate textarea fields (full width) - NACH dem Grid */}
              {templateVariables
                .filter(varName => resolveInputType(varName) === 'textarea')
                .map(varName => {
                  const value = block.props[varName] || '';
                  const label = snippetLabels[block.template]?.[varName] || varName;
                  return (
                    <div key={varName} className="field-item field-item-textarea">
                      <label className="field-label-xs">{label}</label>
                      <div ref={(el) => setFieldRef(path, varName, el)} className="field-quill-wrapper">
                        <ReactQuill value={value || ''} onChange={(val) => updateNestedBlock(path, { [varName]: val })} theme="snow" />
                      </div>
                    </div>
                  )
                })}

              {/* Repeater fields: {{#each:name}}...{{/each:name}} */}
              {(templateRepeatersByName[block.template] || []).map(({ sectionName, subFields }) => {
                const rows = Array.isArray(block.props[sectionName]) ? block.props[sectionName] : [];
                return (
                  <div key={sectionName} className="field-item field-item-repeater">
                    <div className="field-repeater-header">
                      <label className="field-label-xs field-repeater-label">{sectionName}</label>
                      <button
                        type="button"
                        onClick={() => {
                          const emptyRow = Object.fromEntries(subFields.map(sf => [sf.name, '']));
                          updateNestedBlock(path, { [sectionName]: [...rows, emptyRow] });
                        }}
                        className="btn-modern-small repeater-add-btn"
                        title={`Eintrag zu ${sectionName} hinzufügen`}
                      >
                        <Plus size={12} /> Eintrag hinzufügen
                      </button>
                    </div>
                    <div className="repeater-rows">
                      {rows.map((row, rowIdx) => (
                        <div key={rowIdx} className="repeater-row">
                          <div className="repeater-row-fields">
                            {subFields.map(sf => {
                              const sfVal = row[sf.name] !== undefined ? row[sf.name] : '';
                              if (sf.type === 'textarea') {
                                return (
                                  <div key={sf.name} className="repeater-subfield repeater-subfield-wide">
                                    <label className="field-label-xs">{sf.name}</label>
                                    <textarea
                                      value={sfVal}
                                      placeholder={sf.name}
                                      onChange={e => {
                                        const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: e.target.value } : r);
                                        updateNestedBlock(path, { [sectionName]: next });
                                      }}
                                      rows={2}
                                      className="input-field-small field-input-full"
                                    />
                                  </div>
                                );
                              }
                              if (sf.type === 'image' || sf.type === 'url') {
                                return (
                                  <div key={sf.name} className="repeater-subfield">
                                    <label className="field-label-xs">{sf.name}</label>
                                    <div className="field-url-row">
                                      <input
                                        type="text"
                                        placeholder={sf.name}
                                        value={sfVal}
                                        onChange={e => {
                                          const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: e.target.value } : r);
                                          updateNestedBlock(path, { [sectionName]: next });
                                        }}
                                        className="input-field-small field-input-full"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => openFileModal((url) => {
                                          const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: url } : r);
                                          updateNestedBlock(path, { [sectionName]: next });
                                        })}
                                        className="btn-modern-small"
                                        title={`Datei für ${sf.name} auswählen`}
                                        aria-label={`Datei für ${sf.name} auswählen`}
                                      >📁</button>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div key={sf.name} className="repeater-subfield">
                                  <label className="field-label-xs">{sf.name}</label>
                                  <input
                                    type={sf.type === 'number' ? 'number' : 'text'}
                                    placeholder={sf.name}
                                    value={sfVal}
                                    onChange={e => {
                                      const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: e.target.value } : r);
                                      updateNestedBlock(path, { [sectionName]: next });
                                    }}
                                    className="input-field-small field-input-full"
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="repeater-row-actions">
                            <button
                              type="button"
                              onClick={() => {
                                const copy = { ...row };
                                const next = [
                                  ...rows.slice(0, rowIdx + 1),
                                  copy,
                                  ...rows.slice(rowIdx + 1)
                                ];
                                updateNestedBlock(path, { [sectionName]: next });
                              }}
                              className="repeater-row-duplicate"
                              title={`Eintrag ${rowIdx + 1} duplizieren`}
                              aria-label={`Eintrag ${rowIdx + 1} aus ${sectionName} duplizieren`}
                            >⧉</button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = rows.filter((_, i) => i !== rowIdx);
                                updateNestedBlock(path, { [sectionName]: next });
                              }}
                              className="repeater-row-delete"
                              title={`Eintrag ${rowIdx + 1} entfernen`}
                              aria-label={`Eintrag ${rowIdx + 1} aus ${sectionName} entfernen`}
                            >✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback simple text/gallery editors when no template */}
          {!block.template && block.type === 'text' && (
            <>
              <input ref={(el) => setFieldRef(path, 'title', el)} type="text" placeholder="Titel" value={block.props.title || ''} onChange={e => updateNestedBlock(path, { title: e.target.value })} className="input-field-small field-input-full" style={{ marginBottom: 8 }} />
              <div ref={(el) => setFieldRef(path, 'content', el)} className="field-quill-wrapper">
                <ReactQuill value={block.props.content || ''} onChange={(val) => updateNestedBlock(path, { content: val })} theme="snow" />
              </div>
            </>
          )}

          {!block.template && block.type === 'gallery' && (
            <div>
              <button className="btn-modern gallery-add-btn" onClick={() => {
                const url = prompt('Bild-URL:'); if (url) { const images = [...(block.props.images || []), { src: url, alt: 'Bild' }]; updateNestedBlock(path, { images }); }
              }} title={devTitle('Bild zur Galerie hinzufuegen')} aria-label="Bild zur Galerie hinzufuegen">➕ Bild hinzufügen</button>
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

      {showRevisions && (
        <RevisionHistoryPanel
          pageId={page && page.id}
          pageName={title}
          onClose={() => setShowRevisions(false)}
          onRestored={() => setShowRevisions(false)}
          showToast={showToast}
        />
      )}


      <div className="tab-content blocks-tab">

        {/* ── Sticky Toolbar ──────────────────────────────────────────── */}
        <div className="pe-toolbar">
          <div className="pe-toolbar-left">
            <span className="pe-toolbar-title">{title || 'Unbenannte Seite'}</span>
            <span className="pe-toolbar-slug">/{slug || '—'}</span>
          </div>
          <div className="pe-toolbar-actions">
            {domLayout.length > 0 && (
              <button
                type="button"
                className={`pe-tb-btn ${useDOMEditor ? 'active' : ''}`}
                onClick={() => setUseDOMEditor(!useDOMEditor)}
                title={useDOMEditor ? 'Zu Block-Editor wechseln' : 'Zu DOM-Editor wechseln'}
              >
                <Layers size={14} /> {useDOMEditor ? 'DOM' : 'Blöcke'}
              </button>
            )}
            <button
              type="button"
              className={`pe-tb-btn${showPreview ? ' pe-tb-btn-active' : ''}`}
              onClick={handleTogglePreview}
              title={devTitle('Live-Vorschau ein-/ausblenden')}
            >
              <Eye size={14} /> Vorschau
            </button>
            <button
              type="button"
              className="pe-tb-btn"
              onClick={() => setShowRevisions(true)}
              title="Versionsverlauf anzeigen"
            >
              <History size={14} /> Verlauf
            </button>
            <div className="pe-toolbar-sep" />
            <button type="button" className="pe-tb-btn pe-tb-btn-ghost" onClick={handleSaveAndView} title={devTitle('Seite speichern und im Frontend anzeigen')}>Speichern &amp; Anzeigen</button>
            <button type="button" className="pe-tb-btn pe-tb-btn-ghost" onClick={handleSaveAndClose} title={devTitle('Seite speichern und Editor schliessen')}>Speichern &amp; Schließen</button>
            <button type="button" className="pe-tb-btn pe-tb-btn-primary" onClick={handleSave} title={devTitle('Seite speichern')}>Speichern</button>
            <span
              className={`pe-autosave-indicator${autosaveStatus === 'fehler' ? ' error' : autosaveStatus === 'speichert' ? ' saving' : ''}`}
              aria-live="polite"
            >
              {autosaveStatus === 'speichert' ? 'speichert…' : autosaveStatus === 'fehler' ? '⚠ Fehler' : '✓'}
            </span>
          </div>
        </div>

        <div className="page-editor-workspace">
          {useDOMEditor ? (
            // DOM Editor View
            <div className="page-editor-canvas" title={devTitle('DOM-Layout-Editor')}>
              <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
                <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #ddd', padding: '16px' }}>
                  <h4 style={{ marginBottom: '12px' }}>DOM-Elemente</h4>
                  <DOMCanvas
                    pageLayout={domLayout}
                    selectedElementId={selectedElementId}
                    onAddElement={() => {
                      const newElement = {
                        id: `elem-${Date.now()}`,
                        tag: 'div',
                        attrs: {},
                        children: []
                      };
                      setDomLayout([...domLayout, newElement]);
                    }}
                    onDeleteElement={(elementId) => {
                      const filterElements = (els) =>
                        els.filter(el => el.id !== elementId).map(el => ({
                          ...el,
                          children: el.children ? filterElements(el.children) : el.children
                        }));
                      setDomLayout(filterElements(domLayout));
                    }}
                    onSelectElement={setSelectedElementId}
                    onUpdateElement={(elementId, updates) => {
                      const updateElements = (els) =>
                        els.map(el =>
                          el.id === elementId
                            ? { ...el, ...updates }
                            : { ...el, children: el.children ? updateElements(el.children) : el.children }
                        );
                      setDomLayout(updateElements(domLayout));
                    }}
                  />
                </div>
                {selectedElementId && (
                  <div style={{ flex: 0.3, overflowY: 'auto', borderLeft: '1px solid #ddd', padding: '16px' }}>
                    <h4 style={{ marginBottom: '12px' }}>Element Properties</h4>
                    <ElementPropertyEditor
                      element={domLayout.find(el => el.id === selectedElementId)}
                      onChange={(updates) => {
                        const updateElements = (els) =>
                          els.map(el =>
                            el.id === selectedElementId
                              ? { ...el, ...updates }
                              : { ...el, children: el.children ? updateElements(el.children) : el.children }
                          );
                        setDomLayout(updateElements(domLayout));
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Legacy Blocks Editor View
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
          )}

          {typeof window !== 'undefined' && document.getElementById('page-editor-inspector-portal') ? createPortal(
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

                  {/* Block Actions */}
                  <div className="inspector-block-bar">
                    <button
                      type="button"
                      className="pe-tb-btn pe-tb-btn-primary inspector-ga-newblock"
                      onClick={() => { const p = String((blocks || []).length); handleAddBlock('content'); setSelectedBlockPath(p); }}
                      title={devTitle('Neuen Top-Level-Block anlegen')}
                    >
                      <Plus size={13} /> Neuer Block
                    </button>
                    <button
                      type="button"
                      className="pe-tb-btn"
                      onClick={() => addNestedBlock(selectedBlockPath, 'content', true)}
                      title={devTitle('Unterblock anlegen')}
                    >
                      <Plus size={13} /> Kind
                    </button>
                    <button
                      type="button"
                      className="pe-tb-btn pe-tb-btn-danger"
                      onClick={() => {
                        const currentPath = selectedBlockPath;
                        handleDeleteBlock(currentPath);
                        const segments = currentPath.split('.');
                        setSelectedBlockPath(segments.length > 1 ? segments.slice(0, -1).join('.') : '0');
                      }}
                      title={devTitle('Ausgewaehlten Block loeschen')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {!selectedBlock ? (
                    <div className="page-editor-inspector-empty">Wähle einen Block in der Mitte oder links aus, um Metadaten zu bearbeiten.</div>
                  ) : (
                    <>


                      {/* Zugeordnete Felder */}
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
                              const selTypeMap = selectedBlock.template ? (templateTypeMapByName[selectedBlock.template] || {}) : {};
                              if (!selectedBlock.template) {
                                return <p className="inspector-fields-empty">Kein Template zugeordnet</p>;
                              }
                              if (vars.length === 0) {
                                return <p className="inspector-fields-empty">Keine Felder erkannt</p>;
                              }
                              return (
                                <ul className="inspector-field-list">
                                  {vars.map(varName => {
                                    const inputType = selTypeMap[varName] || guessInputType(varName);
                                    const isTextarea = inputType === 'textarea' || inputType === 'richtext';
                                    const label = (snippetLabels[selectedBlock.template]?.[varName]) || varName;
                                    return (
                                      <li key={varName} className="inspector-field-item">
                                        <span className="inspector-field-icon">{isTextarea ? '≡' : inputType === 'number' ? '#' : 'T'}</span>
                                        <span className="inspector-field-label">{label}</span>
                                        {selTypeMap[varName] && <span className="inspector-field-type">{selTypeMap[varName]}</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              );
                            })()}
                          </div>
                        )}
                      </div>


                    </>
                  )}

                  {/* ── Seite ─────────────────────────────── */}
                  <div className="inspector-section-divider" />

                  {/* Einstellungen */}
                  <div className="inspector-section">
                    <button type="button" className="inspector-section-head" onClick={() => setOutlineCollapsed(prev => { const n = new Set(prev); n.has('outline-settings') ? n.delete('outline-settings') : n.add('outline-settings'); return n; })} aria-expanded={!outlineCollapsed.has('outline-settings')}>
                      <span className="inspector-section-icon">⚙</span>
                      <span className="inspector-section-label">Einstellungen</span>
                      {outlineCollapsed.has('outline-settings') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!outlineCollapsed.has('outline-settings') && (
                      <div className="page-editor-outline-settings">
                        <label className="field-label-xs">Seitentitel</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Seitentitel" className="input-field-small" aria-label="Seitentitel" />
                        <label className="field-label-xs">Slug</label>
                        <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder="seiten-url" className="input-field-small" aria-label="URL-Slug" />
                        <label className="field-label-xs">Weiterleitung</label>
                        <select value={redirectType} onChange={e => setRedirectType(e.target.value)} className="input-field-small" aria-label="Weiterleitungstyp">
                          <option value="none">Keine</option>
                          <option value="404">404</option>
                          <option value="503">503</option>
                          <option value="external">Externe URL</option>
                        </select>
                        {redirectType === 'external' && (
                          <input type="url" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)} placeholder="https://example.com" className="input-field-small" aria-label="Ziel-URL" />
                        )}
                        <label className="page-editor-outline-toggle">
                          <input type="checkbox" checked={isHomepage} onChange={e => setIsHomepage(e.target.checked)} />
                          Als Startseite
                        </label>
                      </div>
                    )}
                  </div>

                  {/* SEO */}
                  <div className="inspector-section">
                    <button type="button" className="inspector-section-head" onClick={() => setOutlineCollapsed(prev => { const n = new Set(prev); n.has('outline-seo') ? n.delete('outline-seo') : n.add('outline-seo'); return n; })} aria-expanded={!outlineCollapsed.has('outline-seo')}>
                      <span className="inspector-section-icon">◎</span>
                      <span className="inspector-section-label">SEO</span>
                      {outlineCollapsed.has('outline-seo') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!outlineCollapsed.has('outline-seo') && (
                      <div className="inspector-section-body" style={{ padding: '4px 0 0' }}>
                        <SeoPanel pageData={pageData} slug={slug} onChange={setPageData} />
                      </div>
                    )}
                  </div>

                  {/* Workflow */}
                  <div className="inspector-section">
                    <button type="button" className="inspector-section-head" onClick={() => setOutlineCollapsed(prev => { const n = new Set(prev); n.has('outline-workflow') ? n.delete('outline-workflow') : n.add('outline-workflow'); return n; })} aria-expanded={!outlineCollapsed.has('outline-workflow')}>
                      <span className="inspector-section-icon">◈</span>
                      <span className="inspector-section-label">Workflow</span>
                      {outlineCollapsed.has('outline-workflow') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!outlineCollapsed.has('outline-workflow') && (
                      <div className="inspector-section-body" style={{ padding: '4px 0 0' }}>
                        <WorkflowPanel pageId={page?.id} status={pageStatus} userRole={userRole} onTransition={(s) => setPageStatus(s.toUpperCase())} />
                      </div>
                    )}
                  </div>

                  {/* Strukturvorschau */}
                  <div className="inspector-section">
                    <button type="button" className="inspector-section-head" onClick={() => setOutlineCollapsed(prev => { const n = new Set(prev); n.has('outline-structure') ? n.delete('outline-structure') : n.add('outline-structure'); return n; })} aria-expanded={!outlineCollapsed.has('outline-structure')}>
                      <span className="inspector-section-icon">▦</span>
                      <span className="inspector-section-label">Strukturvorschau</span>
                      {outlineCollapsed.has('outline-structure') ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    {!outlineCollapsed.has('outline-structure') && (
                      <div className="page-editor-outline-structure">
                        <TemplateStructurePreview blocks={blocks} activeBlockPath={selectedBlockPath} onBlockClick={blocks.length > 0 ? handleStructureBlockClick : null} />
                      </div>
                    )}
                  </div>

                </>
              );
            })()}
          </aside>
          , document.getElementById('page-editor-inspector-portal')) : null}
        </div>
      </div>

      {/* Live-Vorschau Panel */}
      {showPreview && (
        <div className="page-preview-panel">
          <div className="page-preview-panel-head">
            <strong className="page-preview-label">
              Vorschau — aktueller Stand (ungespeichert)
            </strong>
            <div className="page-preview-actions">
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
            className="page-preview-iframe"
            title="Seiten-Vorschau"
          />
        </div>
      )}

      {/* Datei-Auswahl Modal */}
      {showFileModal && (
        <div className="file-modal-overlay">
          <div className="file-modal">
            <div className="file-modal-header">
              <h3 className="file-modal-title">Datei auswählen</h3>
              <div className="file-modal-header-actions">
                <label className={`file-upload-label${uploading ? ' is-uploading' : ''}`}>
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
                  className="file-modal-close-btn"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="file-modal-tabs">
              <button
                className={`file-modal-tab${fileModalTab === 'gallery' ? ' active' : ''}`}
                onClick={() => setFileModalTab('gallery')}
              >
                <LayoutGrid size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                Galerie
              </button>
              <button
                className={`file-modal-tab${fileModalTab === 'folders' ? ' active' : ''}`}
                onClick={() => { setFileModalTab('folders'); loadFolderContents(fileModalFolder); }}
              >
                <Folder size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                Ordner
              </button>
            </div>

            {/* Gallery Tab */}
            {fileModalTab === 'gallery' && (
              <div className="file-modal-grid">
                {uploadedFiles.length === 0 ? (
                  <div className="file-modal-empty">
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
                        className="file-modal-item"
                      >
                        <div className="file-modal-thumb">
                          {isImage ? (
                            <img
                              src={file.url}
                              alt={filename}
                            />
                          ) : (
                            <span className="file-modal-icon">{preview}</span>
                          )}
                        </div>
                        <div className="file-modal-filename">
                          {filename}
                        </div>
                        {file.size && (
                          <div className="file-modal-filesize">
                            {(file.size / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Ordner Tab */}
            {fileModalTab === 'folders' && (
              <>
                {/* Breadcrumb */}
                <div className="file-modal-breadcrumb">
                  <button className="bc-btn" onClick={() => loadFolderContents('')}>uploads</button>
                  {fileModalFolder && fileModalFolder.split('/').map((part, i, arr) => (
                    <span key={i}>
                      <span className="bc-sep">/</span>
                      <button className="bc-btn" onClick={() => loadFolderContents(arr.slice(0, i + 1).join('/'))}>{part}</button>
                    </span>
                  ))}
                </div>

                <div className="file-modal-grid">
                  {/* Zurück-Button */}
                  {fileModalFolder && (
                    <div
                      className="file-modal-item file-modal-folder-item"
                      onClick={() => {
                        const parts = fileModalFolder.split('/');
                        parts.pop();
                        loadFolderContents(parts.join('/'));
                      }}
                    >
                      <div className="file-modal-thumb"><ArrowLeft size={40} /></div>
                      <div className="file-modal-filename">..</div>
                    </div>
                  )}

                  {/* Unterordner */}
                  {fileModalFolderContents.folders.map(f => (
                    <div
                      key={f.name}
                      className="file-modal-item file-modal-folder-item"
                      onClick={() => loadFolderContents(fileModalFolder ? `${fileModalFolder}/${f.name}` : f.name)}
                    >
                      <div className="file-modal-thumb"><Folder size={48} /></div>
                      <div className="file-modal-filename">{f.name}</div>
                    </div>
                  ))}

                  {/* Dateien */}
                  {fileModalFolderContents.files.map(file => {
                    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
                    return (
                      <div
                        key={file.url}
                        className="file-modal-item"
                        onClick={() => selectFile(file.url)}
                        title={file.name}
                        aria-label={`Datei auswählen: ${file.name}`}
                      >
                        <div className="file-modal-thumb">
                          {isImage
                            ? <img src={file.url} alt={file.name} />
                            : <span className="file-modal-icon">📎</span>}
                        </div>
                        <div className="file-modal-filename">{file.name}</div>
                        {file.size && (
                          <div className="file-modal-filesize">{(file.size / 1024).toFixed(1)} KB</div>
                        )}
                      </div>
                    );
                  })}

                  {fileModalFolderContents.folders.length === 0 && fileModalFolderContents.files.length === 0 && !fileModalFolder && (
                    <div className="file-modal-empty">Bitte oben auf einen Ordner klicken</div>
                  )}
                  {fileModalFolderContents.folders.length === 0 && fileModalFolderContents.files.length === 0 && fileModalFolder && (
                    <div className="file-modal-empty">Ordner ist leer</div>
                  )}
                </div>
              </>
            )}

            <div className="file-modal-footer">
              <button
                onClick={() => setShowFileModal(false)}
                title={devTitle('Dateiauswahl abbrechen')}
                aria-label="Dateiauswahl abbrechen"
                className="file-modal-cancel-btn"
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
