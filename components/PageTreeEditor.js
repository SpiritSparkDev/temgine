import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Edit, Plus, Trash2 } from 'lucide-react';



export default function PageTreeEditor({ pages, onSelect, onUpdate }) {
  const [tree, setTree] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    setTree(pages || []);
  }, [pages]);

  useEffect(() => {
    // Lade verfügbare Templates
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => setTemplates(data || []))
      .catch(err => console.error('Templates laden fehlgeschlagen:', err));
  }, []);

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
    const newPage = { id, title, slug: makeSlug(title), children: [], blocks: [], status: 'DRAFT' };
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
  }

  function handleDelete(id) {
    // Startseite darf nicht gelöscht werden
    if (id === 'demo-home') {
      showToast?.('Die Startseite kann nicht gelöscht werden.', 'error');
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

  function handleTemplateChange(nodeId, templateName) {
    const updateTemplate = (nodes) => nodes.map(n => 
      n.id === nodeId 
        ? { ...n, template: templateName }
        : { ...n, children: updateTemplate(n.children || []) }
    );
    const updated = updateTemplate(tree);
    setTree(updated);
    onUpdate && onUpdate(updated);
  }

  function renderTree(nodes, parentId = null) {
    return nodes.map((node, index) => (
      <div key={node.id} className="tree-node">
        <div className="node-row">
          <div className="node-title">
            <a href={`/${node.slug}`} target="_blank" rel="noopener noreferrer">{node.title}</a>
            {node.redirectType === '404' && <span className="page-badge badge-404">404</span>}
            {node.redirectType === '503' && <span className="page-badge badge-503">503</span>}
            {node.id === 'demo-home' && <span className="page-badge badge-home">Home</span>}

          </div>
          <div className="node-actions">
            <select 
              value={node.template || ''} 
              onChange={(e) => handleTemplateChange(node.id, e.target.value)}
              className="inline-template-select"
              title="Seiten-Template"
            >
              <option value="">Kein Template</option>
              {templates.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="btn-group">
              <button
                className="icon-btn"
                onClick={() => handleMoveUp(node.id)}
                disabled={index === 0}
                style={{ opacity: index === 0 ? 0.3 : 1 }}
                title="Nach oben"
              >
                <ChevronUp size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => handleMoveDown(node.id)}
                disabled={index === nodes.length - 1}
                style={{ opacity: index === nodes.length - 1 ? 0.3 : 1 }}
                title="Nach unten"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="btn-group">
              <button className="icon-btn" onClick={() => onSelect && onSelect(node.id)} title="Bearbeiten">
                <Edit size={16} />
              </button>
              <button className="icon-btn" onClick={() => handleAdd(node.id)} title="Unterseite hinzufügen">
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
      <h2>Seitenbaum</h2>
      <div className="controls">
        <input type="text" placeholder="Seitentitel" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        <button className="primary" onClick={() => handleAdd()}>Seite hinzufügen</button>
      </div>
      <div>
        {renderTree(tree)}
      </div>
    </div>
  );
}
