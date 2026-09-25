// Kleine, reine Helfer rund um den (bereits pro Seite mit vollständigen
// Pfaden aufgebauten) verschachtelten Seitenbaum — isomorph, keine
// Node-only-Abhängigkeiten, da auch clientseitig importiert
// (pages/index.js, pages/[...slug].js).

/**
 * Sucht im verschachtelten Seitenbaum (Ausgabe von buildNestedPages, jeder
 * Knoten braucht mind. { id, children }) die Seite mit der übergebenen ID
 * und gibt deren direkte Unterseiten zurück — oder [] wenn nicht gefunden.
 * Reine Tiefensuche über die gesamte Baumtiefe, unabhängig davon, ob die
 * gesuchte Seite eine Top-Level-Seite oder tief verschachtelt ist.
 * @param {Array} nestedPages
 * @param {string} pageId
 * @returns {Array}
 */
export function findChildPagesById(nestedPages, pageId) {
  if (!pageId) return [];

  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node && node.id === pageId) return node.children || [];
      if (node && Array.isArray(node.children) && node.children.length > 0) {
        const found = walk(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(nestedPages) || [];
}
