import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Indent,
  Outdent,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import Toast from './Toast';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/workflow';


export default function PageTreeEditor({ pages, onSelect, onUpdate, userRole, onRefreshPages }) {
  const [tree, setTree] = useState([]);
  const [newTitle, setNewTitle] = useState('');  const [newNavigation, setNewNavigation] = useState('');  const [navigations, setNavigations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);
  const [iframeLoaded, setIframeLoaded] = useState({});

  useEffect(() => {
    setTree(pages || []);
  }, [pages]);

  useEffect(() => {
    fetch('/api/navigations')
      .then(r => r.json())
      .then(data => setNavigations(Array.isArray(data) ? data : []))
      .catch(err => console.error('Navigationen laden fehlgeschlagen:', err));
  }, []);

  const treeStats = useMemo(() => {
    const visit = (nodes) => nodes.reduce((acc, node) => {
      acc.total += 1;
      if (node.isHomepage) acc.homepages += 1;
      if ((node.children || []).length > 0) acc.withChildren += 1;
      if (node.status === 'DRAFT') acc.drafts += 1;
      return visit(node.children || []).reduce((nestedAcc, key) => nestedAcc, acc);
    }, { total: 0, drafts: 0, homepages: 0, withChildren: 0 });

    const mergeVisit = (nodes, acc = { total: 0, drafts: 0, homepages: 0, withChildren: 0 }) => {
      for (const node of nodes) {
        acc.total += 1;
        if (node.isHomepage) acc.homepages += 1;
        if ((node.children || []).length > 0) acc.withChildren += 1;
        if (node.status === 'DRAFT') acc.drafts += 1;
        mergeVisit(node.children || [], acc);
      }
      return acc;
    };

    return mergeVisit(tree);
  }, [tree]);

  const filteredTree = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tree;

    const filterNodes = (nodes) => nodes.reduce((acc, node) => {
      const children = filterNodes(node.children || []);
      const nodeNav = navigations.find(n => n.id === node.data?.pageNav);
      const haystack = [node.title, node.slug, nodeNav?.name, node.status].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term) || children.length > 0) {
        acc.push({ ...node, children });
      }
      return acc;
    }, []);

    return filterNodes(tree);
  }, [searchTerm, tree]);

  function handleAdd(parentId = null) {
    const id = Math.random().toString(36).substr(2, 9);
    const makeSlug = (text) => {
      return String(text || 'neue-seite')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
    };
    const title = newTitle || 'Neue Seite';
    const newPage = { id, title, slug: makeSlug(title), children: [], blocks: [], status: 'DRAFT', data: { ...(newNavigation ? { pageNav: newNavigation } : {}) } };
    if (!parentId) {
      const updated = [...tree, newPage];
      setTree(updated);
      onUpdate && onUpdate(updated);
    } else {
      const addChild = (nodes) => nodes.map(n => n.id === parentId ? { ...n, children: [...(n.children || []), newPage] } : { ...n, children: addChild(n.children || []) });
      const updated = addChild(tree);
      setTree(updated);
      onUpdate && onUpdate(updated);
    }
    setNewTitle('');
    setNewNavigation('');
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

    try {
      const res = await fetch('/api/pages/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: node.id, toStatus: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ message: data.error || 'Statuswechsel fehlgeschlagen.', type: 'error' });
      } else {
        setToast({
          message: `Status geändert: ${STATUS_LABELS[targetStatus] || targetStatus}`,
          type: 'success',
        });
        // Seiten neu laden damit die Liste den aktuellen Status zeigt
        if (onRefreshPages) {
          await onRefreshPages();
        } else {
          // Fallback: lokalen Baum aktualisieren
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

  function getStatusLabel(node) {
    if (node.isHomepage) return 'Homepage';
    if (node.redirectType === '404') return '404-Seite';
    if (node.redirectType === '503') return '503-Seite';
    return STATUS_LABELS[node.status] || node.status || 'Entwurf';
  }

  function renderNodeMeta(node) {
    const nav = navigations.find(n => n.id === node.data?.pageNav);
    return [
      `/${node.slug || ''}`,
      nav ? `Nav: ${nav.name}` : 'Keine Nav',
    ].join(' · ');
  }

  function renderCardGrid(nodes, depth = 0) {
    return (
      <div className={`page-card-row depth-${depth}`}>
        {nodes.map((node, index) => {
          const nav = navigations.find(n => n.id === node.data?.pageNav);
          const hasChildren = (node.children || []).length > 0;
          const isLoaded = iframeLoaded[node.id];

          return (
            <div key={node.id} className="page-card-group">
              <div
                className={`page-card${node.status === 'PUBLISHED' ? ' published' : ''}`}
                onMouseEnter={() => setIframeLoaded(prev => ({ ...prev, [node.id]: true }))}
              >
                {/* Thumbnail */}
                <div className="page-card-thumb">
                  {node.status === 'PUBLISHED' && isLoaded ? (
                    <div className="page-card-iframe-wrap">
                      <iframe
                        src={`/${node.slug}`}
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
                    {node.redirectType === '404' && <span className="page-badge badge-404">404</span>}
                    {node.redirectType === '503' && <span className="page-badge badge-503">503</span>}
                  </div>
                </div>

                {/* Body */}
                <div className="page-card-body">
                  <a
                    href={`/${node.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="page-card-title"
                    title={node.title}
                  >
                    {node.title}
                  </a>
                  <p className="page-card-meta">{renderNodeMeta(node)}</p>
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
                </div>

                {/* Actions */}
                <div className="page-card-actions">
                  <div className="card-btn-group">
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveUp(node.id)}
                      disabled={index === 0}
                      title="Nach oben"
                      aria-label={`${node.title} nach oben`}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveDown(node.id)}
                      disabled={index === nodes.length - 1}
                      title="Nach unten"
                      aria-label={`${node.title} nach unten`}
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <div className="card-btn-group">
                    <button
                      className="icon-btn"
                      onClick={() => handleIndent(node.id)}
                      disabled={index === 0}
                      title="Einrücken (Unterseite des Vorgängers)"
                      aria-label="Einrücken"
                    >
                      <Indent size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleOutdent(node.id)}
                      disabled={depth === 0}
                      title="Ausrücken (eine Ebene höher)"
                      aria-label="Ausrücken"
                    >
                      <Outdent size={15} />
                    </button>
                  </div>
                  <div className="card-btn-group">
                    <button
                      className={`icon-btn${node.status === 'PUBLISHED' ? ' active' : ''}`}
                      onClick={() => handleToggleStatus(node.id)}
                      title={node.status === 'PUBLISHED' ? 'Auf Entwurf setzen' : 'Veröffentlichen'}
                      style={{ color: node.status === 'PUBLISHED' ? '#22c55e' : '#94a3b8' }}
                    >
                      {node.status === 'PUBLISHED' ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => onSelect && onSelect(node.id)}
                      title="Bearbeiten"
                      aria-label={`${node.title} bearbeiten`}
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleAdd(node.id)}
                      title="Unterseite hinzufügen"
                      aria-label={`Unterseite unter ${node.title} hinzufügen`}
                    >
                      <Plus size={15} />
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
                  {renderCardGrid(node.children, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
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

      <div className="page-tree-shell">
        <div className="page-tree-hero">
          <div className="page-tree-hero-copy">
            <span className="page-tree-eyebrow">Pages</span>
            <h2>Seiten strukturieren und pflegen</h2>
            <p>
              Verwalte Seitenhierarchie, Navigationen und Bearbeitungsschritte. Hover über eine Karte für die Live-Vorschau.
            </p>
          </div>

          <div className="page-tree-stats">
            <div className="page-tree-stat">
              <strong>{treeStats.total}</strong>
              <span>Seiten gesamt</span>
            </div>
            <div className="page-tree-stat">
              <strong>{treeStats.withChildren}</strong>
              <span>mit Unterseiten</span>
            </div>
            <div className="page-tree-stat">
              <strong>{treeStats.homepages}</strong>
              <span>Systemseiten</span>
            </div>
          </div>
        </div>

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
            <button className="primary" onClick={() => handleAdd()}>
              <Plus size={16} />
              Seite hinzufügen
            </button>
          </div>
        </div>

        <div className="page-grid-root">
          {filteredTree.length > 0 ? (
            renderCardGrid(filteredTree)
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
