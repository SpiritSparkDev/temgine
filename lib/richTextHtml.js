// HTML <-> Editor-Wert für den WYSIWYG-Editor. Gespeichert wird HTML; ältere
// Markdown-Werte werden erst beim Bearbeiten (nicht beim Öffnen) umgewandelt.
import { marked } from 'marked';

const HAS_TAG = /<[a-z][\s\S]*>/i;

/** Gespeicherter Wert (Markdown oder HTML) → HTML für TipTap. */
export function toEditorHtml(value) {
  if (!value || typeof value !== 'string') return '';
  if (HAS_TAG.test(value)) return value;
  return marked.parse(value, { breaks: true, gfm: true });
}

/** TipTap-HTML → Speicherwert. Leere Absätze bleiben als Leerzeile sichtbar (<p><br></p>). */
export function fromEditorHtml(html) {
  if (!html || html === '<p></p>') return '';
  return html.replace(/<p><\/p>/g, '<p><br></p>');
}
