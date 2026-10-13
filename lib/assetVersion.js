import fs from 'fs';

// Hängt die Änderungszeit der Datei als ?v=… an eine Asset-URL an. server.js liefert
// /extern_css und /extern_js mit "max-age=3600, immutable" aus — ohne Versions-Parameter
// sähen Besucher Änderungen am Stylesheet/Script bis zu einer Stunde lang nicht.
export function versionedHref(href, filePath) {
  try {
    return `${href}?v=${Math.floor(fs.statSync(filePath).mtimeMs).toString(36)}`;
  } catch (_e) {
    return href;
  }
}
