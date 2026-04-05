import React, { useMemo } from 'react';
import { extractBlockTargets } from '../lib/templateParser';

function buildBlockNodes(blocks, prefix) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  return blocks.map((block, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    const templateLabel = String(block?.template || block?.type || 'Freier Block').trim();
    const blockNumber = path.split('.').map((part) => Number(part) + 1).join('.');
    return {
      type: 'block',
      path,
      label: `${blockNumber}. ${templateLabel}`,
      template: templateLabel,
      slotName: String(block?.slot || '').trim(),
      children: buildBlockNodes(block?.children || [], path)
    };
  });
}

export function parseTemplateStructure(code, options = {}) {
  const blocks = options.blocks || [];
  if (blocks.length === 0) return [];

  const slotNames = extractBlockTargets(String(code || ''))
    .filter((t) => !t.implicit)
    .map((t) => t.name)
    .filter(Boolean);

  if (slotNames.length === 0) {
    return buildBlockNodes(blocks, '');
  }

  const bySlot = {};
  const unassigned = [];
  blocks.forEach((block, index) => {
    const slot = String(block?.slot || '').trim();
    if (slot && slotNames.includes(slot)) {
      if (!bySlot[slot]) bySlot[slot] = [];
      bySlot[slot].push({ block, index });
    } else {
      unassigned.push({ block, index });
    }
  });

  const nodes = slotNames.map((slotName) => {
    const slotBlocks = (bySlot[slotName] || []).map(({ block, index }) => ({
      ...block,
      _origIndex: index
    }));
    return {
      type: 'slot-group',
      slotName,
      label: slotName,
      children: buildBlockNodes(slotBlocks, '')
    };
  });

  if (unassigned.length > 0) {
    const unassignedBlocks = unassigned.map(({ block }) => block);
    nodes.push({
      type: 'slot-group',
      slotName: '',
      label: 'Nicht zugewiesen',
      children: buildBlockNodes(unassignedBlocks, '')
    });
  }

  return nodes;
}

function BlockNode({ node, depth = 0, activeBlockPath, onBlockClick, onSlotClick, activeSlot }) {
  if (node.type === 'slot-group') {
    const slotName = node.slotName;
    const isActiveSlot = Boolean(slotName) && slotName === String(activeSlot || '').trim();
    const isClickable = Boolean(slotName) && typeof onSlotClick === 'function';
    return (
      <div className={`block-outline-group${isActiveSlot ? ' is-active-slot' : ''}`}>
        <div
          className={`block-outline-slot-header${isClickable ? ' is-clickable' : ''}${isActiveSlot ? ' is-active' : ''}`}
          onClick={isClickable ? () => onSlotClick(slotName) : undefined}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSlotClick(slotName); } : undefined}
          aria-label={slotName ? `Slot: ${slotName}` : 'Nicht zugewiesen'}
        >
          <span className="block-outline-slot-icon">⬡</span>
          <span className="block-outline-slot-name">{node.label}</span>
          <span className="block-outline-slot-count">{node.children.length}</span>
        </div>
        <div className="block-outline-slot-children">
          {node.children.length === 0 ? (
            <span className="block-outline-empty-slot">Keine Blöcke in diesem Slot</span>
          ) : (
            node.children.map((child, idx) => (
              <BlockNode
                key={`${child.path}-${idx}`}
                node={child}
                depth={depth + 1}
                activeBlockPath={activeBlockPath}
                onBlockClick={onBlockClick}
                onSlotClick={onSlotClick}
                activeSlot={activeSlot}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // type === 'block'
  const isActive = String(node.path) === String(activeBlockPath || '');
  const isClickable = Boolean(node.path !== undefined) && typeof onBlockClick === 'function';
  return (
    <div className={`block-outline-node depth-${depth % 5}${isActive ? ' is-active' : ''}`}>
      <button
        type="button"
        className={`block-outline-btn${!isClickable ? ' no-action' : ''}`}
        onClick={isClickable ? () => onBlockClick(node.path) : undefined}
        disabled={!isClickable}
        aria-label={node.label}
      >
        <span className="block-outline-dot" />
        <span className="block-outline-label">{node.label}</span>
      </button>
      {Array.isArray(node.children) && node.children.length > 0 && (
        <div className="block-outline-children">
          {node.children.map((child, idx) => (
            <BlockNode
              key={`${child.path}-${idx}`}
              node={child}
              depth={depth + 1}
              activeBlockPath={activeBlockPath}
              onBlockClick={onBlockClick}
              onSlotClick={onSlotClick}
              activeSlot={activeSlot}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplateStructurePreview({
  code,
  emptyLabel = 'Keine Blöcke vorhanden',
  activeSlot = '',
  slotUsage = {},
  onSlotClick = null,
  blocks = [],
  activeBlockPath = '',
  onBlockClick = null,
  previewClassName = ''
}) {
  const nodes = useMemo(() => parseTemplateStructure(code, { blocks }), [code, blocks]);

  return (
    <div className={`block-outline-preview${previewClassName ? ` ${previewClassName}` : ''}`}>
      {nodes.length === 0 ? (
        <div className="block-outline-empty">{emptyLabel}</div>
      ) : (
        nodes.map((node, idx) => (
          <BlockNode
            key={`outline-node-${idx}`}
            node={node}
            depth={0}
            activeBlockPath={activeBlockPath}
            onBlockClick={onBlockClick}
            onSlotClick={onSlotClick}
            activeSlot={activeSlot}
          />
        ))
      )}
    </div>
  );
}
