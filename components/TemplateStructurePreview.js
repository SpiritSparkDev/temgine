import React, { useMemo } from 'react';
import { extractBlockTargets } from '../lib/templateParser';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function countTotalBlocks(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;

  return blocks.reduce((total, block) => total + 1 + countTotalBlocks(block?.children || []), 0);
}

function buildPageBlockNodes(blocks = [], prefix = '') {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  return blocks.map((block, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    const slotName = String(block?.slot || '').trim();
    const templateLabel = String(block?.template || block?.type || 'Freier Block').trim();
    const blockNumber = path.split('.').map((part) => Number(part) + 1).join('.');

    return {
      label: `Block ${blockNumber}: ${templateLabel}`,
      type: 'page-block',
      path,
      slotName,
      children: buildPageBlockNodes(block?.children || [], path)
    };
  });
}

function cloneNodes(nodes = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  return nodes.map((node) => ({
    ...node,
    children: cloneNodes(node.children || [])
  }));
}

function buildTopLevelBlockBuckets(blocks = [], defaultSlotName = '') {
  const allTopLevelNodes = buildPageBlockNodes(blocks);
  const bySlot = {};
  const unassigned = [];

  allTopLevelNodes.forEach((node) => {
    const slotName = String(node.slotName || '').trim() || defaultSlotName;
    if (slotName) {
      if (!bySlot[slotName]) bySlot[slotName] = [];
      bySlot[slotName].push(node);
      return;
    }
    unassigned.push(node);
  });

  return {
    allTopLevelNodes,
    bySlot,
    unassigned,
    totalBlockCount: countTotalBlocks(blocks)
  };
}

function appendFallbackBlocksNode(nodes = [], fallbackNode) {
  if (!fallbackNode) return;

  const firstTagNode = Array.isArray(nodes)
    ? nodes.find((node) => node && node.type === 'tag')
    : null;

  if (firstTagNode) {
    firstTagNode.children = [...(firstTagNode.children || []), fallbackNode];
    return;
  }

  if (Array.isArray(nodes)) {
    nodes.push(fallbackNode);
  }
}

export function parseTemplateStructure(code, options = {}) {
  if (!code || typeof code !== 'string') return [];

  const pageBlocks = options.blocks || [];
  const blockTargets = extractBlockTargets(code);
  const implicitTargets = blockTargets.filter((target) => target.implicit);
  const firstImplicitTargetName = implicitTargets[0]?.name || '';
  const {
    allTopLevelNodes,
    bySlot,
    unassigned,
    totalBlockCount
  } = buildTopLevelBlockBuckets(pageBlocks, firstImplicitTargetName);

  const root = { label: 'root', type: 'root', children: [] };
  const stack = [root];
  const tokenRegex = /<\/?[a-zA-Z][^>]*>|\{\{\{[^}]+\}\}\}|\{\{[^}]+\}\}/g;
  const tokens = String(code).match(tokenRegex) || [];
  let hasRenderedBlockTarget = false;
  let implicitTargetIndex = 0;

  for (const token of tokens.slice(0, 200)) {
    if (/^<\//.test(token)) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    if (/^</.test(token)) {
      const tagMatch = token.match(/^<\s*([a-zA-Z0-9-]+)/);
      if (!tagMatch) continue;
      const tagName = tagMatch[1].toLowerCase();
      const selfClosing = /\/>$/.test(token) || VOID_TAGS.has(tagName);
      const node = { label: tagName, type: 'tag', children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }

    if (/^\{\{/.test(token)) {
      if (/^\{\{\{?\s*blocks?\s*\}?\}\}$/.test(token)) {
        const implicitTarget = implicitTargets[implicitTargetIndex++] || null;
        const slotName = implicitTarget?.name || firstImplicitTargetName;
        const slotChildren = slotName ? cloneNodes(bySlot[slotName] || []) : cloneNodes(allTopLevelNodes);
        hasRenderedBlockTarget = true;
        stack[stack.length - 1].children.push({
          label: implicitTarget?.placeholder || 'blocks',
          type: 'block-slot',
          slotName,
          implicit: true,
          totalBlockCount,
          children: slotChildren.length > 0
            ? slotChildren
            : [{ label: 'Keine Blöcke', type: 'empty-blocks', children: [] }]
        });
        continue;
      }

      const dynamicSlotMatch = token.match(/^\{\{\{\s*blockSlot:([^}]+?)\s*\}\}\}$/);
      const legacyBlockMatch = token.match(/^\{\{\{\s*blockTemplate:([^|}]+?)(?:\|([^}]+))?\s*\}\}\}$/);
      if (dynamicSlotMatch) {
        const slotName = String(dynamicSlotMatch[1] || '').trim();
        hasRenderedBlockTarget = true;
        stack[stack.length - 1].children.push({
          label: `slot: ${slotName}`,
          type: 'block-slot',
          slotName,
          children: cloneNodes(bySlot[slotName] || [])
        });
      } else if (legacyBlockMatch) {
        const slotTemplate = String(legacyBlockMatch[1] || '').trim();
        stack[stack.length - 1].children.push({ label: `legacy block: ${slotTemplate}`, type: 'block-slot', children: [] });
      } else {
        stack[stack.length - 1].children.push({ label: token, type: 'placeholder', children: [] });
      }
    }
  }

  if ((!hasRenderedBlockTarget || implicitTargets.length === 0) && unassigned.length > 0) {
    appendFallbackBlocksNode(root.children, {
      label: 'blocks',
      type: 'blocks-placeholder',
      totalBlockCount,
      children: cloneNodes(unassigned)
    });
  }

  return root.children;
}

function TemplateWireNode({ node, depth = 0, activeSlot, slotUsage, onSlotClick, activeBlockPath, onBlockClick, showDevHints = false }) {
  const depthClass = `template-wire-depth-${depth % 5}`;
  const placeholderClass = node.type === 'placeholder' ? ' placeholder' : '';
  const blocksPlaceholderClass = node.type === 'blocks-placeholder' ? ' blocks-placeholder' : '';
  const emptyBlocksClass = node.type === 'empty-blocks' ? ' empty-blocks' : '';
  const slotName = node.type === 'block-slot' ? String(node.slotName || '').trim() : '';
  const isSlot = node.type === 'block-slot';
  const isActiveSlot = Boolean(slotName) && slotName === String(activeSlot || '').trim();
  const mappedCount = slotName ? Number(slotUsage?.[slotName] || 0) : 0;
  const isMapped = mappedCount > 0;
  const clickable = isSlot && Boolean(slotName) && typeof onSlotClick === 'function';
  const blockPath = node.type === 'page-block' ? String(node.path || '') : '';
  const isBlock = node.type === 'page-block';
  const isBlocksPlaceholder = node.type === 'blocks-placeholder';
  const isActiveBlock = Boolean(blockPath) && blockPath === String(activeBlockPath || '').trim();
  const clickableBlock = isBlock && Boolean(blockPath) && typeof onBlockClick === 'function';
  const totalBlockCount = isBlocksPlaceholder ? Number(node.totalBlockCount || 0) : 0;
  const blockSlotClasses = isSlot
    ? ` block-slot${isActiveSlot ? ' is-active' : ''}${isMapped ? ' is-mapped' : ''}${clickable ? ' is-clickable' : ''}`
    : '';
  const pageBlockClasses = isBlock
    ? ` page-block${isActiveBlock ? ' is-active' : ''}${clickableBlock ? ' is-clickable' : ''}`
    : '';

  const nodeClasses = `template-wire-node ${depthClass}${placeholderClass}${blocksPlaceholderClass}${emptyBlocksClass}${blockSlotClasses}${pageBlockClasses}`;
  const slotButtonTitle = slotName
    ? `Komponente: Slot ${slotName}. Funktion: Block diesem Slot zuweisen.`
    : `Komponente: Slot. Funktion: Block zuweisen.`;
  const blockButtonTitle = blockPath
    ? `Komponente: ${node.label}. Funktion: Diesen Block im Editor fokussieren.`
    : `Komponente: Block. Funktion: Im Editor fokussieren.`;
  const nodeTitle = isBlocksPlaceholder
    ? `Komponente: ${node.label}. Gesamtzahl aller Blöcke: ${totalBlockCount}.`
    : isSlot
    ? (slotName
      ? `Komponente: Slot ${slotName}${isMapped ? `. Zugewiesene Blöcke: ${mappedCount}.` : '. Noch kein Block zugewiesen.'}`
      : 'Komponente: Slot ohne Namen.')
    : isBlock
      ? `Komponente: ${node.label}.`
      : `Komponente: ${node.label}.`;

  return (
    <div className={nodeClasses}>
      {clickable ? (
        <button
          type="button"
          className="template-wire-slot-btn"
          onClick={() => onSlotClick(slotName)}
          title={showDevHints ? slotButtonTitle : undefined}
          aria-label={slotButtonTitle}
        >
          <span className="template-wire-label">{node.label}</span>
          {isMapped && <span className="template-wire-slot-count">{mappedCount}</span>}
        </button>
      ) : clickableBlock ? (
        <button
          type="button"
          className="template-wire-slot-btn"
          onClick={() => onBlockClick(blockPath)}
          title={showDevHints ? blockButtonTitle : undefined}
          aria-label={blockButtonTitle}
        >
          <span className="template-wire-label">{node.label}</span>
          {slotName && <span className="template-wire-slot-count">{slotName}</span>}
        </button>
      ) : (
        <div className="template-wire-label" title={showDevHints ? nodeTitle : undefined}>
          {node.label}
          {isBlocksPlaceholder && <span className="template-wire-slot-count">{totalBlockCount}</span>}
          {isMapped && <span className="template-wire-slot-count">{mappedCount}</span>}
          {!isMapped && slotName && <span className="template-wire-slot-count">{slotName}</span>}
        </div>
      )}
      {Array.isArray(node.children) && node.children.length > 0 && (
        <div className="template-wire-children">
          {node.children.map((child, idx) => (
            <TemplateWireNode
              key={`${child.label}-${idx}`}
              node={child}
              depth={depth + 1}
              activeSlot={activeSlot}
              slotUsage={slotUsage}
              onSlotClick={onSlotClick}
              activeBlockPath={activeBlockPath}
              onBlockClick={onBlockClick}
              showDevHints={showDevHints}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplateStructurePreview({
  code,
  emptyLabel = 'Keine Struktur erkannt',
  activeSlot = '',
  slotUsage = {},
  onSlotClick = null,
  blocks = [],
  activeBlockPath = '',
  onBlockClick = null,
  previewClassName = 'template-wire-preview'
}) {
  const nodes = useMemo(() => parseTemplateStructure(code, { blocks }), [code, blocks]);
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

  return (
    <div
      className={previewClassName}
      title={showDevHints ? 'Komponente: Strukturvorschau. Zeigt Template-Tags, Slots und zugeordnete Blöcke.' : undefined}
      aria-label="Strukturvorschau fuer Template-Struktur und Slot-Zuordnung"
    >
      {nodes.length === 0 ? (
        <div className="template-wire-empty">{emptyLabel}</div>
      ) : (
        nodes.map((node, idx) => (
          <TemplateWireNode
            key={`wire-node-${idx}`}
            node={node}
            activeSlot={activeSlot}
            slotUsage={slotUsage}
            onSlotClick={onSlotClick}
            activeBlockPath={activeBlockPath}
            onBlockClick={onBlockClick}
            showDevHints={showDevHints}
          />
        ))
      )}
    </div>
  );
}
