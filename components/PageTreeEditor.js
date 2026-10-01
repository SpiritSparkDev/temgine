import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  FileText,
  FolderInput,
  Globe,
  Grid,
  GripVertical,
  Indent,
  List,
  Outdent,
  Plus,
  Search,
  Square,
  Trash2,
  Users,
} from '../lib/muiIcons';
import Toast from './Toast';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/workflow';
import { getPageRedirect } from '../lib/pageRedirect';


export default function PageTreeEditor({ pages, onSelect, onUpdate, userRole, onRefreshPages }) {
  const [tree, setTree] = useState([]);
  const [viewMode, setViewModeState] = useState('cards'); // 'cards' or 'table'
  useEffect(() => {
    const saved = sessionStorage.getItem('pageTreeViewMode');
    if (saved === 'cards' || saved === 'table') setViewModeState(saved);
  }, []);
  const setViewMode = (mode) => {
    setViewModeState(mode);
    sessionStorage.setItem('pageTreeViewMode', mode);
  };
  const [newTitle, setNewTitle] = useState('');  const [newNavigation, setNewNavigation] = useState('');  const [navigations, setNavigations] = useState([]);
  const [footers, setFooters] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);
  const [iframeLoaded, setIframeLoaded] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [targetPicker, setTargetPicker] = useState(null); // { mode: 'move'|'copy' }
  const [draggedId, setDraggedId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); // { id, position: 'before'|'after'|'inside' }
  const [addMenuOpenId, setAddMenuOpenId] = useState(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState(null); // { top, left } in Viewport-Koordinaten
  const [showAddTypeMenu, setShowAddTypeMenu] = useState(false); // Dropdown am Haupt-"Seite hinzufügen"-Button
  const thumbObserverRef = useRef(null);

  // Schließt das "Hinzufügen"-Menü bei Klick außerhalb (Menü selbst lebt
  // dank createPortal außerhalb der Karte, daher Prüfung über CSS-Klassen
  // statt eines DOM-Refs auf einen gemeinsamen Container)
  useEffect(() => {
    if (!addMenuOpenId) return;
    const handleOutside = (e) => {
      if (e.target.closest && e.target.closest('.page-add-menu, .page-add-menu-trigger')) return;
      setAddMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [addMenuOpenId]);

  useEffect(() => {
    if (!showAddTypeMenu) return;
    const handleOutside = (e) => {
      if (e.target.closest && e.target.closest('.page-add-type-menu-wrap')) return;
      setShowAddTypeMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAddTypeMenu]);

  function toggleAddMenu(e, nodeId) {
    if (addMenuOpenId === nodeId) {
      setAddMenuOpenId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setAddMenuAnchor({ top: rect.bottom + 4, left: rect.left });
    setAddMenuOpenId(nodeId);
  }

  function renderAddMenu(node) {
    if (addMenuOpenId !== node.id || !addMenuAnchor || typeof document === 'undefined') return null;
    return createPortal(
      <div className="page-add-menu" style={{ position: 'fixed', top: addMenuAnchor.top, left: addMenuAnchor.left }}>
        <button onClick={() => { setAddMenuOpenId(null); handleAdd(node.id); }}>
          <Plus size={14} /> Unterseite hinzufügen
        </button>
        <button onClick={() => { setAddMenuOpenId(null); handleAddSibling(node.id); }}>
          <Users size={14} /> Geschwisterseite hinzufügen
        </button>
        <button onClick={() => { setAddMenuOpenId(null); handleDuplicate(node.id); }}>
          <Copy size={14} /> Duplizieren
        </button>
        <div className="page-add-menu-sep" />
        <button onClick={() => { setAddMenuOpenId(null); handleAdd(node.id, 'permanent'); }}>
          <Plus size={14} /> Unterseite: Permanente Weiterleitung
        </button>
        <button onClick={() => { setAddMenuOpenId(null); handleAdd(node.id, 'temporary'); }}>
          <Plus size={14} /> Unterseite: Temporäre Weiterleitung
        </button>
        <button onClick={() => { setAddMenuOpenId(null); handleAddSibling(node.id, 'permanent'); }}>
          <Users size={14} /> Geschwisterseite: Permanente Weiterleitung
        </button>
        <button onClick={() => { setAddMenuOpenId(null); handleAddSibling(node.id, 'temporary'); }}>
          <Users size={14} /> Geschwisterseite: Temporäre Weiterleitung
        </button>
      </div>,
      document.body
    );
  }

  useEffect(() => {
    setTree(pages || []);
  }, [pages]);

  // Preview thumbnails load once a card scrolls into view (no hover needed)
  // and stay cached — the iframe only reloads when its page's updatedAt
  // changes, i.e. after a save (see cache-busting src below).
  useEffect(() => {
    thumbObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.dataset.nodeId;
        setIframeLoaded(prev => (prev[id] ? prev : { ...prev, [id]: true }));
        thumbObserverRef.current.unobserve(entry.target);
      });
    }, { rootMargin: '200px' });
    return () => thumbObserverRef.current && thumbObserverRef.current.disconnect();
  }, []);

  const observeThumbCard = useCallback((el) => {
    if (el && thumbObserverRef.current) thumbObserverRef.current.observe(el);
  }, []);

  useEffect(() => {
    fetch('/api/navigations')
      .then(r => r.json())
      .then(data => setNavigations(Array.isArray(data) ? data : []))
      .catch(err => console.error('Navigationen laden fehlgeschlagen:', err));
  }, []);

  useEffect(() => {
    fetch('/api/footers')
      .then(r => r.json())
      .then(data => setFooters(Array.isArray(data) ? data : []))
      .catch(err => console.error('Footer laden fehlgeschlagen:', err));
  }, []);

  // Shared tree helpers — previously duplicated inline per handler (handleAdd,
  // handleAddSibling, handleDuplicate each had their own copy of makeSlug/
  // getAllSlugs). Pulled out once so bulk move/copy can reuse the exact same
  // slug-collision logic across every selected page and all of its children.
  const slugify = (text, fallback = 'seite') => {
    const result = String(text || fallback)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return result || fallback;
  };

  const getAllSlugs = (nodes) => {
    const slugs = new Set();
    const collect = (items) => {
      for (const n of items || []) {
        if (n.slug) slugs.add(n.slug);
        collect(n.children || []);
      }
    };
    collect(nodes);
    return slugs;
  };

  const findNodeById = (nodes, id) => {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const found = findNodeById(n.children || [], id);
      if (found) return found;
    }
    return null;
  };

  // Returns `base` unchanged if free, otherwise `${base}-2`, `${base}-3`, ...
  // — mutates `usedSlugs` so a caller generating several slugs in one batch
  // (bulk duplicate, or duplicate's own recursive children) never reuses one
  // it just picked two steps earlier.
  const uniqueSlugFrom = (base, usedSlugs) => {
    let slug = base;
    if (usedSlugs.has(slug)) {
      let counter = 2;
      while (usedSlugs.has(`${base}-${counter}`)) counter++;
      slug = `${base}-${counter}`;
    }
    usedSlugs.add(slug);
    return slug;
  };

  const filteredTree = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tree;

    const filterNodes = (nodes) => nodes.reduce((acc, node) => {
      const children = filterNodes(node.children || []);
      const nodeNav = navigations.find(n => n.id === node.data?.pageNav);
      const nodeFooter = footers.find(f => f.id === node.data?.pageFooter);
      const haystack = [node.title, node.slug, nodeNav?.name, nodeFooter?.name, node.status].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term) || children.length > 0) {
        acc.push({ ...node, children });
      }
      return acc;
    }, []);

    return filterNodes(tree);
  }, [searchTerm, tree]);

  async function handleAdd(parentId = null, redirectType = null) {
    const id = Math.random().toString(36).substr(2, 9);
    const isRedirect = redirectType === 'permanent' || redirectType === 'temporary';
    const title = newTitle || (isRedirect ? 'Neue Weiterleitung' : 'Neue Seite');
    const slug = uniqueSlugFrom(slugify(title, 'neue-seite'), getAllSlugs(tree));
    const newPage = {
      id,
      title,
      slug,
      children: [],
      blocks: [],
      status: 'DRAFT',
      data: {
        ...(newNavigation ? { pageNav: newNavigation } : {}),
        ...(isRedirect ? { redirect: { type: redirectType, url: '', target: '_self' } } : {}),
      },
    };
    if (!parentId) {
      const updated = [...tree, newPage];
      setTree(updated);
      if (onUpdate) await onUpdate(updated);
    } else {
      let parentFound = false;
      const addChild = (nodes) => nodes.map(n => {
        if (n.id === parentId) {
          parentFound = true;
          return { ...n, children: [...(n.children || []), newPage] };
        }
        return { ...n, children: addChild(n.children || []) };
      });
      const updated = addChild(tree);
      if (!parentFound) {
        // Übergeordnete Seite wurde nicht gefunden (z. B. veraltete ID nach
        // gleichzeitiger Änderung) — lieber sichtbar fehlschlagen, statt die
        // neue Seite unbemerkt als Top-Level-Seite landen zu lassen.
        setToast({ message: 'Übergeordnete Seite nicht gefunden. Bitte Seite neu laden und erneut versuchen.', type: 'error' });
        return;
      }
      setTree(updated);
      if (onUpdate) await onUpdate(updated);
    }
    setNewTitle('');
    setNewNavigation('');
    // Reload tree from DB so node.id matches the real CUID assigned by Prisma.
    // Without this, publish/workflow calls fail with 404 because they send the
    // temporary random frontend-ID instead of the actual DB record ID.
    if (onRefreshPages) await onRefreshPages();
  }

  async function handleDuplicate(nodeId) {
    const source = findNodeById(tree, nodeId);
    if (!source) return;

    // Shared across the whole cloned subtree so a page named e.g. "x-kopie"
    // (or duplicating twice) can't produce two siblings with the same slug —
    // each generated slug is checked against every slug used so far, Instead
    // of just the source page's own slug in isolation.
    const usedSlugs = getAllSlugs(tree);
    const deepClone = (node) => {
      const base = JSON.parse(JSON.stringify(node));
      const slug = uniqueSlugFrom(slugify(base.slug + '-kopie'), usedSlugs);
      return {
        ...base,
        id: Math.random().toString(36).substr(2, 9),
        slug,
        title: base.title + ' (Kopie)',
        status: 'DRAFT',
        children: (base.children || []).map(deepClone),
      };
    };

    const duplicate = deepClone(source);

    // Insert duplicate directly after source at the same level
    const insertAfter = (nodes) => {
      const idx = nodes.findIndex(n => n.id === nodeId);
      if (idx !== -1) {
        const updated = [...nodes];
        updated.splice(idx + 1, 0, duplicate);
        return updated;
      }
      return nodes.map(n => ({ ...n, children: insertAfter(n.children || []) }));
    };

    const updated = insertAfter(tree);
    setTree(updated);
    if (onUpdate) await onUpdate(updated);
    if (onRefreshPages) await onRefreshPages();
    setToast({ message: `"${source.title}" dupliziert.`, type: 'success' });
  }

  async function handleAddSibling(nodeId, redirectType = null) {
    const id = Math.random().toString(36).substr(2, 9);
    const isRedirect = redirectType === 'permanent' || redirectType === 'temporary';
    const title = newTitle || (isRedirect ? 'Neue Weiterleitung' : 'Neue Seite');
    const slug = uniqueSlugFrom(slugify(title, 'neue-seite'), getAllSlugs(tree));
    const newPage = {
      id,
      title,
      slug,
      children: [],
      blocks: [],
      status: 'DRAFT',
      data: {
        ...(newNavigation ? { pageNav: newNavigation } : {}),
        ...(isRedirect ? { redirect: { type: redirectType, url: '', target: '_self' } } : {}),
      },
    };

    // Insert sibling directly after nodeId at the same level
    const insertAfter = (nodes) => {
      const idx = nodes.findIndex(n => n.id === nodeId);
      if (idx !== -1) {
        const updated = [...nodes];
        updated.splice(idx + 1, 0, newPage);
        return updated;
      }
      return nodes.map(n => ({ ...n, children: insertAfter(n.children || []) }));
    };

    const updated = insertAfter(tree);
    setTree(updated);
    if (onUpdate) await onUpdate(updated);
    setNewTitle('');
    setNewNavigation('');
    if (onRefreshPages) await onRefreshPages();
  }

  function handleDelete(id) {
    // Startseite darf nicht gelöscht werden
    if (id === 'demo-home') {
      setToast({ message: 'Die Startseite kann nicht gelöscht werden.', type: 'error' });
      return;
    }
    const removeNode = (nodes) => nodes.filter(n => n.id !== id).map(n => ({ ...n, children: removeNode(n.children || []) }));
    const updated = removeNode(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function handleMoveUp(id, parentNodes = null) {
    const nodes = parentNodes || tree;
    const index = nodes.findIndex(n => n.id === id);

    if (index > 0) {
      const updated = [...nodes];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];

      if (parentNodes) {
        return updated;
      } else {
        setTree(updated);
        onUpdate && onUpdate(updated);
      }
    } else {
      // Suche in children
      const newTree = nodes.map(n => ({
        ...n,
        children: n.children && n.children.length > 0 ? handleMoveUp(id, n.children) || n.children : n.children
      }));

      if (!parentNodes) {
        setTree(newTree);
        onUpdate && onUpdate(newTree);
      } else {
        return newTree;
      }
    }
  }

  function handleMoveDown(id, parentNodes = null) {
    const nodes = parentNodes || tree;
    const index = nodes.findIndex(n => n.id === id);

    if (index >= 0 && index < nodes.length - 1) {
      const updated = [...nodes];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];

      if (parentNodes) {
        return updated;
      } else {
        setTree(updated);
        onUpdate && onUpdate(updated);
      }
    } else {
      // Suche in children
      const newTree = nodes.map(n => ({
        ...n,
        children: n.children && n.children.length > 0 ? handleMoveDown(id, n.children) || n.children : n.children
      }));

      if (!parentNodes) {
        setTree(newTree);
        onUpdate && onUpdate(newTree);
      } else {
        return newTree;
      }
    }
  }

  async function handleToggleStatus(nodeId) {
    const findNode = (nodes) => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        const found = findNode(n.children || []);
        if (found) return found;
      }
    };
    const node = findNode(tree);
    if (!node) return;

    // Zielstatus: PUBLISHED → DRAFT, alles andere → PUBLISHED
    const targetStatus = node.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';

    // Helper: update status in tree and persist via onUpdate (used for child pages
    // that have no own DB row and therefore can't go through the workflow endpoint)
    const applyStatusLocally = async () => {
      const updateTree = (nodes) => nodes.map(n =>
        n.id === nodeId
          ? { ...n, status: targetStatus }
          : { ...n, children: updateTree(n.children || []) }
      );
      const updatedTree = updateTree(tree);
      setTree(updatedTree);
      if (onUpdate) await onUpdate(updatedTree);
      if (onRefreshPages) await onRefreshPages();
      setToast({
        message: `Status geändert: ${STATUS_LABELS[targetStatus] || targetStatus}`,
        type: 'success',
      });
    };

    try {
      const res = await fetch('/api/pages/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: node.id, slug: node.slug, toStatus: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          // Page has no own DB row (child page stored in parent's children JSON).
          // Fall back to updating the status in the tree and saving via onUpdate.
          await applyStatusLocally();
        } else {
          setToast({ message: data.error || 'Statuswechsel fehlgeschlagen.', type: 'error' });
        }
      } else {
        setToast({
          message: `Status geändert: ${STATUS_LABELS[targetStatus] || targetStatus}`,
          type: 'success',
        });
        // Seiten neu laden damit die Liste den aktuellen Status zeigt
        if (onRefreshPages) {
          await onRefreshPages();
        } else {
          const updateTree = (nodes) => nodes.map(n =>
            n.id === nodeId
              ? { ...n, status: targetStatus }
              : { ...n, children: updateTree(n.children || []) }
          );
          setTree(updateTree(tree));
        }
      }
    } catch (_e) {
      setToast({ message: 'Netzwerkfehler beim Statuswechsel.', type: 'error' });
    }
  }

  function handleNavChange(nodeId, navId) {
    const updateNav = (nodes) => nodes.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...(n.data || {}), pageNav: navId } }
        : { ...n, children: updateNav(n.children || []) }
    );
    const updated = updateNav(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function handleFooterChange(nodeId, footerId) {
    const updateFooter = (nodes) => nodes.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...(n.data || {}), pageFooter: footerId } }
        : { ...n, children: updateFooter(n.children || []) }
    );
    const updated = updateFooter(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function handleBulkNav(navId) {
    if (selectedIds.size === 0) return;
    const updateNav = (nodes) => nodes.map(n =>
      selectedIds.has(n.id)
        ? { ...n, data: { ...(n.data || {}), pageNav: navId } }
        : { ...n, children: updateNav(n.children || []) }
    );
    const updated = updateNav(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
    setToast({ message: `Navigation für ${selectedIds.size} Seite(n) gesetzt.`, type: 'success' });
  }

  function handleBulkFooter(footerId) {
    if (selectedIds.size === 0) return;
    const updateFooter = (nodes) => nodes.map(n =>
      selectedIds.has(n.id)
        ? { ...n, data: { ...(n.data || {}), pageFooter: footerId } }
        : { ...n, children: updateFooter(n.children || []) }
    );
    const updated = updateFooter(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
    setToast({ message: `Footer für ${selectedIds.size} Seite(n) gesetzt.`, type: 'success' });
  }

  function handleIndent(nodeId) {
    // Make node a child of its preceding sibling
    const indent = (nodes) => {
      const index = nodes.findIndex(n => n.id === nodeId);
      if (index > 0) {
        const updated = [...nodes];
        const [moved] = updated.splice(index, 1);
        const prevSibling = { ...updated[index - 1], children: [...(updated[index - 1].children || []), moved] };
        updated[index - 1] = prevSibling;
        return updated;
      }
      return nodes.map(n => ({ ...n, children: indent(n.children || []) }));
    };
    const updated = indent(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function handleOutdent(nodeId) {
    // Promote node one level up (sibling of its parent)
    const outdent = (nodes) => {
      for (let i = 0; i < nodes.length; i++) {
        const childIdx = (nodes[i].children || []).findIndex(c => c.id === nodeId);
        if (childIdx >= 0) {
          const newChildren = (nodes[i].children || []).filter((_, j) => j !== childIdx);
          const movedNode = nodes[i].children[childIdx];
          const result = [...nodes];
          result[i] = { ...nodes[i], children: newChildren };
          result.splice(i + 1, 0, movedNode);
          return result;
        }
      }
      return nodes.map(n => ({ ...n, children: outdent(n.children || []) }));
    };
    const updated = outdent(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  // ---- Drag & Drop: Seiten per Ziehen umsortieren / verschachteln ----

  function nodeContainsId(node, id) {
    if (node.id === id) return true;
    return (node.children || []).some(c => nodeContainsId(c, id));
  }

  function removeNodeById(nodes, id) {
    let removed = null;
    const strip = (list) => {
      const next = [];
      for (const n of list) {
        if (n.id === id) {
          removed = n;
          continue;
        }
        next.push({ ...n, children: strip(n.children || []) });
      }
      return next;
    };
    const result = strip(nodes);
    return { tree: result, node: removed };
  }

  function insertNodeRelative(nodes, targetId, position, nodeToInsert) {
    if (position === 'inside') {
      return nodes.map(n => n.id === targetId
        ? { ...n, children: [...(n.children || []), nodeToInsert] }
        : { ...n, children: insertNodeRelative(n.children || [], targetId, position, nodeToInsert) });
    }
    const idx = nodes.findIndex(n => n.id === targetId);
    if (idx !== -1) {
      const next = [...nodes];
      next.splice(position === 'before' ? idx : idx + 1, 0, nodeToInsert);
      return next;
    }
    return nodes.map(n => ({ ...n, children: insertNodeRelative(n.children || [], targetId, position, nodeToInsert) }));
  }

  function handleDragStart(e, nodeId) {
    setDraggedId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropIndicator(null);
  }

  function handleDragOverNode(e, nodeId) {
    if (!draggedId || draggedId === nodeId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const ratio = offset / rect.height;
    const position = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
    setDropIndicator(prev => (prev && prev.id === nodeId && prev.position === position) ? prev : { id: nodeId, position });
  }

  function handleDropOnNode(e, targetId) {
    e.preventDefault();
    const sourceId = draggedId;
    const indicator = dropIndicator;
    setDraggedId(null);
    setDropIndicator(null);
    if (!sourceId || sourceId === targetId || !indicator || indicator.id !== targetId) return;

    const findNode = (nodes, id) => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const found = findNode(n.children || [], id);
        if (found) return found;
      }
      return null;
    };
    const sourceNode = findNode(tree, sourceId);
    if (!sourceNode) return;
    // Verhindert, dass eine Seite in ihren eigenen Nachfahren verschoben wird
    if (nodeContainsId(sourceNode, targetId)) {
      setToast({ message: 'Eine Seite kann nicht in ihre eigene Unterseite verschoben werden.', type: 'error' });
      return;
    }

    const { tree: withoutSource } = removeNodeById(tree, sourceId);
    const updated = insertNodeRelative(withoutSource, targetId, indicator.position, sourceNode);

    // Absicherung: die verschobene Seite darf nach der Operation nur genau
    // einmal im Baum vorkommen. Ein Bug hier würde sie an mehreren Stellen
    // gleichzeitig "kopieren" statt zu verschieben — lieber sichtbar
    // abbrechen, als so einen Baum zu speichern.
    const countIds = (nodes, id, count = 0) => {
      for (const n of nodes || []) {
        if (n.id === id) count++;
        count = countIds(n.children || [], id, count);
      }
      return count;
    };
    if (countIds(updated, sourceId) !== 1) {
      setToast({ message: 'Verschieben fehlgeschlagen (interner Fehler). Bitte Seite neu laden und erneut versuchen.', type: 'error' });
      return;
    }

    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function getStatusLabel(node) {
    if (node.isHomepage) return 'Homepage';
    const redirect = getPageRedirect(node);
    if (redirect) return redirect.type === 'permanent' ? 'Permanente Weiterleitung' : 'Temporäre Weiterleitung';
    return STATUS_LABELS[node.status] || node.status || 'Entwurf';
  }

  function renderNodeMeta(node, fullPath) {
    const nav = navigations.find(n => n.id === node.data?.pageNav);
    const footer = footers.find(f => f.id === node.data?.pageFooter);
    return [
      `/${fullPath || node.slug || ''}`,
      nav ? `Nav: ${nav.name}` : 'Keine Nav',
      footer ? `Footer: ${footer.name}` : 'Standard-Footer',
    ].join(' · ');
  }

  // Collect all page IDs from a tree (flat list)
  function collectAllIds(nodes) {
    const ids = [];
    const collect = (ns) => ns.forEach(n => { ids.push(n.id); collect(n.children || []); });
    collect(nodes);
    return ids;
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Seite(n) wirklich löschen?`)) return;
    setBulkBusy(true);
    try {
      // Remove from tree
      const removeNodes = (nodes) =>
        nodes
          .filter(n => !selectedIds.has(n.id))
          .map(n => ({ ...n, children: removeNodes(n.children || []) }));
      const updated = removeNodes(tree);
      setTree(updated);
      onUpdate && onUpdate(updated);
      setSelectedIds(new Set());
      setToast({ message: `${selectedIds.size} Seite(n) gelöscht.`, type: 'success' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkMove(targetId) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      if (targetId && selectedIds.has(targetId)) {
        setToast({ message: 'Ungültiges Ziel: eine ausgewählte Seite kann nicht Ziel sein.', type: 'error' });
        return;
      }

      const orderedSelected = [];
      const collectSelected = (nodes) => {
        for (const n of nodes) {
          if (selectedIds.has(n.id)) orderedSelected.push(n.id);
          collectSelected(n.children || []);
        }
      };
      collectSelected(tree);

      let working = tree;
      const movedNodes = [];
      for (const id of orderedSelected) {
        const { tree: next, node } = removeNodeById(working, id);
        if (node) {
          working = next;
          movedNodes.push(node);
        }
      }

      const insertInto = (nodes) => {
        if (targetId === null) return [...nodes, ...movedNodes];
        return nodes.map(n => n.id === targetId
          ? { ...n, children: [...(n.children || []), ...movedNodes] }
          : { ...n, children: insertInto(n.children || []) });
      };
      const updated = insertInto(working);

      const countIds = (nodes, id) => {
        let count = 0;
        for (const n of nodes || []) {
          if (n.id === id) count++;
          count += countIds(n.children || [], id);
        }
        return count;
      };
      for (const id of orderedSelected) {
        if (countIds(updated, id) !== 1) {
          setToast({ message: 'Verschieben fehlgeschlagen (interner Fehler). Bitte Seite neu laden und erneut versuchen.', type: 'error' });
          return;
        }
      }

      const findChildrenOf = (nodes, id) => {
        if (id === null) return nodes;
        for (const n of nodes) {
          if (n.id === id) return n.children || [];
          const found = findChildrenOf(n.children || [], id);
          if (found) return found;
        }
        return null;
      };
      const targetChildren = findChildrenOf(updated, targetId);
      if (targetChildren) {
        const seen = new Map();
        for (const c of targetChildren) seen.set(c.slug, (seen.get(c.slug) || 0) + 1);
        const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([slug]) => slug);
        if (dupes.length > 0) {
          setToast({ message: `Verschieben abgebrochen: Slug-Konflikt am Zielort (${dupes.join(', ')}). Bitte zuerst Slug der betroffenen Seite(n) ändern.`, type: 'error' });
          return;
        }
      }

      setTree(updated);
      await onUpdate?.(updated);
      setSelectedIds(new Set());
      setTargetPicker(null);
      setToast({ message: `${orderedSelected.length} Seite(n) verschoben.`, type: 'success' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkCopy(targetId) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const orderedSelected = [];
      const collectSelected = (nodes) => {
        for (const n of nodes) {
          if (selectedIds.has(n.id)) orderedSelected.push(n);
          collectSelected(n.children || []);
        }
      };
      collectSelected(tree);

      const usedSlugs = getAllSlugs(tree);
      const deepCloneUnique = (node) => {
        const base = JSON.parse(JSON.stringify(node));
        const slug = uniqueSlugFrom(slugify(base.slug + '-kopie'), usedSlugs);
        return {
          ...base,
          id: Math.random().toString(36).substr(2, 9),
          slug,
          title: base.title + ' (Kopie)',
          status: 'DRAFT',
          children: (base.children || []).map(deepCloneUnique),
        };
      };
      const clones = orderedSelected.map(deepCloneUnique);

      const insertInto = (nodes) => {
        if (targetId === null) return [...nodes, ...clones];
        return nodes.map(n => n.id === targetId
          ? { ...n, children: [...(n.children || []), ...clones] }
          : { ...n, children: insertInto(n.children || []) });
      };
      const updated = insertInto(tree);

      setTree(updated);
      await onUpdate?.(updated);
      if (onRefreshPages) await onRefreshPages();
      setSelectedIds(new Set());
      setTargetPicker(null);
      setToast({ message: `${clones.length} Seite(n) kopiert.`, type: 'success' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkStatus(targetStatus) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const id of selectedIds) {
        const res = await fetch('/api/pages/workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: id, toStatus: targetStatus }),
        });
        if (res.ok) succeeded++; else failed++;
      }
      if (onRefreshPages) await onRefreshPages();
      else {
        const updateTree = (nodes) => nodes.map(n =>
          selectedIds.has(n.id)
            ? { ...n, status: targetStatus }
            : { ...n, children: updateTree(n.children || []) }
        );
        setTree(updateTree(tree));
      }
      setSelectedIds(new Set());
      const label = STATUS_LABELS[targetStatus] || targetStatus;
      const msg = failed > 0
        ? `${succeeded} gesetzt auf ${label}, ${failed} fehlgeschlagen.`
        : `${succeeded} Seite(n) auf ${label} gesetzt.`;
      setToast({ message: msg, type: failed > 0 ? 'error' : 'success' });
    } finally {
      setBulkBusy(false);
    }
  }

  function renderCardGrid(nodes, depth = 0, parentPath = '', ancestorUpdatedAt = null) {
    const dragEnabled = !searchTerm.trim();
    return (
      <div className={`page-card-row depth-${depth}`}>
        {nodes.map((node, index) => {
          const nav = navigations.find(n => n.id === node.data?.pageNav);
          const hasChildren = (node.children || []).length > 0;
          const isLoaded = iframeLoaded[node.id];
          // Nested pages live at /parent/child, matching findPageByPath()
          // in pages/[...slug].js and buildNestedPages() for the live nav —
          // node.slug alone (the leaf segment) is not a valid route.
          const fullPath = parentPath ? `${parentPath}/${node.slug}` : node.slug;
          // Nested pages are embedded JSON on their top-level ancestor's row,
          // so a save only bumps that ancestor's updatedAt — use it to
          // cache-bust thumbnails at every depth under it.
          const cacheKey = ancestorUpdatedAt || node.updatedAt || '';
          const indicator = dropIndicator && dropIndicator.id === node.id ? dropIndicator.position : null;

          return (
            <div key={node.id} className="page-card-group">
              <div
                className={`page-card${node.status === 'PUBLISHED' ? ' published' : ''}${selectedIds.has(node.id) ? ' selected' : ''}${draggedId === node.id ? ' dragging' : ''}${indicator ? ` drop-${indicator}` : ''}`}
                ref={isLoaded ? undefined : observeThumbCard}
                data-node-id={node.id}
                onDragOver={dragEnabled ? (e) => handleDragOverNode(e, node.id) : undefined}
                onDragLeave={dragEnabled ? () => setDropIndicator(prev => (prev && prev.id === node.id ? null : prev)) : undefined}
                onDrop={dragEnabled ? (e) => handleDropOnNode(e, node.id) : undefined}
              >
                {/* Bulk selection checkbox */}
                <button
                  className="page-card-select-btn"
                  onClick={() => toggleSelect(node.id)}
                  title={selectedIds.has(node.id) ? 'Auswahl aufheben' : 'Auswählen'}
                  aria-label={selectedIds.has(node.id) ? `${node.title} abwählen` : `${node.title} auswählen`}
                  aria-pressed={selectedIds.has(node.id)}
                >
                  {selectedIds.has(node.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                {/* Thumbnail */}
                <div className="page-card-thumb">
                  {node.status === 'PUBLISHED' && isLoaded ? (
                    <div className="page-card-iframe-wrap">
                      <iframe
                        src={cacheKey ? `/${fullPath}?_thumb=${encodeURIComponent(cacheKey)}` : `/${fullPath}`}
                        title={node.title}
                        tabIndex={-1}
                        scrolling="no"
                        sandbox="allow-same-origin allow-scripts"
                      />
                    </div>
                  ) : (
                    <div className="page-card-thumb-placeholder">
                      {node.status === 'PUBLISHED' ? <Globe size={28} /> : <FileText size={28} />}
                      <span>{STATUS_LABELS[node.status] || 'Entwurf'}</span>
                    </div>
                  )}
                  <div className="page-card-badges">
                    <span className={`page-badge page-badge-${(STATUS_COLORS[node.status] || 'badge-gray').replace('badge-', '')}`}>
                      {getStatusLabel(node)}
                    </span>
                    {node.isHomepage && <span className="page-badge badge-home">🏠</span>}
                  </div>
                </div>

                {/* Body */}
                <div className="page-card-body">
                  <a
                    href={`/${fullPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="page-card-title"
                    title={node.title}
                  >
                    {node.title}
                  </a>
                  <p className="page-card-meta">{renderNodeMeta(node, fullPath)}</p>
                  <select
                    value={node.data?.pageNav || ''}
                    onChange={(e) => handleNavChange(node.id, e.target.value)}
                    className="page-card-nav-select"
                    title="Seiten-Navigation"
                  >
                    <option value="">Keine Navigation</option>
                    {navigations.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
                    ))}
                  </select>
                  <select
                    value={node.data?.pageFooter || ''}
                    onChange={(e) => handleFooterChange(node.id, e.target.value)}
                    className="page-card-nav-select"
                    title="Seiten-Footer"
                  >
                    <option value="">Standard-Footer (global aktiv)</option>
                    {footers.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="page-card-actions">
                  <button
                    className={`icon-btn drag-handle${dragEnabled ? '' : ' disabled'}`}
                    draggable={dragEnabled}
                    onDragStart={dragEnabled ? (e) => handleDragStart(e, node.id) : undefined}
                    onDragEnd={handleDragEnd}
                    title={dragEnabled ? 'Ziehen zum Verschieben' : 'Zum Verschieben Suche zurücksetzen'}
                    aria-label={`${node.title} ziehen zum Verschieben`}
                    onClick={(e) => e.preventDefault()}
                  >
                    <GripVertical size={15} />
                  </button>
                  <div className="card-btn-group">
                    <button
                      className="icon-btn"
                      onClick={() => onSelect && onSelect(node.id)}
                      title="Bearbeiten"
                      aria-label={`${node.title} bearbeiten`}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className={`icon-btn${node.status === 'PUBLISHED' ? ' active' : ''}`}
                      onClick={() => handleToggleStatus(node.id)}
                      title={node.status === 'PUBLISHED' ? 'Auf Entwurf setzen' : 'Veröffentlichen'}
                      style={{ color: node.status === 'PUBLISHED' ? '#22c55e' : '#94a3b8' }}
                    >
                      {node.status === 'PUBLISHED' ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>
                  <div className="card-btn-group">
                    <button
                      className="icon-btn page-add-menu-trigger"
                      onClick={(e) => toggleAddMenu(e, node.id)}
                      title="Seite hinzufügen"
                      aria-label={`Seite zu ${node.title} hinzufügen`}
                      aria-expanded={addMenuOpenId === node.id}
                    >
                      <Plus size={15} />
                    </button>
                    {renderAddMenu(node)}
                  </div>
                  <div className="card-btn-group card-btn-group-move">
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveUp(node.id)}
                      disabled={index === 0}
                      title="Nach oben"
                      aria-label={`${node.title} nach oben`}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveDown(node.id)}
                      disabled={index === nodes.length - 1}
                      title="Nach unten"
                      aria-label={`${node.title} nach unten`}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleIndent(node.id)}
                      disabled={index === 0}
                      title="Einrücken (Unterseite des Vorgängers)"
                      aria-label="Einrücken"
                    >
                      <Indent size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleOutdent(node.id)}
                      disabled={depth === 0}
                      title="Ausrücken (eine Ebene höher)"
                      aria-label="Ausrücken"
                    >
                      <Outdent size={14} />
                    </button>
                  </div>
                  <div className="card-btn-group">
                    <button
                      className="icon-btn delete"
                      onClick={() => handleDelete(node.id)}
                      disabled={node.id === 'demo-home'}
                      title={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : 'Löschen'}
                      aria-label={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : `${node.title} löschen`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Children with connector */}
              {hasChildren && (
                <div className="page-card-children">
                  {renderCardGrid(node.children, depth + 1, fullPath, cacheKey)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderTreeRows(nodes, depth = 0, parentPath = '') {
    const dragEnabled = !searchTerm.trim();
    let rows = [];
    nodes.forEach((node, index) => {
      const fullPath = parentPath ? `${parentPath}/${node.slug}` : node.slug;
      const indicator = dropIndicator && dropIndicator.id === node.id ? dropIndicator.position : null;

      rows.push(
        <tr
          key={node.id}
          className={`page-tree-row${selectedIds.has(node.id) ? ' selected' : ''}${draggedId === node.id ? ' dragging' : ''}${indicator ? ` drop-${indicator}` : ''}`}
          onDragOver={dragEnabled ? (e) => handleDragOverNode(e, node.id) : undefined}
          onDragLeave={dragEnabled ? () => setDropIndicator(prev => (prev && prev.id === node.id ? null : prev)) : undefined}
          onDrop={dragEnabled ? (e) => handleDropOnNode(e, node.id) : undefined}
        >
          <td className="page-tree-cell-drag">
            <button
              className={`icon-btn drag-handle${dragEnabled ? '' : ' disabled'}`}
              draggable={dragEnabled}
              onDragStart={dragEnabled ? (e) => handleDragStart(e, node.id) : undefined}
              onDragEnd={handleDragEnd}
              title={dragEnabled ? 'Ziehen zum Verschieben' : 'Zum Verschieben Suche zurücksetzen'}
              aria-label={`${node.title} ziehen zum Verschieben`}
              onClick={(e) => e.preventDefault()}
            >
              <GripVertical size={14} />
            </button>
          </td>
          <td className="page-tree-cell-select">
            <button
              onClick={() => toggleSelect(node.id)}
              title={selectedIds.has(node.id) ? 'Auswahl aufheben' : 'Auswählen'}
              aria-label={selectedIds.has(node.id) ? `${node.title} abwählen` : `${node.title} auswählen`}
              aria-pressed={selectedIds.has(node.id)}
            >
              {selectedIds.has(node.id) ? <CheckSquare size={14} /> : <Square size={14} />}
            </button>
          </td>
          <td className="page-tree-cell-title" style={{ paddingLeft: 12 + depth * 22 }}>
            {depth > 0 && <span className="page-tree-connector">└</span>}
            <a href={`/${fullPath}`} target="_blank" rel="noopener noreferrer" title={node.title}>
              {node.title}
            </a>
            {node.isHomepage && <span className="page-badge badge-home">🏠</span>}
          </td>
          <td className="page-tree-cell-path">/{fullPath}</td>
          <td className="page-tree-cell-status">
            <span className={`page-badge page-badge-${(STATUS_COLORS[node.status] || 'badge-gray').replace('badge-', '')}`}>
              {getStatusLabel(node)}
            </span>
          </td>
          <td className="page-tree-cell-nav">
            <select
              value={node.data?.pageNav || ''}
              onChange={(e) => handleNavChange(node.id, e.target.value)}
              title="Seiten-Navigation"
            >
              <option value="">Keine Navigation</option>
              {navigations.map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
            </select>
          </td>
          <td className="page-tree-cell-footer">
            <select
              value={node.data?.pageFooter || ''}
              onChange={(e) => handleFooterChange(node.id, e.target.value)}
              title="Seiten-Footer"
            >
              <option value="">Standard-Footer</option>
              {footers.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </td>
          <td className="page-tree-cell-actions">
            <button className="icon-btn" onClick={() => onSelect && onSelect(node.id)} title="Bearbeiten" aria-label={`${node.title} bearbeiten`}>
              <Edit2 size={14} />
            </button>
            <button
              className={`icon-btn${node.status === 'PUBLISHED' ? ' active' : ''}`}
              onClick={() => handleToggleStatus(node.id)}
              title={node.status === 'PUBLISHED' ? 'Auf Entwurf setzen' : 'Veröffentlichen'}
              style={{ color: node.status === 'PUBLISHED' ? '#22c55e' : '#94a3b8' }}
            >
              {node.status === 'PUBLISHED' ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <span className="page-add-menu-wrap">
              <button
                className="icon-btn page-add-menu-trigger"
                onClick={(e) => toggleAddMenu(e, node.id)}
                title="Seite hinzufügen"
                aria-label={`Seite zu ${node.title} hinzufügen`}
                aria-expanded={addMenuOpenId === node.id}
              >
                <Plus size={14} />
              </button>
              {renderAddMenu(node)}
            </span>
            <span className="page-tree-move-cluster">
              <button
                className="icon-btn"
                onClick={() => handleMoveUp(node.id)}
                disabled={index === 0}
                title="Nach oben"
                aria-label={`${node.title} nach oben`}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleMoveDown(node.id)}
                disabled={index === nodes.length - 1}
                title="Nach unten"
                aria-label={`${node.title} nach unten`}
              >
                <ChevronDown size={14} />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleIndent(node.id)}
                disabled={index === 0}
                title="Einrücken (Unterseite des Vorgängers)"
                aria-label="Einrücken"
              >
                <Indent size={14} />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleOutdent(node.id)}
                disabled={depth === 0}
                title="Ausrücken (eine Ebene höher)"
                aria-label="Ausrücken"
              >
                <Outdent size={14} />
              </button>
            </span>
            <button
              className="icon-btn delete"
              onClick={() => handleDelete(node.id)}
              disabled={node.id === 'demo-home'}
              title={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : 'Löschen'}
              aria-label={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : `${node.title} löschen`}
            >
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      );

      if ((node.children || []).length > 0) {
        rows = rows.concat(renderTreeRows(node.children, depth + 1, fullPath));
      }
    });
    return rows;
  }

  function renderTreeTable(nodes) {
    const allIds = collectAllIds(nodes);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    return (
      <div className="page-tree-table-wrap">
        <table className="page-tree-table">
          <thead>
            <tr>
              <th className="page-tree-cell-drag" aria-label="Verschieben"></th>
              <th className="page-tree-cell-select">
                <button
                  onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
                  title={allSelected ? 'Alle abwählen' : 'Alle auswählen'}
                  aria-label={allSelected ? 'Alle abwählen' : 'Alle auswählen'}
                  aria-pressed={allSelected}
                >
                  {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
              </th>
              <th>Titel</th>
              <th>Pfad</th>
              <th>Status</th>
              <th>Navigation</th>
              <th>Footer</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {renderTreeRows(nodes)}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page-tree">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {targetPicker && (
        <PageTargetPickerModal
          mode={targetPicker.mode}
          tree={tree}
          selectedIds={selectedIds}
          onCancel={() => setTargetPicker(null)}
          onConfirm={(targetId) => targetPicker.mode === 'move' ? handleBulkMove(targetId) : handleBulkCopy(targetId)}
        />
      )}

      <div className="page-tree-shell">
        <div className="page-tree-toolbar">
          <label className="page-tree-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Seiten, Slugs oder Navigationen durchsuchen"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>

          <div className="page-tree-view-toggle" role="group" aria-label="Ansicht wählen">
            <button
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => setViewMode('cards')}
              title="Kartenansicht"
              aria-pressed={viewMode === 'cards'}
            >
              <Grid size={16} />
            </button>
            <button
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
              title="Tabellenansicht"
              aria-pressed={viewMode === 'table'}
            >
              <List size={16} />
            </button>
          </div>

          <div className="controls">
            <input
              type="text"
              placeholder="Titel für neue Seite"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <select
              value={newNavigation}
              onChange={e => setNewNavigation(e.target.value)}
              aria-label="Navigation für neue Seite"
              style={{ fontSize: '0.85rem', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="">— Navigation wählen —</option>
              {navigations.map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
            </select>
            <span className="page-add-menu-wrap page-add-type-menu-wrap">
              <button className="primary" onClick={() => handleAdd()}>
                <Plus size={16} />
                Seite hinzufügen
              </button>
              <button
                className="primary page-add-type-caret"
                onClick={() => setShowAddTypeMenu(v => !v)}
                title="Weitere Seitentypen"
                aria-label="Weitere Seitentypen"
                aria-haspopup="true"
                aria-expanded={showAddTypeMenu}
                style={{ padding: '0 8px', borderLeft: '1px solid rgba(255,255,255,0.3)' }}
              >
                <ChevronDown size={14} />
              </button>
              {showAddTypeMenu && (
                <div className="page-add-menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20 }}>
                  <button onClick={() => { setShowAddTypeMenu(false); handleAdd(null, 'permanent'); }}>
                    Permanente Weiterleitung
                  </button>
                  <button onClick={() => { setShowAddTypeMenu(false); handleAdd(null, 'temporary'); }}>
                    Temporäre Weiterleitung
                  </button>
                </div>
              )}
            </span>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="bulk-action-bar" role="toolbar" aria-label="Sammelaktionen">
            <span className="bulk-count">{selectedIds.size} ausgewählt</span>
            <button
              className="bulk-btn"
              disabled={bulkBusy}
              onClick={() => handleBulkStatus('PUBLISHED')}
              title="Alle ausgewählten Seiten veröffentlichen"
            >
              <Eye size={14} /> Veröffentlichen
            </button>
            <button
              className="bulk-btn"
              disabled={bulkBusy}
              onClick={() => handleBulkStatus('DRAFT')}
              title="Alle ausgewählten Seiten auf Entwurf setzen"
            >
              <EyeOff size={14} /> Auf Entwurf
            </button>
            <select
              className="bulk-select"
              disabled={bulkBusy}
              value="__placeholder__"
              onChange={(e) => { if (e.target.value !== '__placeholder__') handleBulkNav(e.target.value); }}
              title="Navigation für alle ausgewählten Seiten setzen"
            >
              <option value="__placeholder__" disabled>Navigation setzen…</option>
              <option value="">Keine Navigation</option>
              {navigations.map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
            </select>
            <select
              className="bulk-select"
              disabled={bulkBusy}
              value="__placeholder__"
              onChange={(e) => { if (e.target.value !== '__placeholder__') handleBulkFooter(e.target.value); }}
              title="Footer für alle ausgewählten Seiten setzen"
            >
              <option value="__placeholder__" disabled>Footer setzen…</option>
              <option value="">Standard-Footer</option>
              {footers.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              className="bulk-btn"
              disabled={bulkBusy}
              onClick={() => setTargetPicker({ mode: 'move' })}
              title="Alle ausgewählten Seiten verschieben"
            >
              <FolderInput size={14} /> Verschieben
            </button>
            <button
              className="bulk-btn"
              disabled={bulkBusy}
              onClick={() => setTargetPicker({ mode: 'copy' })}
              title="Alle ausgewählten Seiten kopieren"
            >
              <Copy size={14} /> Kopieren
            </button>
            <button
              className="bulk-btn bulk-btn-danger"
              disabled={bulkBusy}
              onClick={handleBulkDelete}
              title="Alle ausgewählten Seiten löschen"
            >
              <Trash2 size={14} /> Löschen
            </button>
            <button
              className="bulk-btn bulk-btn-ghost"
              onClick={() => setSelectedIds(new Set())}
              title="Auswahl aufheben"
            >
              Abbrechen
            </button>
          </div>
        )}

        <div className="page-grid-root">
          {filteredTree.length > 0 ? (
            viewMode === 'table' ? renderTreeTable(filteredTree) : renderCardGrid(filteredTree)
          ) : (
            <div className="page-tree-empty-state">
              <FileText size={20} />
              <div>
                <strong>Keine passenden Seiten gefunden</strong>
                <p>Prüfe den Suchbegriff oder lege eine neue Seite an.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageTargetPickerModal({ mode, tree, selectedIds, onCancel, onConfirm }) {
  const [targetId, setTargetId] = useState('__root__');

  const disabledIds = useMemo(() => {
    if (mode !== 'move') return new Set();
    const s = new Set();
    const markSubtree = (node) => {
      s.add(node.id);
      (node.children || []).forEach(markSubtree);
    };
    const walk = (nodes) => nodes.forEach(n => {
      if (selectedIds.has(n.id)) markSubtree(n);
      else walk(n.children || []);
    });
    walk(tree);
    return s;
  }, [mode, tree, selectedIds]);

  const renderRows = (nodes, depth) => nodes.flatMap(n => {
    const disabled = disabledIds.has(n.id);
    const row = (
      <div
        key={n.id}
        className={`page-picker-item${targetId === n.id ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
        style={{ paddingLeft: 14 + depth * 18 }}
        onClick={() => { if (!disabled) setTargetId(n.id); }}
      >
        <span className="page-picker-item-title">{n.title}</span>
        <span className="page-picker-item-slug">/{n.slug}</span>
      </div>
    );
    return [row, ...renderRows(n.children || [], depth + 1)];
  });

  return createPortal(
    <div className="file-modal-overlay" onClick={onCancel}>
      <div className="file-modal page-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="file-modal-header">
          <h3 className="file-modal-title">
            {mode === 'move' ? `Verschieben (${selectedIds.size})` : `Kopieren (${selectedIds.size})`}
          </h3>
          <button className="file-modal-close-btn" onClick={onCancel}>×</button>
        </div>
        <div className="page-picker-list">
          <div
            className={`page-picker-item${targetId === '__root__' ? ' selected' : ''}`}
            onClick={() => setTargetId('__root__')}
          >
            <span className="page-picker-item-title">— Oberste Ebene —</span>
          </div>
          {renderRows(tree, 0)}
        </div>
        <div className="file-modal-footer">
          <button className="file-modal-cancel-btn" onClick={onCancel}>Abbrechen</button>
          <button
            className="btn-modern"
            disabled={!targetId}
            onClick={() => onConfirm(targetId === '__root__' ? null : targetId)}
          >
            {mode === 'move' ? 'Verschieben' : 'Kopieren'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
