import { useRef, useState } from 'react';

// Breite der linken Spalte (Live-Vorschau) in Prozent für den Split-Modus
// eines Content-Editors — per Ziehen am Trenner verstellbar und je Browser
// gemerkt (storageKey trennt die Vorlieben von Seiten-/Blog-/Nav-Editor etc.
// voneinander). Gemeinsam genutzt von allen Content-Editoren (siehe
// components/PageEditor.js, BlogPostEditor.js, ...), damit Lese-/Schreib-
// Logik und Drag-Mechanik nicht mehrfach dupliziert werden.
export function useSplitPaneRatio(storageKey, defaultPct = 75) {
  const [ratio, setRatio] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey));
      return saved >= 30 && saved <= 85 ? saved : defaultPct;
    } catch (_e) {
      return defaultPct;
    }
  });
  const workspaceRef = useRef(null);
  const dragStateRef = useRef(null);

  function startDrag(e) {
    const workspaceEl = workspaceRef.current;
    if (!workspaceEl) return;
    e.preventDefault();
    dragStateRef.current = { rect: workspaceEl.getBoundingClientRect() };
    const onMove = (moveEvent) => {
      const { rect } = dragStateRef.current || {};
      if (!rect || rect.width <= 0) return;
      const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setRatio(Math.min(85, Math.max(30, Math.round(pct))));
    };
    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      setRatio((current) => {
        try { window.localStorage.setItem(storageKey, String(current)); } catch (_e) {}
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  return { ratio, workspaceRef, startDrag };
}
