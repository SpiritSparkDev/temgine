// Kleine, reine Helfer rund um den Seitenbaum — isomorph, keine
// Node-only-Abhängigkeiten, da auch clientseitig importiert
// (pages/index.js, pages/[...slug].js).
//
// Unterseiten leben nicht als eigene DB-Zeilen, sondern als JSON innerhalb
// des children-Felds ihrer Top-Level-Seite (siehe Kommentar in
// pages/api/pages.js). Ihre id wird rein clientseitig vergeben
// (Math.random()-basiert in PageTreeEditor.js) und ist daher nicht so
// verlässlich wie ein echter DB-Primärschlüssel — z. B. bei älteren,
// importierten oder migrierten Seiten kann sie fehlen oder unerwartet
// abweichen. Der Slug-Pfad dagegen ist exakt das, worüber die Seite selbst
// im Routing gefunden wurde, und daher die robustere Suchgrundlage.

/**
 * Sucht im UNGEFILTERTEN, rohen Seitenbaum (jeder Knoten braucht mind.
 * { slug, children }, roh wie von der API/DB kommend — auch Entwürfe
 * enthalten) die Seite mit dem übergebenen, bereits vollständigen
 * Slug-Pfad (z. B. "leistungen/beratung") und gibt { node, parentPath }
 * zurück, wobei parentPath dem übergebenen targetPath entspricht (auf
 * führende/folgende Slashes normalisiert).
 *
 * Bewusst ungefiltert: die aktuell angezeigte Seite kann selbst ein
 * Entwurf sein (z. B. Vorschau vor Veröffentlichung) und würde in einem
 * bereits auf PUBLISHED gefilterten Baum gar nicht erst auftauchen — dann
 * ließe sich "meine eigenen Unterseiten" nicht mehr finden, obwohl die
 * Unterseiten selbst längst veröffentlicht sind. Das Filtern passiert erst
 * danach, wenn der Aufrufer node.children mit seiner eigenen
 * buildNestedPages(...) (dieselbe Funktion, die auch den Rest des Baums
 * baut) in die fertige Nav-Form bringt.
 *
 * @param {Array} rawNodes
 * @param {string} targetPath
 * @param {string} parentPath
 * @returns {{node: object, parentPath: string} | null}
 */
export function findRawPageNodeByPath(rawNodes, targetPath, parentPath = '') {
  const normalizedTarget = String(targetPath || '').replace(/^\/+|\/+$/g, '');
  if (!normalizedTarget) return null;

  for (const node of rawNodes || []) {
    if (!node) continue;
    const fullSlug = parentPath ? `${parentPath}/${node.slug}` : String(node.slug || '');
    if (fullSlug === normalizedTarget) return { node, parentPath: fullSlug };
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findRawPageNodeByPath(node.children, normalizedTarget, fullSlug);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Wie findRawPageNodeByPath, sucht aber per ID statt per Pfad — nützlich für
 * die Startseite (pages/index.js), die keinem URL-Pfadsegment entspricht,
 * unabhängig davon, ob sie selbst verschachtelt im Baum liegt.
 *
 * @param {Array} rawNodes
 * @param {string} targetId
 * @param {string} parentPath
 * @returns {{node: object, parentPath: string} | null}
 */
export function findRawPageNodeById(rawNodes, targetId, parentPath = '') {
  if (!targetId) return null;

  for (const node of rawNodes || []) {
    if (!node) continue;
    const fullSlug = parentPath ? `${parentPath}/${node.slug}` : String(node.slug || '');
    if (node.id === targetId) return { node, parentPath: fullSlug };
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findRawPageNodeById(node.children, targetId, fullSlug);
      if (found) return found;
    }
  }

  return null;
}
