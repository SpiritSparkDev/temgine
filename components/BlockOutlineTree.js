import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Grid, Layers, ChevronRight, ChevronDown, Eye, EyeOff, Copy, Trash2, FolderPlus, FolderInput, Plus, X } from '../lib/muiIcons';
import { flattenTree, filterPaths, ancestorPaths, canMove, blockLabel, blockSummary } from '../lib/blockTree';
import { blockSearchText } from '../lib/blockDiff';

// Gliederung des Fokus-Editors: Baumdiagramm der (verschachtelten) Blöcke mit
// Auswahl, Drag&Drop (umsortieren/verschachteln), Tastatursteuerung und Kurz-Aktionen.
// Zustandslos bzgl. der Blöcke — alle Änderungen laufen über onMove/onAction (PageEditor).
// onMove(fromPath, toPath, 'before'|'after'|'inside'); onAction('duplicate'|'toggleHidden'|'delete'|'copy'|'move', path).
export default function BlockOutlineTree({ blocks, selectedPath, onSelect, onMove, onAction, onHover, search, onSearch, onAddBlock, onAddChild }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [focusPath, setFocusPath] = useState(null);
  const [drop, setDrop] = useState(null); // { path, position } | { end: true }
  const dragRef = useRef(null);
  const rowRefs = useRef({});

  const visible = useMemo(() => filterPaths(blocks, search, blockSearchText), [blocks, search]);
  const rows = useMemo(() => flattenTree(blocks, collapsed, visible), [blocks, collapsed, visible]);

  // Auswahl immer sichtbar halten (z. B. nach Klick in der Vorschau oder Verschieben)
  useEffect(() => {
    if (!selectedPath) return;
    const anc = ancestorPaths(selectedPath);
    setCollapsed((prev) => {
      if (!anc.some((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      anc.forEach((a) => next.delete(a));
      return next;
    });
  }, [selectedPath]);

  const toggle = (path, open) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (open === undefined ? next.has(path) : open) next.delete(path); else next.add(path);
    return next;
  });

  const focusRow = (path) => { setFocusPath(path); rowRefs.current[path]?.focus(); };

  const onKeyDown = (e, row, i) => {
    if (e.target !== e.currentTarget) return; // Tasten in Buttons nicht abfangen
    const { path } = row;
    const go = (r) => { if (r) { e.preventDefault(); focusRow(r.path); } };
    switch (e.key) {
      case 'ArrowDown': go(rows[i + 1]); break;
      case 'ArrowUp': go(rows[i - 1]); break;
      case 'Home': go(rows[0]); break;
      case 'End': go(rows[rows.length - 1]); break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !row.expanded) toggle(path, true);
        else if (row.expanded) go(rows[i + 1]);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.expanded) toggle(path, false);
        else go(rows.find((r) => r.path === ancestorPaths(path).pop()));
        break;
      case 'Enter': case ' ': e.preventDefault(); onSelect(path); break;
      case 'Delete': e.preventDefault(); onAction('delete', path); break;
      default:
    }
  };

  const zone = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientY - r.top) / (r.height || 1);
    return f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'inside';
  };

  const onDragOver = (e, path) => {
    const from = dragRef.current;
    if (from == null) return;
    const position = zone(e);
    if (!canMove(blocks, from, path, position)) { if (drop) setDrop(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!drop || drop.path !== path || drop.position !== position) setDrop({ path, position });
  };

  const doDrop = (e, to, position) => {
    e.preventDefault();
    const from = dragRef.current;
    dragRef.current = null;
    setDrop(null);
    if (from == null || !canMove(blocks, from, to, position)) return;
    if (position === 'inside') toggle(to, true);
    onMove(from, to, position);
  };

  const lastTop = String(blocks.length - 1);

  return (
    <nav className="pe-outline" aria-label="Seitengliederung">
      <div className="pe-outline-search">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Blöcke suchen…"
          aria-label="Blöcke suchen"
        />
        {search && (
          <button type="button" className="pe-outline-icon-btn" onClick={() => onSearch('')} title="Suche leeren" aria-label="Suche leeren">
            <X size={14} />
          </button>
        )}
      </div>

      <div
        className="pe-tree"
        role="tree"
        aria-label="Blöcke der Seite"
        onMouseLeave={() => onHover && onHover(null)}
      >
        {rows.length === 0 && <div className="pe-tree-empty">{search ? `Kein Block passt zu „${search}“.` : 'Noch keine Blöcke.'}</div>}
        {rows.map((row, i) => {
          const { path, block, depth, guides, isLast, hasChildren, expanded } = row;
          const selected = path === selectedPath;
          const label = blockLabel(block);
          const summary = blockSummary(block);
          const num = path.split('.').map((n) => Number(n) + 1).join('.');
          const tip = `${label}\nBlock ${num}${block.hidden ? ' (ausgeblendet)' : ''}${summary ? `\n${summary}` : ''}`;
          const dropCls = drop && drop.path === path ? ` drop-${drop.position}` : '';
          const tabbable = (focusPath && rows.some((r) => r.path === focusPath) ? focusPath : (rows.some((r) => r.path === selectedPath) ? selectedPath : rows[0].path)) === path;
          const act = (name) => (e) => { e.stopPropagation(); onAction(name, path); };
          return (
            <div
              key={path}
              ref={(el) => { if (el) rowRefs.current[path] = el; else delete rowRefs.current[path]; }}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selected}
              aria-expanded={hasChildren ? expanded : undefined}
              tabIndex={tabbable ? 0 : -1}
              className={`pe-tree-row${selected ? ' selected' : ''}${block.hidden ? ' is-hidden' : ''}${dropCls}`}
              style={{ '--pe-depth': depth }}
              title={tip}
              draggable
              data-tree-path={path}
              onClick={() => { setFocusPath(path); onSelect(path); }}
              onFocus={(e) => { if (e.target === e.currentTarget) setFocusPath(path); }}
              onKeyDown={(e) => onKeyDown(e, row, i)}
              onMouseEnter={() => onHover && onHover(path)}
              onDragStart={(e) => { dragRef.current = path; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', path); }}
              onDragEnd={() => { dragRef.current = null; setDrop(null); }}
              onDragOver={(e) => onDragOver(e, path)}
              onDrop={(e) => { const p = zone(e); doDrop(e, path, p); }}
            >
              {guides.map((line, g) => <span key={g} className={`pe-tl${line ? ' line' : ''}`} aria-hidden="true" />)}
              {depth > 0 && <span className={`pe-tl elbow${isLast ? ' last' : ''}`} aria-hidden="true" />}
              {hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className="pe-tree-toggle"
                  onClick={(e) => { e.stopPropagation(); toggle(path); }}
                  aria-label={expanded ? `Unterblöcke von ${label} zuklappen` : `Unterblöcke von ${label} aufklappen`}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : <span className="pe-tree-toggle-spacer" aria-hidden="true" />}
              <span className="pe-tree-icon" aria-hidden="true">{hasChildren ? <Layers size={14} /> : <Grid size={14} />}</span>
              <span className="pe-tree-label">{label}</span>
              {hasChildren && !expanded && !visible && <span className="pe-tree-count" aria-label={`${block.children.length} Unterblöcke`}>{block.children.length}</span>}
              {block.hidden && <EyeOff size={13} className="pe-tree-hidden-icon" aria-label="ausgeblendet" />}
              <span className="pe-tree-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" tabIndex={-1} onClick={act('duplicate')} title="Duplizieren" aria-label={`${label} duplizieren`}><Copy size={13} /></button>
                <button type="button" tabIndex={-1} onClick={act('toggleHidden')} title={block.hidden ? 'Einblenden' : 'Ausblenden'} aria-label={block.hidden ? `${label} einblenden` : `${label} ausblenden`}>{block.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                <button type="button" tabIndex={-1} onClick={act('copy')} title="In andere Seite kopieren" aria-label={`${label} in andere Seite kopieren`}><FolderPlus size={13} /></button>
                <button type="button" tabIndex={-1} onClick={act('move')} title="In andere Seite verschieben" aria-label={`${label} in andere Seite verschieben`}><FolderInput size={13} /></button>
                <button type="button" tabIndex={-1} onClick={act('delete')} title="Löschen" aria-label={`${label} löschen`} className="danger"><Trash2 size={13} /></button>
              </span>
            </div>
          );
        })}
        {blocks.length > 0 && !visible && (
          <div
            className={`pe-tree-end${drop && drop.end ? ' drop-active' : ''}`}
            onDragOver={(e) => {
              if (dragRef.current == null || !canMove(blocks, dragRef.current, lastTop, 'after')) return;
              e.preventDefault();
              if (!drop || !drop.end) setDrop({ end: true });
            }}
            onDrop={(e) => doDrop(e, lastTop, 'after')}
            aria-hidden="true"
          >
            Hier ablegen: ganz nach unten (oberste Ebene)
          </div>
        )}
      </div>

      <div className="pe-outline-foot">
        <button type="button" className="pe-tb-btn pe-tb-btn-primary" onClick={onAddBlock} title="Neuen Block am Ende der Seite hinzufügen">
          <Plus size={14} /> Block hinzufügen
        </button>
        <button type="button" className="pe-tb-btn" onClick={onAddChild} disabled={!selectedPath} title="Unterblock im gewählten Block anlegen">
          <Plus size={14} /> Unterblock
        </button>
      </div>
    </nav>
  );
}
