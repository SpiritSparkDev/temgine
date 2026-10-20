import { useState, useEffect } from 'react';

export const RICH_TEXT_EDITOR_MODE_KEY = 'richTextEditorMode';
const DEFAULT_MODE = 'wysiwyg';

/**
 * Liefert den global unter Einstellungen → Rich-Text-Editor gewählten Modus
 * ('markdown' | 'wysiwyg'). Lädt einmal pro Komponenten-Mount von
 * /api/settings; bis die Antwort da ist (oder falls nichts gespeichert
 * wurde) gilt 'wysiwyg' als Standard.
 * @returns {'markdown' | 'wysiwyg'}
 */
export function useRichTextEditorMode() {
  const [mode, setMode] = useState(DEFAULT_MODE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data[RICH_TEXT_EDITOR_MODE_KEY] === 'markdown') setMode('markdown');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
