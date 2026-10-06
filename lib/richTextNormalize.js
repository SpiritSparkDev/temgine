// Gemeinsame Normalisierung für Rich-Text-Felder — von RichTextEditor.js
// (Markdown) UND WysiwygRichTextEditor.js (TipTap) genutzt, damit beide
// Editoren mit demselben gespeicherten Wert gleich umgehen, egal welcher
// Editor-Modus gerade aktiv ist (Einstellungen → Rich-Text-Editor).

/**
 * Wandelt eingehendes Legacy-HTML (aus einer Zeit vor dem Markdown-Editor)
 * in grobes Markdown um, damit es in beiden Editoren als saubere Syntax
 * statt als rohe Tags erscheint. Ist der Wert bereits Markdown/Klartext,
 * bleibt er unverändert.
 * @param {string} html
 * @returns {string}
 */
export function htmlToMd(html) {
  if (!html || typeof html !== 'string') return html || '';
  if (!/<[a-z]/i.test(html)) return html; // already plain text / markdown
  return html
    .replace(/<strong>([\/\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\/\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\/\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i>([\/\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<del>([\/\s\S]*?)<\/del>/gi, '~~$1~~')
    .replace(/<s>([\/\s\S]*?)<\/s>/gi, '~~$1~~')
    .replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<li>([\/\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
