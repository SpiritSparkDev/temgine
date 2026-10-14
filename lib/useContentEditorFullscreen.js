import { useEffect } from 'react';

const CLASS_NAME = 'content-editor-fullscreen';

// Jeder Content-Editor (Seiten-, Blog-, Navigations-/Footer-/Widget-,
// Wartungsseiten-Editor) ruft diesen Hook auf, solange er gemountet ist —
// er markiert .admin-scope, damit die linke Hauptnavigation nur noch über
// das Burger-Menü erreichbar ist (siehe styles/admin.css) und der Editor
// den ganzen Bildschirm bekommt. Rein über eine CSS-Markerklasse gelöst,
// damit kein Prop/Context durch AdminPageClient.js und seine Zwischen-
// komponenten bis zum jeweiligen Editor durchgereicht werden muss — der
// vorhandene mobile Burger-Menü-Mechanismus (Klick, Overlay, Schließen)
// funktioniert dadurch unverändert weiter, nur jetzt auf jeder Breite.
export function useContentEditorFullscreen(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const scope = document.querySelector('.admin-scope');
    if (!scope) return undefined;
    scope.classList.add(CLASS_NAME);
    return () => scope.classList.remove(CLASS_NAME);
  }, [active]);
}
