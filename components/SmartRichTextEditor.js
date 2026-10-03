import React from 'react';
import RichTextEditor from './RichTextEditor';
import WysiwygRichTextEditor from './WysiwygRichTextEditor';

/**
 * Rendert je nach global unter Einstellungen → Rich-Text-Editor gewähltem
 * Modus ('markdown' | 'wysiwyg', siehe lib/useRichTextEditorMode.js)
 * entweder den bisherigen Markdown-Editor (RichTextEditor) oder den
 * TipTap-WYSIWYG-Editor (WysiwygRichTextEditor). Identische übrige Props
 * wie RichTextEditor — Aufrufer tauschen nur den Import.
 */
export default function SmartRichTextEditor({ mode, ...props }) {
  if (mode === 'wysiwyg') return <WysiwygRichTextEditor {...props} />;
  return <RichTextEditor {...props} />;
}
