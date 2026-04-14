import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  EyeOff,
  FileText,
  FolderTree,
  Globe,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import Toast from './Toast';



export default function PageTreeEditor({ pages, onSelect, onUpdate }) {
  const [tree, setTree] = useState([]);
  const [newTitle, setNewTitle] = useState('');  const [newNavigation, setNewNavigation] = useState('');  const [navigations, setNavigations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

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

  function handleToggleStatus(nodeId) {
    const toggleNode = (nodes) => nodes.map(n =>
      n.id === nodeId
        ? { ...n, status: n.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }
        : { ...n, children: toggleNode(n.children || []) }
    );
    const updated = toggleNode(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
    const node = (() => { const find = (nodes) => { for (const n of nodes) { if (n.id === nodeId) return n; const f = find(n.children || []); if (f) return f; } }; return find(updated); })();
    setToast({ message: node?.status === 'PUBLISHED' ? '✓ Seite veröffentlicht' : 'Seite auf Entwurf gesetzt', type: 'success' });
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

  function getStatusLabel(node) {
    if (node.isHomepage) return 'Homepage';
    if (node.redirectType === '404') return '404-Seite';
    if (node.redirectType === '503') return '503-Seite';
    return node.status === 'DRAFT' ? 'Entwurf' : 'Veröffentlicht';
  }

  function renderNodeMeta(node) {
    const childCount = (node.children || []).length;
    const nav = navigations.find(n => n.id === node.data?.pageNav);
    return [
      `/${node.slug || ''}`,
      nav ? `Nav: ${nav.name}` : 'Keine Navigation',
      childCount > 0 ? `${childCount} Unterseiten` : 'Keine Unterseiten',
    ].join(' · ');
  }

  function renderTree(nodes, parentId = null) {
    return nodes.map((node, index) => (
      <div key={node.id} className="tree-node">
        <div className="node-row">
          <div className="node-title">
            <div className="page-node-leading">
              <span className="page-node-icon">
                {parentId ? <FolderTree size={16} /> : <Globe size={16} />}
              </span>
              <div className="page-node-copy">
                <a href={`/${node.slug}`} target="_blank" rel="noopener noreferrer">{node.title}</a>
                <p>{renderNodeMeta(node)}</p>
              </div>
            </div>
            <div className="page-node-badges">
              <span className={`page-badge ${node.status === 'PUBLISHED' ? 'page-badge-published' : 'page-badge-neutral'}`}>{getStatusLabel(node)}</span>
              {node.isHomepage && <span className="page-badge badge-home">🏠 Homepage</span>}
              {node.redirectType === '404' && <span className="page-badge badge-404">404</span>}
              {node.redirectType === '503' && <span className="page-badge badge-503">503</span>}
            </div>
          </div>
          <div className="node-actions">
            <select
              value={node.data?.pageNav || ''}
              onChange={(e) => handleNavChange(node.id, e.target.value)}
              className="inline-template-select"
              title="Seiten-Navigation"
            >
              <option value="">Keine Navigation</option>
              {navigations.map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
            </select>
            <div className="btn-group">
              <button
                className="icon-btn"
                onClick={() => handleMoveUp(node.id)}
                disabled={index === 0}
                style={{ opacity: index === 0 ? 0.3 : 1 }}
                title="Nach oben"
                aria-label={`${node.title} nach oben verschieben`}
              >
                <ChevronUp size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleMoveDown(node.id)}
                disabled={index === nodes.length - 1}
                style={{ opacity: index === nodes.length - 1 ? 0.3 : 1 }}
                title="Nach unten"
                aria-label={`${node.title} nach unten verschieben`}
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="btn-group">
              <button
                className={`icon-btn${node.status === 'PUBLISHED' ? ' active' : ''}`}
                onClick={() => handleToggleStatus(node.id)}
                title={node.status === 'PUBLISHED' ? 'Veröffentlicht – klicken um auf Entwurf zu setzen' : 'Entwurf – klicken um zu veröffentlichen'}
                aria-label={node.status === 'PUBLISHED' ? 'Veröffentlichung aufheben' : 'Veröffentlichen'}
                style={{ color: node.status === 'PUBLISHED' ? '#22c55e' : '#94a3b8' }}
              >
                {node.status === 'PUBLISHED' ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button className="icon-btn" onClick={() => onSelect && onSelect(node.id)} title="Bearbeiten" aria-label={`${node.title} bearbeiten`}>
                <Edit size={16} />
              </button>
              <button className="icon-btn" onClick={() => handleAdd(node.id)} title="Unterseite hinzufügen" aria-label={`Unterseite unter ${node.title} hinzufügen`}>
                <Plus size={16} />
              </button>
            </div>
            <div className="btn-group">
              <button 
                className="icon-btn delete" 
                onClick={() => handleDelete(node.id)} 
                disabled={node.id === 'demo-home'}
                style={{ opacity: node.id === 'demo-home' ? 0.3 : 1 }}
                title={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : 'Löschen'}
                aria-label={node.id === 'demo-home' ? 'Startseite kann nicht gelöscht werden' : `${node.title} löschen`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>


        </div>
        {node.children && node.children.length > 0 && (
          <div className="children">
            {renderTree(node.children, node.id)}
          </div>
        )}
      </div>
    ));
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
              Verwalte Seitenhierarchie, Templates und Bearbeitungsschritte an einer Stelle.
              Suche und Aktionen sind jetzt direkter erreichbar.
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
              placeholder="Seiten, Slugs oder Templates durchsuchen"
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

        <div className="page-tree-list">
          {filteredTree.length > 0 ? (
            renderTree(filteredTree)
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
