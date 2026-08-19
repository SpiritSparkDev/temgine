import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Grid, Eye, EyeOff, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2, Folder, LayoutGrid, ArrowLeft, History, Layers, Layout, Monitor, Minimize2, Maximize2, X, Columns } from '../lib/muiIcons';
import { extractTemplateVariables, extractTypedVariables, guessInputType, generateDefaultProps, extractRepeaterBlocks, extractFieldGroups } from '../lib/templateParser';
import { renderPage, renderTemplate } from '../lib/templateEngine';
import Toast from './Toast';
import RichTextEditor from './RichTextEditor';
import TemplateStructurePreview from './TemplateStructurePreview';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import SeoPanel from './SeoPanel';
import WorkflowPanel from './WorkflowPanel';
import DOMCanvas from './DOMCanvas';
import ElementPropertyEditor from './ElementPropertyEditor';
import { migratePage, pageNeedsMigration } from '../lib/blockToDomMigration';

export default function PageEditor({ page, templates, onSave, onCancel, allPages, onDirtyChange, userRole }) {
  const CHANNEL_TEMPLATE_VALUE_PREFIX = '__channel__:';
  const CHANNEL_TEMPLATE_LABEL_PREFIX = 'Kanal: ';

  const makeChannelTemplateValue = (slug) => `${CHANNEL_TEMPLATE_VALUE_PREFIX}${slug}`;
  const parseChannelTemplateValue = (value) => {
    const normalized = String(value || '');
    if (!normalized.startsWith(CHANNEL_TEMPLATE_VALUE_PREFIX)) return null;
    return normalized.slice(CHANNEL_TEMPLATE_VALUE_PREFIX.length).trim() || null;
  };

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
  const [accessGroups, setAccessGroups] = useState([]); // [] = public, ['*'] = all members, ['slug1'] = specific groups
  const [availableMemberGroups, setAvailableMemberGroups] = useState([]);
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
  const [outlineVisibleOnly, setOutlineVisibleOnly] = useState(false);
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
  const [previewBlocks, setPreviewBlocks] = useState(() => new Set());
  const [blockPreviewHtmls, setBlockPreviewHtmls] = useState({});
  const [collapsedBlocks, setCollapsedBlocks] = useState(() => new Set());
  const [lightboxBlockPath, setLightboxBlockPath] = useState('');
  const [splitPreview, setSplitPreview] = useState(false);
  const [splitPreviewHtml, setSplitPreviewHtml] = useState('');
  const [expandedField, setExpandedField] = useState(null); // { varName, label, value, inputType, blockPath }
  const [blogChannels, setBlogChannels] = useState([]);
  const [blogTemplates, setBlogTemplates] = useState([]);
  const adminScopeRef = useRef(null);
  const blockNodeRefs = useRef({});
  const fieldNodeRefs = useRef({});
  const initialSnapshotRef = useRef('');
  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const splitPreviewIframeRef = useRef(null);
  const splitPreviewTimerRef = useRef(null);
  // Refs for keyboard shortcuts (always point to latest handlers)
  const handleSaveRef = useRef(null);
  const handleSaveAndCloseRef = useRef(null);
  const handleCancelClickRef = useRef(null);
  const handleUndoRef = useRef(null);
  const handleRedoRef = useRef(null);
  // Undo/Redo history
  const historyStackRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const historySkipNextPushRef = useRef(false);

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
  const channelTemplateOptions = [...blogChannels]
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'de', { sensitivity: 'base' }))
    .map(ch => ({
      value: makeChannelTemplateValue(String(ch.slug || '')),
      label: `${CHANNEL_TEMPLATE_LABEL_PREFIX}${String(ch.name || ch.slug || '').trim()}`,
      slug: String(ch.slug || '').trim(),
    }))
    .filter(opt => opt.slug);

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
      const initialAccessGroups = Array.isArray(page.accessGroups) ? page.accessGroups : [];

      setTitle(page.title || '');
      setSlug(page.slug || '');
      setBlocks(migratedBlocks);
      setPageData(page.data || {});
      setRedirectType(initialRedirectType);
      setRedirectUrl(initialRedirectUrl);
      setIsHomepage(initialIsHomepage);
      setAccessGroups(initialAccessGroups);
      setSelectedBlockPath(migratedBlocks.length > 0 ? '0' : '');
      // Minimized-block state is an editor-only UI preference (not page content),
      // so it lives in localStorage per page rather than being saved to the DB.
      let restoredCollapsed = new Set();
      try {
        const raw = page.id ? localStorage.getItem(`collapsedBlocks:${page.id}`) : null;
        if (raw) restoredCollapsed = new Set(JSON.parse(raw));
      } catch (_e) {
        // malformed/unavailable storage — fall back to all-expanded
      }
      setCollapsedBlocks(restoredCollapsed);
      setLightboxBlockPath('');

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
    if (!page?.id) return;
    try {
      localStorage.setItem(`collapsedBlocks:${page.id}`, JSON.stringify([...collapsedBlocks]));
    } catch (_e) {
      // storage unavailable (private browsing quota, etc.) — non-critical
    }
  }, [collapsedBlocks, page?.id]);

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

  /** Converts camelCase / kebab-case / snake_case field names into readable labels.
   *  e.g. "linkesPanel" → "Linkes Panel", "externerLinkText" → "Externer Link Text" */
  const formatLabel = (name) => {
    if (!name) return '';
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

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
    // Lade Blog-Kanäle für Blog-Channel-Blöcke
    const loadBlogChannels = async () => {
      try {
        const res = await fetch('/api/blog/channels');
        if (res.ok) {
          const data = await res.json();
          setBlogChannels(Array.isArray(data) ? data : (data.channels || []));
        }
      } catch (e) {
        // Silently ignore — blog channels are optional
      }
    };
    loadBlogChannels();
  }, []);

  useEffect(() => {
    // Lade Blog-Templates für freie Darstellungsauswahl
    const loadBlogTemplates = async () => {
      try {
        const res = await fetch('/api/templates?scope=blog&type=BLOCK');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setBlogTemplates(
            list
              .filter(t => t && (t.type === 'BLOCK' || !t.type) && t.name)
              .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }))
          );
        }
      } catch (e) {
        // Silently ignore — optional for page editing
      }
    };
    loadBlogTemplates();
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

  // postMessage listener: click in split preview → select block in editor
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'temgine-block-click') {
        setSelectedBlockPath(String(e.data.blockPath));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Escape key closes preview overlay
  useEffect(() => {
    if (!showPreview) return;
    const handleKey = (e) => { if (e.key === 'Escape') setShowPreview(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showPreview]);

  // Escape key closes field expand lightbox
  useEffect(() => {
    if (!expandedField) return;
    const handleKey = (e) => { if (e.key === 'Escape') setExpandedField(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [expandedField]);

  // Escape key closes block lightbox
  useEffect(() => {
    if (!lightboxBlockPath) return;
    const handleKey = (e) => { if (e.key === 'Escape') setLightboxBlockPath(''); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxBlockPath]);

  // Auto-rebuild split preview (debounced 600ms) when content changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!splitPreview) return;
    if (splitPreviewTimerRef.current) clearTimeout(splitPreviewTimerRef.current);
    splitPreviewTimerRef.current = setTimeout(() => {
      setSplitPreviewHtml(buildSplitPreviewHtml());
    }, 600);
    return () => clearTimeout(splitPreviewTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitPreview, blocks, templateCodes, enabledCssFiles]);

  // Highlight selected block in split preview when selectedBlockPath changes
  useEffect(() => {
    if (!splitPreview || !splitPreviewIframeRef.current) return;
    try {
      splitPreviewIframeRef.current.contentWindow?.postMessage(
        { type: 'temgine-highlight-block', blockPath: selectedBlockPath },
        '*'
      );
    } catch (_) {}
  }, [selectedBlockPath, splitPreview]);

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

  // Maps template name → field groups [{ label, vars, isGroup }]
  const templateGroupsByName = useMemo(() => {
    const out = {};
    Object.entries(templateCodes || {}).forEach(([name, code]) => {
      try {
        out[name] = extractFieldGroups(code) || [];
      } catch (e) {
        out[name] = [];
      }
    });
    return out;
  }, [templateCodes]);

  // Maps template name → repeater blocks [{ sectionName, subFields: [{ name, type }] }]
  const templateRepeatersByName = useMemo(() => {    const out = {};
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
          : type === 'blog-channel'
            ? { channelSlug: '', templateSlot: 'templateDetailPreview', templateName: '', postLimit: 6 }
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
    const selectedChannelSlug = parseChannelTemplateValue(templateName);
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        if (selectedChannelSlug) {
          cur[idx].type = 'blog-channel';
          cur[idx].template = '';
          cur[idx].props = {
            channelSlug: selectedChannelSlug,
            templateSlot: cur[idx]?.props?.templateSlot || 'templateDetailPreview',
            templateName: cur[idx]?.props?.templateName || '',
            postLimit: Number.parseInt(cur[idx]?.props?.postLimit, 10) || 6,
          };
          break;
        }

        cur[idx].template = templateName || '';
        if (cur[idx].type === 'blog-channel') {
          cur[idx].type = 'content';
        }

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

  const toggleNestedBlockHidden = (path) => {
    const copy = JSON.parse(JSON.stringify(blocks || []));
    const parts = String(path).split('.').map(p => parseInt(p, 10));
    let cur = copy;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      if (i === parts.length - 1) {
        cur[idx].hidden = !Boolean(cur[idx].hidden);
      } else {
        cur = cur[idx].children = cur[idx].children || [];
      }
    }
    setBlocks(copy);
  }

  const toggleCollapsedBlock = (path) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
      label: snippetLabels[block.template]?.[varName] || formatLabel(varName)
    }));
  };

  const flattenedBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);

  const hiddenOutlinePaths = useMemo(() => {
    if (!outlineVisibleOnly) return new Set();
    const hidden = new Set();
    const collect = (items = [], prefix = '') => {
      (items || []).forEach((item, idx) => {
        const path = prefix ? `${prefix}.${idx}` : String(idx);
        if (item?.hidden) {
          hidden.add(path);
          return;
        }
        if (Array.isArray(item?.children) && item.children.length > 0) {
          collect(item.children, path);
        }
      });
    };
    collect(blocks || []);
    return hidden;
  }, [outlineVisibleOnly, blocks]);

  const outlineFieldEntries = useMemo(() => (
    flattenedBlocks.flatMap(({ path, block, depth }) =>
      getBlockFieldEntries(block, path).map((entry) => ({ ...entry, path, depth }))
    )
  ), [flattenedBlocks, templateVariablesByName, snippetLabels]);

  function buildSingleBlockHtml(block) {
    try {
      const code = block && block.template ? templateCodes[block.template] : null;
      if (!code) {
        return '<!DOCTYPE html><html><body><p style="padding:16px;color:#888;font-family:sans-serif">Kein Template geladen</p></body></html>';
      }
      const rendered = renderTemplate(code, block.props || {});
      const cssLinkTags = enabledCssFiles
        .map(f => `    <link rel="stylesheet" href="${String(f.href || '').replace(/"/g, '&quot;')}">` )
        .join('\n');
      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:8px;font-family:sans-serif;background:#fff;color:#333}img{max-width:100%;height:auto}</style>\n${cssLinkTags}</head><body>${rendered}</body></html>`;
    } catch (e) {
      console.error('buildSingleBlockHtml failed:', e);
      return `<!DOCTYPE html><html><body><pre style="color:red;padding:16px">${String(e)}</pre></body></html>`;
    }
  }

  function buildSplitPreviewHtml() {
    try {
      const cssLinkTags = enabledCssFiles
        .map(f => `    <link rel="stylesheet" href="${String(f.href || '').replace(/"/g, '&quot;')}">`)
        .join('\n');

      const blockParts = (blocks || []).map((block, i) => {
        const code = block.template ? templateCodes[block.template] : null;
        if (!code) {
          return `<div data-temgine-block="${i}" class="temgine-block-wrap temgine-block-empty">(Block ${i + 1}: kein Template)</div>`;
        }
        const rendered = renderTemplate(code, block.props || {});
        return `<div data-temgine-block="${i}" class="temgine-block-wrap">${rendered}</div>`;
      }).join('\n');

      const interactScript = `<script>
(function() {
  var currentHighlight = null;
  function clearHighlight() {
    document.querySelectorAll('.temgine-block-wrap').forEach(function(el) {
      el.style.outline = '2px solid transparent';
    });
  }
  document.querySelectorAll('[data-temgine-block]').forEach(function(el) {
    el.style.cursor = 'pointer';
    el.style.outline = '2px solid transparent';
    el.style.transition = 'outline 0.12s';
    el.addEventListener('mouseenter', function() {
      if (currentHighlight !== el) {
        el.style.outline = '2px dashed rgba(234,88,12,0.45)';
      }
    });
    el.addEventListener('mouseleave', function() {
      if (currentHighlight !== el) {
        el.style.outline = '2px solid transparent';
      }
    });
    el.addEventListener('click', function(e) {
      clearHighlight();
      currentHighlight = el;
      el.style.outline = '2px solid rgba(234,88,12,0.9)';
      var path = el.getAttribute('data-temgine-block');
      window.parent.postMessage({ type: 'temgine-block-click', blockPath: path }, '*');
      e.stopPropagation();
    });
  });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'temgine-highlight-block') {
      clearHighlight();
      currentHighlight = null;
      var target = document.querySelector('[data-temgine-block="' + e.data.blockPath + '"]');
      if (target) {
        currentHighlight = target;
        target.style.outline = '2px solid rgba(234,88,12,0.9)';
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });
})();
<\/script>`;

      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vorschau</title>\n${cssLinkTags}\n<style>.temgine-block-empty{padding:16px;border:1px dashed #666;color:#888;font-family:sans-serif;font-size:0.8rem;margin:4px 0}</style></head><body>${blockParts}${interactScript}</body></html>`;
    } catch (e) {
      console.error('buildSplitPreviewHtml failed:', e);
      return `<!DOCTYPE html><html><body><pre style="color:red;padding:16px">${String(e)}</pre></body></html>`;
    }
  }

  function toggleBlockPreview(path) {
    setPreviewBlocks(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        setBlockPreviewHtmls(h => { const n = { ...h }; delete n[path]; return n; });
      } else {
        next.add(path);
        const b = getBlockAtPath(path);
        if (b) {
          setBlockPreviewHtmls(h => ({ ...h, [path]: buildSingleBlockHtml(b) }));
        }
      }
      return next;
    });
  }

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
      accessGroups,
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

  // Keep refs up-to-date so keyboard handler always calls latest version
  handleSaveRef.current = handleSave;
  handleSaveAndCloseRef.current = handleSaveAndClose;

  // Global keyboard shortcuts: Ctrl+S / Ctrl+Shift+S / Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === 's' || e.key === 'S') {
        // Ignore shortcut when focus is inside a text input / textarea / contenteditable
        const tag = document.activeElement?.tagName?.toUpperCase();
        const isEditable = document.activeElement?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) {
          // Allow Ctrl+S in richtext editors (they handle it themselves), but prevent default in normal inputs
          if (tag === 'INPUT' || tag === 'TEXTAREA') {
            e.preventDefault();
          } else {
            return;
          }
        } else {
          e.preventDefault();
        }
        if (e.shiftKey) {
          handleSaveAndCloseRef.current?.();
        } else {
          handleSaveRef.current?.();
        }
        return;
      }

      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        const tag = document.activeElement?.tagName?.toUpperCase();
        const isEditable = document.activeElement?.isContentEditable;
        // Let browser handle undo in text inputs
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
        handleUndoRef.current?.();
        return;
      }

      if ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        const tag = document.activeElement?.tagName?.toUpperCase();
        const isEditable = document.activeElement?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
        handleRedoRef.current?.();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!page?.id || !isDirty) {
      if (!isDirty) setAutosaveStatus('gespeichert');
      return undefined;
    }

    const autosaveEnabled = localStorage.getItem('temphelix_autosave_enabled') !== 'false';
    if (!autosaveEnabled) return undefined;

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

  // --- Undo / Redo ---
  // History entries: { blocks, title, slug, pageData }
  const undoTimerRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Push current state to history (debounced 400ms)
  useEffect(() => {
    if (historySkipNextPushRef.current) {
      historySkipNextPushRef.current = false;
      return;
    }
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      const entry = { blocks: JSON.parse(JSON.stringify(blocks)), title, slug, pageData: JSON.parse(JSON.stringify(pageData || {})) };
      const stack = historyStackRef.current;
      const idx = historyIndexRef.current;
      // Trim any future entries (after undo)
      const newStack = stack.slice(0, idx + 1);
      newStack.push(entry);
      // Cap at 50 entries
      if (newStack.length > 50) newStack.shift();
      historyStackRef.current = newStack;
      historyIndexRef.current = newStack.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    }, 400);
    return () => clearTimeout(undoTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title, slug, pageData]);

  function applyHistoryEntry(entry) {
    historySkipNextPushRef.current = true;
    setBlocks(entry.blocks);
    setTitle(entry.title);
    setSlug(entry.slug);
    setPageData(entry.pageData);
  }

  function handleUndo() {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    const newIdx = idx - 1;
    historyIndexRef.current = newIdx;
    applyHistoryEntry(historyStackRef.current[newIdx]);
    setCanUndo(newIdx > 0);
    setCanRedo(true);
  }

  function handleRedo() {
    const idx = historyIndexRef.current;
    const stack = historyStackRef.current;
    if (idx >= stack.length - 1) return;
    const newIdx = idx + 1;
    historyIndexRef.current = newIdx;
    applyHistoryEntry(stack[newIdx]);
    setCanUndo(true);
    setCanRedo(newIdx < stack.length - 1);
  }

  // Keep undo/redo refs current
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;

  // Render helpers for nested block editor
  const renderBlockEditor = (block, path, depth = 0, options = {}) => {
    const inLightbox = !!options.inLightbox;
    const isTop = depth === 0 && !inLightbox;
    const isCollapsed = collapsedBlocks.has(path);
    const templateVariables = block.template ? (templateVariablesByName[block.template] || []) : [];
    const templateGroups = block.template ? (templateGroupsByName[block.template] || []) : [];
    const hasGroupedContainers = templateGroups.some(g => g.isGroup && g.vars.length >= 2);
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
        ref={inLightbox ? undefined : ((el) => {
          if (el) {
            blockNodeRefs.current[path] = el;
          } else {
            delete blockNodeRefs.current[path];
          }
        })}
        data-block-path={path}
        className={`block-item${selectedBlockPath === path ? ' selected' : ''}${block?.hidden ? ' is-hidden' : ''}${isCollapsed ? ' is-collapsed' : ''}${inLightbox ? ' block-item-lightbox' : ''}`}
        style={{ marginLeft: inLightbox ? 0 : depth * 16 }}
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
                value={block.type === 'blog-channel' ? makeChannelTemplateValue(block.props?.channelSlug || '') : (block.template || '')}
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
                {channelTemplateOptions.length > 0 && <option disabled>──────────</option>}
                {channelTemplateOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                  <button type="button" className={`block-move-btn${previewBlocks.has(path) ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleBlockPreview(path); }} title="Inline-Vorschau">
                    <Monitor size={12} /></button>
                  <button
                    type="button"
                    className={`block-move-btn${block?.hidden ? ' active block-hidden-toggle' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleNestedBlockHidden(path); }}
                    title={block?.hidden ? 'Block einblenden' : 'Block ausblenden'}
                    aria-label={block?.hidden ? 'Block einblenden' : 'Block ausblenden'}
                  >
                    {block?.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    type="button"
                    className={`block-move-btn${isCollapsed ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleCollapsedBlock(path); }}
                    title={isCollapsed ? 'Block maximieren' : 'Block minimieren'}
                    aria-label={isCollapsed ? 'Block maximieren' : 'Block minimieren'}
                  >
                    {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                  </button>
                  <button
                    type="button"
                    className="block-move-btn"
                    onClick={(e) => { e.stopPropagation(); setLightboxBlockPath(path); setSelectedBlockPath(path); }}
                    title="Block in Lightbox bearbeiten"
                    aria-label="Block in Lightbox bearbeiten"
                  >
                    <LayoutGrid size={12} />
                  </button>
                </div>
              );
            })()}
            <small className="block-kindblock-count">
              {Array.isArray(block.children) ? block.children.length : 0} Kindblöcke
            </small>
          </div>
        </div>

        {/* Block Content */}
        {!isCollapsed && <div className="block-card-body">
          {/* Template specific fields (reuse existing logic) */}
          {block.template && templateCodes[block.template] && (
            <div>
              {/* Grid layout for non-textarea fields */}
              {(() => {
                // Helper: render a single field-item for a varName
                const renderFieldItem = (varName) => {
                  const inputType = resolveInputType(varName);
                  const value = block.props[varName] || '';
                  const label = snippetLabels[block.template]?.[varName] || formatLabel(varName);
                  const expandBtn = (
                    <button
                      type="button"
                      className="field-expand-btn"
                      onClick={e => { e.stopPropagation(); setExpandedField({ varName, label, value, inputType, blockPath: path }); }}
                      aria-label={`${label} vergrößern`}
                      title="Vergrößert anzeigen"
                    >
                      <Maximize2 size={10} />
                    </button>
                  );

                  if (varName.toLowerCase().includes('headinglevel')) {
                    const normalizedLevel = String(value || '2').replace(/^h/i, '');
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{label}</label>
                        {expandBtn}
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
                    );
                  }

                  if (inputType === 'image') {
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{label}</label>
                        {expandBtn}
                        <div className="field-url-row">
                          <input ref={(el) => setFieldRef(path, varName, el)} type="text" placeholder="Bild-URL" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                          <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small" title={devTitle(`Bild fuer Feld ${label} auswaehlen`)} aria-label={`Bild fuer Feld ${label} auswaehlen`}>📁 Bild</button>
                        </div>
                        {value && (
                          <div className="field-image-thumb-row">
                            <img src={value} alt="" className="field-image-thumb" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isUrlVariable(varName)) {
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{label}</label>
                        {expandBtn}
                        <div className="field-url-row">
                          <input ref={(el) => setFieldRef(path, varName, el)} type="text" placeholder="URL oder Dateipfad" value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                          <button type="button" onClick={() => openFileModal((url) => updateNestedBlock(path, { [varName]: url }))} className="btn-modern-small field-input-full" title={devTitle(`Datei fuer Feld ${label} auswaehlen`)} aria-label={`Datei fuer Feld ${label} auswaehlen`}>📁 Datei</button>
                        </div>
                      </div>
                    );
                  }

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
                    const headingExpandBtn = (
                      <button
                        type="button"
                        className="field-expand-btn"
                        onClick={e => { e.stopPropagation(); setExpandedField({ varName, label, value: textValue, inputType: 'heading', blockPath: path, headingLevelValue: levelValue }); }}
                        aria-label={`${label} vergrößern`}
                        title="Vergrößert anzeigen"
                      >
                        <Maximize2 size={10} />
                      </button>
                    );
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{label}</label>
                        {headingExpandBtn}
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
                    );
                  }

                  if (inputType === 'array') {
                    return (
                      <div key={varName} className="field-item">
                        <label className="field-label-xs">{label}</label>
                        {expandBtn}
                        <textarea ref={(el) => setFieldRef(path, varName, el)} placeholder="Ein Wert pro Zeile" value={Array.isArray(value) ? value.join('\n') : ''} onChange={e => updateNestedBlock(path, { [varName]: e.target.value.split('\n').filter(v => v.trim()) })} rows={2} className="input-field-small field-input-full field-array-textarea" />
                      </div>
                    );
                  }

                  if (inputType === 'textarea') {
                    return (
                      <div key={varName} className="field-item field-item-textarea">
                        <label className="field-label-xs">{label}</label>
                        <div ref={(el) => setFieldRef(path, varName, el)} className="field-quill-wrapper">
                          <RichTextEditor value={value || ''} onChange={(val) => updateNestedBlock(path, { [varName]: val })} toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']} />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={varName} className="field-item">
                      <label className="field-label-xs">{label}</label>
                      {expandBtn}
                      <input ref={(el) => setFieldRef(path, varName, el)} type={inputType === 'number' ? 'number' : 'text'} placeholder={varName} value={value} onChange={e => updateNestedBlock(path, { [varName]: e.target.value })} className="input-field-small field-input-full" />
                    </div>
                  );
                };

                const groups = templateGroups;
                const nonTextareaVars = templateVariables.filter(v => resolveInputType(v) !== 'textarea');

                // If no meaningful groups, render flat as before
                const hasGroups = hasGroupedContainers;
                if (!hasGroups) {
                  return (
                    <div className="block-fields-grid">
                      {nonTextareaVars.map(varName => renderFieldItem(varName))}
                    </div>
                  );
                }

                // Render groups
                const coveredByGroups = new Set(groups.flatMap(g => g.vars));
                const ungroupedVars = templateVariables.filter(v => !coveredByGroups.has(v));

                return (
                  <div className="block-fields-grid">
                    {groups.map((group) => {
                      const groupVars = group.vars;
                      if (groupVars.length === 0) return null;
                      if (group.isGroup && groupVars.length >= 2) {
                        return (
                          <div key={`grp-${group.vars[0]}`} className="field-group">
                            {group.label && <div className="field-group-label">{formatLabel(group.label)}</div>}
                            <div className="field-group-inner">
                              {groupVars.map(varName => renderFieldItem(varName))}
                            </div>
                          </div>
                        );
                      }
                      return groupVars.map(varName => renderFieldItem(varName));
                    })}
                    {ungroupedVars.map(varName => renderFieldItem(varName))}
                  </div>
                );
              })()}

              {/* Separate textarea fields (full width) - NACH dem Grid */}
              {!hasGroupedContainers && templateVariables
                .filter(varName => resolveInputType(varName) === 'textarea')
                .map(varName => {
                  const value = block.props[varName] || '';
                  const label = snippetLabels[block.template]?.[varName] || formatLabel(varName);
                  return (
                    <div key={varName} className="field-item field-item-textarea">
                      <label className="field-label-xs">{label}</label>
                      <div ref={(el) => setFieldRef(path, varName, el)} className="field-quill-wrapper">
                        <RichTextEditor value={value || ''} onChange={(val) => updateNestedBlock(path, { [varName]: val })} toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']} />
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
                      <label className="field-label-xs field-repeater-label">{formatLabel(sectionName)}</label>
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
                          <div className="repeater-row-header">
                            <span className="repeater-row-num">Eintrag {rowIdx + 1}</span>
                            <div className="repeater-row-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  if (rowIdx === 0) return;
                                  const next = [...rows];
                                  [next[rowIdx - 1], next[rowIdx]] = [next[rowIdx], next[rowIdx - 1]];
                                  updateNestedBlock(path, { [sectionName]: next });
                                }}
                                className="repeater-row-move"
                                disabled={rowIdx === 0}
                                title="Nach oben verschieben"
                              ><ChevronUp size={13} /></button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (rowIdx === rows.length - 1) return;
                                  const next = [...rows];
                                  [next[rowIdx], next[rowIdx + 1]] = [next[rowIdx + 1], next[rowIdx]];
                                  updateNestedBlock(path, { [sectionName]: next });
                                }}
                                className="repeater-row-move"
                                disabled={rowIdx === rows.length - 1}
                                title="Nach unten verschieben"
                              ><ChevronDown size={13} /></button>
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = { ...row };
                                  const next = [...rows.slice(0, rowIdx + 1), copy, ...rows.slice(rowIdx + 1)];
                                  updateNestedBlock(path, { [sectionName]: next });
                                }}
                                className="repeater-row-duplicate"
                                title={`Eintrag ${rowIdx + 1} duplizieren`}
                                aria-label={`Eintrag ${rowIdx + 1} aus ${sectionName} duplizieren`}
                              >⧉ Duplizieren</button>
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
                          <div className="repeater-row-fields">
                            {subFields.map(sf => {
                              const sfVal = row[sf.name] !== undefined ? row[sf.name] : '';
                              if (sf.type === 'textarea') {
                                return (
                                  <div key={sf.name} className="repeater-subfield repeater-subfield-wide">
                                    <label className="field-label-xs">{formatLabel(sf.name)}</label>
                                    <div className="field-quill-wrapper">
                                      <RichTextEditor
                                        value={sfVal}
                                        onChange={val => {
                                          const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: val } : r);
                                          updateNestedBlock(path, { [sectionName]: next });
                                        }}
                                        toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']}
                                      />
                                    </div>
                                  </div>
                                );
                              }
                              if (sf.type === 'image' || sf.type === 'url') {
                                return (
                                  <div key={sf.name} className="repeater-subfield">
                                    <label className="field-label-xs">{formatLabel(sf.name)}</label>
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
                                    {sf.type === 'image' && sfVal && (
                                      <div className="field-image-thumb-row">
                                        <img src={sfVal} alt="" className="field-image-thumb" onClick={() => openFileModal((url) => {
                                          const next = rows.map((r, i) => i === rowIdx ? { ...r, [sf.name]: url } : r);
                                          updateNestedBlock(path, { [sectionName]: next });
                                        })} />
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div key={sf.name} className="repeater-subfield">
                                  <label className="field-label-xs">{formatLabel(sf.name)}</label>
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
                        </div>
                      ))}
                    </div>
                    <div className="field-repeater-header">
                      <label className="field-label-xs field-repeater-label">{formatLabel(sectionName)} ende</label>
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
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback simple text/gallery editors when no template */}
          {/* Blog-Kanal block editor */}
          {block.type === 'blog-channel' && (
            <div className="blog-channel-editor">
              <div className="blog-channel-editor__field">
                <label className="block-field-label">Kanal</label>
                <select
                  className="block-template-select"
                  value={block.props.channelSlug || ''}
                  onChange={e => updateNestedBlock(path, { channelSlug: e.target.value })}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">-- Kanal wählen --</option>
                  {blogChannels.map(ch => (
                    <option key={ch.id} value={ch.slug}>{ch.name} ({ch.slug})</option>
                  ))}
                </select>
              </div>
              <div className="blog-channel-editor__field">
                <label className="block-field-label">Darstellung</label>
                <select
                  className="block-template-select"
                  value={block.props?.templateName ? String(block.props.templateName) : ''}
                  onChange={e => {
                    const selected = String(e.target.value || '');
                    updateNestedBlock(path, { templateName: selected });
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">Master-Template des Kanals verwenden</option>
                  {blogTemplates.map(t => (
                    <option key={t.id || t.name} value={t.name}>{`Template: ${t.name}`}</option>
                  ))}
                </select>
                <p className="blog-channel-editor__hint">
                  Wähle ein beliebiges Master/Vorschau-Template oder nutze das Master-Template des Kanals.
                </p>
              </div>
              <div className="blog-channel-editor__field">
                <label className="block-field-label">Max. Beiträge</label>
                <input
                  type="number"
                  className="input-field-small"
                  min={1}
                  max={100}
                  value={block.props.postLimit ?? 6}
                  onChange={e => updateNestedBlock(path, { postLimit: parseInt(e.target.value, 10) || 6 })}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 80 }}
                />
              </div>
              {block.props.channelSlug && (
                <div className="blog-channel-editor__preview">
                  <span style={{ fontSize: 11, opacity: .6 }}>Kanal: </span>
                  <code style={{ fontSize: 11 }}>/{block.props.channelSlug}</code>
                  <span style={{ marginLeft: 10, fontSize: 11, opacity: .6 }}>Template: </span>
                  <code style={{ fontSize: 11 }}>
                    {block.props.templateName || 'Kanal-Master'}
                  </code>
                </div>
              )}
            </div>
          )}

          {!block.template && block.type === 'text' && (
            <>
              <input ref={(el) => setFieldRef(path, 'title', el)} type="text" placeholder="Titel" value={block.props.title || ''} onChange={e => updateNestedBlock(path, { title: e.target.value })} className="input-field-small field-input-full" style={{ marginBottom: 8 }} />
              <div ref={(el) => setFieldRef(path, 'content', el)} className="field-quill-wrapper">
                <RichTextEditor value={block.props.content || ''} onChange={(val) => updateNestedBlock(path, { content: val })} toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']} />
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
          {(block.children || []).map((child, i) => renderBlockEditor(child, `${path}.${i}`, depth + 1, options))}
        </div>
        }

        {/* Inline block preview */}
        {!isCollapsed && previewBlocks.has(path) && (
          <div className="block-inline-preview-wrap">
            <div className="block-inline-preview-head">
              <span className="block-inline-preview-label">Vorschau</span>
              <button
                type="button"
                className="block-move-btn"
                title="Vorschau aktualisieren"
                onClick={() => {
                  const b = getBlockAtPath(path);
                  if (b) setBlockPreviewHtmls(prev => ({ ...prev, [path]: buildSingleBlockHtml(b) }));
                }}
              >↻</button>
            </div>
            <iframe
              srcDoc={blockPreviewHtmls[path] || ''}
              sandbox="allow-scripts allow-same-origin"
              className="block-inline-preview-frame"
              title="Block-Vorschau"
            />
          </div>
        )}
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
              className={`pe-tb-btn${splitPreview ? ' pe-tb-btn-active' : ''}`}
              onClick={() => {
                const next = !splitPreview;
                setSplitPreview(next);
                if (next) setSplitPreviewHtml(buildSplitPreviewHtml());
              }}
              title="Editor und Vorschau nebeneinander (interaktiv)"
            >
              <Columns size={14} /> Split
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
            <button
              type="button"
              className="pe-tb-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Rückgängig (Strg+Z)"
              aria-label="Rückgängig"
            >
              ↩
            </button>
            <button
              type="button"
              className="pe-tb-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Wiederholen (Strg+Y)"
              aria-label="Wiederholen"
            >
              ↪
            </button>
            <div className="pe-toolbar-sep" />
            <button type="button" className="pe-tb-btn pe-tb-btn-ghost" onClick={handleSaveAndView} title={devTitle('Seite speichern und im Frontend anzeigen')}>Speichern &amp; Anzeigen</button>
            <button type="button" className="pe-tb-btn pe-tb-btn-ghost" onClick={handleSaveAndClose} title="Seite speichern und Editor schließen (Strg+Umschalt+S)">Speichern &amp; Schließen</button>
            <button type="button" className="pe-tb-btn pe-tb-btn-primary" onClick={handleSave} title="Seite speichern (Strg+S)">Speichern</button>
            <span
              className={`pe-autosave-indicator${autosaveStatus === 'fehler' ? ' error' : autosaveStatus === 'speichert' ? ' saving' : ''}`}
              aria-live="polite"
            >
              {autosaveStatus === 'speichert' ? 'speichert…' : autosaveStatus === 'fehler' ? '⚠ Fehler' : '✓'}
            </span>
          </div>
        </div>

        <div className={`page-editor-workspace${splitPreview ? ' workspace-split' : ''}`}>
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

          {splitPreview && (
            <div className="page-split-preview">
              <div className="page-split-preview-head">
                <span className="page-split-preview-label">Live-Vorschau — Klick zum Auswählen</span>
                <button
                  type="button"
                  className="btn-modern-small hollow"
                  onClick={() => setSplitPreviewHtml(buildSplitPreviewHtml())}
                  title="Vorschau aktualisieren"
                >↻</button>
              </div>
              <iframe
                ref={splitPreviewIframeRef}
                srcDoc={splitPreviewHtml}
                sandbox="allow-scripts allow-same-origin"
                className="page-split-preview-iframe"
                title="Split-Vorschau"
              />
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
                      className="pe-tb-btn inspector-ga-blogchannel"
                      onClick={() => { const p = String((blocks || []).length); handleAddBlock('blog-channel'); setSelectedBlockPath(p); }}
                      title={devTitle('Blog-Kanal-Block anlegen')}
                    >
                      <Plus size={13} /> Blog-Kanal
                    </button>
                    <button
                      type="button"
                      className="pe-tb-btn inspector-ga-kindblock"
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
                                    const label = (snippetLabels[selectedBlock.template]?.[varName]) || formatLabel(varName);
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
                        <label className="page-editor-outline-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(pageData?.ignoreInNavigation)}
                            onChange={e => setPageData(d => ({ ...d, ignoreInNavigation: e.target.checked }))}
                          />
                          In Navigation ausblenden
                        </label>
                        {/* Access Control */}
                        <AccessGroupsPanel
                          accessGroups={accessGroups}
                          onChange={setAccessGroups}
                          availableGroups={availableMemberGroups}
                          onLoadGroups={() => {
                            if (availableMemberGroups.length === 0) {
                              fetch('/api/admin/member-groups')
                                .then(r => r.json())
                                .then(d => setAvailableMemberGroups(Array.isArray(d) ? d : []))
                                .catch(() => {});
                            }
                          }}
                        />
                        <label className="field-label-xs" style={{marginTop:'10px'}}>Wrapper-Klasse</label>
                        <input
                          type="text"
                          value={pageData.wrapperClass || ''}
                          onChange={e => setPageData(d => ({ ...d, wrapperClass: e.target.value }))}
                          placeholder="z.B. page-home dark-theme"
                          className="input-field-small"
                          aria-label="CSS-Klasse für den Seiten-Wrapper"
                        />
                        <label className="field-label-xs">Wrapper-ID</label>
                        <input
                          type="text"
                          value={pageData.wrapperId || ''}
                          onChange={e => setPageData(d => ({ ...d, wrapperId: e.target.value }))}
                          placeholder="z.B. main-page"
                          className="input-field-small"
                          aria-label="ID für den Seiten-Wrapper"
                        />
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
                        <label className="page-editor-outline-toggle" style={{ marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            checked={outlineVisibleOnly}
                            onChange={e => setOutlineVisibleOnly(e.target.checked)}
                          />
                          Nur sichtbare Blöcke anzeigen
                        </label>
                        <TemplateStructurePreview
                          blocks={blocks}
                          hiddenBlockPaths={hiddenOutlinePaths}
                          activeBlockPath={selectedBlockPath}
                          onBlockClick={blocks.length > 0 ? handleStructureBlockClick : null}
                        />
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

      {/* Live-Vorschau Overlay */}
      {showPreview && (
        <div
          className="page-preview-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowPreview(false); }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Seiten-Vorschau"
        >
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
                  ↻ Aktualisieren
                </button>
                <button
                  type="button"
                  className="btn-modern-small red hollow"
                  onClick={() => setShowPreview(false)}
                  title="Vorschau schließen (Esc)"
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
        </div>
      )}

      {lightboxBlockPath && typeof window !== 'undefined' && (() => {
        const lightboxBlock = getBlockAtPath(lightboxBlockPath);
        if (!lightboxBlock) return null;
        return createPortal(
          <div className={`admin-scope${adminScopeRef.current?.closest('.dark-mode') ? ' dark-mode' : ''} block-lightbox-portal`} onClick={() => setLightboxBlockPath('')}>
            <div className="block-lightbox-overlay" onClick={() => setLightboxBlockPath('')}>
              <div className="block-lightbox" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Block bearbeiten">
                <div className="block-lightbox-header">
                  <strong className="block-lightbox-label">Block #{formatBlockNumber(lightboxBlockPath)} bearbeiten</strong>
                  <button type="button" className="block-lightbox-close" onClick={() => setLightboxBlockPath('')} aria-label="Schließen">✕</button>
                </div>
                <div className="block-lightbox-body">
                  {renderBlockEditor(lightboxBlock, lightboxBlockPath, 0, { inLightbox: true })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Field Expand Lightbox */}
      <span ref={adminScopeRef} style={{display:'none'}} />
      {expandedField && typeof window !== 'undefined' && createPortal(
        <div className={`admin-scope${adminScopeRef.current?.closest('.dark-mode') ? ' dark-mode' : ''} field-lightbox-portal`} onClick={() => setExpandedField(null)}>
        <div className="field-lightbox-overlay" onClick={() => setExpandedField(null)}>
          <div className="field-lightbox" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Feld: ${expandedField.label}`}>
            <div className="field-lightbox-header">
              <span className="field-lightbox-label">{expandedField.label}</span>
              <button
                type="button"
                className="field-lightbox-close"
                onClick={() => setExpandedField(null)}
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>
            <div className="field-lightbox-body">
              {expandedField.inputType === 'heading' ? (
                <>
                  <div className="field-lightbox-heading-row">
                    <label className="field-lightbox-sublabel">Ebene</label>
                    <select
                      className="field-lightbox-select"
                      value={expandedField.headingLevelValue || 'h2'}
                      onChange={e => {
                        const lv = e.target.value;
                        const tx = expandedField.value;
                        setExpandedField(f => ({ ...f, headingLevelValue: lv }));
                        const vn = expandedField.varName;
                        updateNestedBlock(expandedField.blockPath, {
                          [`${vn}Level`]: lv,
                          [`${vn}Text`]: tx,
                          [vn]: `<${lv}>${tx}</${lv}>`
                        });
                      }}
                    >
                      <option value="h1">H1</option>
                      <option value="h2">H2</option>
                      <option value="h3">H3</option>
                      <option value="h4">H4</option>
                      <option value="h5">H5</option>
                    </select>
                  </div>
                  <textarea
                    className="field-lightbox-textarea"
                    placeholder="Heading-Text"
                    value={expandedField.value}
                    onChange={e => {
                      const tx = e.target.value;
                      const lv = expandedField.headingLevelValue || 'h2';
                      const vn = expandedField.varName;
                      setExpandedField(f => ({ ...f, value: tx }));
                      updateNestedBlock(expandedField.blockPath, {
                        [`${vn}Level`]: lv,
                        [`${vn}Text`]: tx,
                        [vn]: `<${lv}>${tx}</${lv}>`
                      });
                    }}
                    autoFocus
                  />
                </>
              ) : expandedField.inputType === 'image' ? (
                <>
                  <input
                    type="text"
                    className="field-lightbox-input"
                    placeholder="Bild-URL"
                    value={expandedField.value}
                    onChange={e => {
                      const v = e.target.value;
                      setExpandedField(f => ({ ...f, value: v }));
                      updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: v });
                    }}
                    autoFocus
                  />
                  <button type="button" className="field-lightbox-file-btn" onClick={() => openFileModal((url) => {
                    setExpandedField(f => ({ ...f, value: url }));
                    updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: url });
                  })}>📁 Bild auswählen</button>
                  {expandedField.value && (
                    <div className="field-lightbox-preview">
                      <img src={expandedField.value} alt="" />
                    </div>
                  )}
                </>
              ) : expandedField.inputType === 'number' ? (
                <input
                  type="number"
                  className="field-lightbox-input"
                  placeholder={expandedField.varName}
                  value={expandedField.value}
                  onChange={e => {
                    const v = e.target.value;
                    setExpandedField(f => ({ ...f, value: v }));
                    updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: v });
                  }}
                  autoFocus
                />
              ) : expandedField.inputType === 'url' ? (
                <>
                  <input
                    type="text"
                    className="field-lightbox-input"
                    placeholder="URL oder Dateipfad"
                    value={expandedField.value}
                    onChange={e => {
                      const v = e.target.value;
                      setExpandedField(f => ({ ...f, value: v }));
                      updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: v });
                    }}
                    autoFocus
                  />
                  <button type="button" className="field-lightbox-file-btn" onClick={() => openFileModal((url) => {
                    setExpandedField(f => ({ ...f, value: url }));
                    updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: url });
                  })}>📁 Datei auswählen</button>
                </>
              ) : expandedField.inputType === 'array' ? (
                <>
                  <p className="field-lightbox-hint">Ein Wert pro Zeile</p>
                  <textarea
                    className="field-lightbox-textarea"
                    placeholder="Ein Wert pro Zeile"
                    value={Array.isArray(expandedField.value) ? expandedField.value.join('\n') : expandedField.value}
                    onChange={e => {
                      const raw = e.target.value;
                      const arr = raw.split('\n').filter(v => v.trim());
                      setExpandedField(f => ({ ...f, value: arr }));
                      updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: arr });
                    }}
                    autoFocus
                  />
                </>
              ) : (
                /* textarea, text, date – large editable area */
                <textarea
                  className="field-lightbox-textarea"
                  placeholder={expandedField.varName}
                  value={expandedField.value}
                  onChange={e => {
                    const v = e.target.value;
                    setExpandedField(f => ({ ...f, value: v }));
                    updateNestedBlock(expandedField.blockPath, { [expandedField.varName]: v });
                  }}
                  autoFocus
                />
              )}
            </div>
          </div>
        </div>
        </div>,
        document.body
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

function AccessGroupsPanel({ accessGroups, onChange, availableGroups, onLoadGroups }) {
  const [expanded, setExpanded] = useState(false);

  const accessMode = accessGroups.length === 0
    ? 'public'
    : accessGroups[0] === '*'
    ? 'all-members'
    : 'specific';

  function handleModeChange(mode) {
    if (mode === 'public') onChange([]);
    else if (mode === 'all-members') onChange(['*']);
    else {
      onLoadGroups();
      onChange([]);
    }
    setExpanded(mode === 'specific');
  }

  function toggleGroup(slug) {
    const current = accessGroups.filter(g => g !== '*');
    if (current.includes(slug)) {
      onChange(current.filter(g => g !== slug));
    } else {
      onChange([...current, slug]);
    }
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <label className="field-label-xs">Zugangskontrolle</label>
      <select
        className="input-field-small"
        value={accessMode}
        onChange={e => handleModeChange(e.target.value)}
        aria-label="Zugangskontrolle"
      >
        <option value="public">Öffentlich (alle)</option>
        <option value="all-members">Alle Mitglieder</option>
        <option value="specific">Bestimmte Gruppen</option>
      </select>
      {accessMode === 'specific' && (
        <div style={{ marginTop: '6px', paddingLeft: '2px' }}>
          {availableGroups.length === 0 && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Keine Gruppen vorhanden.</span>
          )}
          {availableGroups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginBottom: '4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={accessGroups.includes(g.slug)}
                onChange={() => toggleGroup(g.slug)}
              />
              {g.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
