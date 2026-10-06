import bcrypt from 'bcryptjs';

// Passwortschutz "ohne Konto": eine entschärfte Alternative zur
// Mitglieder-Zugangskontrolle (siehe accessGroups) für einzelne Seiten.
// Besucher*innen geben ein gemeinsames Passwort ein (kein Account, keine
// E-Mail) — siehe pages/api/pages/password-lock.js für die Prüfung beim
// Aufruf der Seite.
//
// Verschachtelte Seiten existieren nur als JSON im `children`-Feld ihrer
// obersten Elternseite (kein eigenes DB-Row) und tragen dieselben Felder wie
// Top-Level-Seiten — deshalb arbeiten beide Funktionen hier rekursiv über
// `children`, genau wie es bereits für `accessGroups` der Fall ist.

// Wandelt ein vom Editor gesendetes Klartext-Passwort (`newAccessPassword`)
// in einen bcrypt-Hash um, bzw. löscht ihn bei `clearAccessPassword`. Lässt
// `accessPasswordHash` unverändert (also gar nicht erst im Objekt gesetzt),
// wenn der Editor das Passwort dieser Seite nicht angefasst hat.
export async function hashPageAccessPasswords(node) {
  if (!node || typeof node !== 'object') return node;

  if (node.newAccessPassword) {
    node.accessPasswordHash = await bcrypt.hash(String(node.newAccessPassword), 12);
  } else if (node.clearAccessPassword) {
    node.accessPasswordHash = null;
  }
  delete node.newAccessPassword;
  delete node.clearAccessPassword;

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      await hashPageAccessPasswords(child);
    }
  }
  return node;
}

// Ersetzt den rohen Hash durch ein reines `passwordProtected`-Flag, bevor eine
// Seite an irgendeinen Client (Admin-UI oder öffentliche Seitenauflösung)
// ausgeliefert wird — der Hash selbst verlässt den Server nie.
export function stripPageAccessPasswords(node) {
  if (!node || typeof node !== 'object') return node;
  const { accessPasswordHash, children, ...rest } = node;
  return {
    ...rest,
    passwordProtected: Boolean(accessPasswordHash),
    children: Array.isArray(children) ? children.map(stripPageAccessPasswords) : children,
  };
}

// Sucht eine Seite (Top-Level oder verschachtelt) per id im kompletten Baum
// und liefert ihren rohen accessPasswordHash — genutzt von password-lock.js,
// das den Hash braucht, ihn aber selbst niemals weitergibt.
export function findPageHashById(nodes, id) {
  for (const node of nodes || []) {
    if (node && String(node.id) === String(id)) return node.accessPasswordHash || null;
    const found = findPageHashById(node.children, id);
    if (found !== undefined && found !== null) return found;
  }
  return null;
}
