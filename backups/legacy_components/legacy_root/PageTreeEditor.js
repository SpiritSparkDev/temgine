import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Edit, Plus, Trash2 } from 'lucide-react';



export default function PageTreeEditor({ pages, onSelect, onUpdate }) {
  const [tree, setTree] = useState([]);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    setTree(pages || []);
  }, [pages]);

  function handleAdd(parentId = null) {
    const id = Math.random().toString(36).substr(2, 9);
    const newPage = { id, title: newTitle || 'Neue Seite', children: [] };
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

  function renderTree(nodes, parentId = null) {
    return nodes.map((node, index) => (
      <div key={node.id} className="tree-node">
        <div className="node-row">
          <div className="node-title">
            <a href={`/${node.slug}`} target="_blank" rel="noopener noreferrer">{node.title}</a>
          </div>
          <div className="node-actions">
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
              <button className="icon-btn delete" onClick={() => handleDelete(node.id)} title="Löschen">
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
