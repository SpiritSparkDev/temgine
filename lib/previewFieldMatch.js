// Welches Feld eines Blocks gehört zum Klick in der Vorschau? Abgleich über Text bzw. Bild-/Link-URL
// (Heuristik: ohne Template-Markierung).
//
// Ein Klick trifft nicht immer exakt das Element des Felds — Zeilenabstand,
// Innenabstand oder ein Container ohne eigenen Text führen dazu, dass
// e.target (und damit der übergebene "text") ein Vorfahre ist, dessen
// Textinhalt mehrere Felder aneinanderhängt (z. B. "Titel\nText\nListe").
// Ein einfacher "ist der Klicktext im Feldwert enthalten"-Test schlägt dann
// fehl, weil es andersherum ist: der Feldwert steckt im (größeren) Klicktext.
// Deshalb werden alle Kandidaten gesammelt und nach Treffer-Qualität
// bewertet statt beim ersten Treffer in Objekt-Reihenfolge abzubrechen —
// bei mehreren im Klicktext enthaltenen Feldern gewinnt der längste (= der
// spezifischste, am wenigsten zufällige) Treffer.
export function findFieldForPreviewClick(block, { text, src, href }) {
  if (!block || !block.props) return '';
  const norm = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const t = norm(text);
  const urlMatch = (val, u) => u && typeof val === 'string' && val && (u === val || u.endsWith(val) || val.endsWith(u));

  const candidates = [];
  const consider = (key, val) => {
    if (typeof val !== 'string' || !val) return;
    if (urlMatch(val, src) || urlMatch(val, href)) {
      candidates.push({ key, score: Infinity });
      return;
    }
    const nv = norm(val);
    if (!t || !nv || nv.length < 2) return;
    if (nv === t) {
      candidates.push({ key, score: 1e6 + nv.length });
    } else if (t.length >= 4 && nv.includes(t)) {
      // Klicktext ist ein spezifisches Teilstück des (längeren) Feldwerts.
      candidates.push({ key, score: 1e3 + nv.length });
    } else if (nv.length >= 4 && t.includes(nv)) {
      // Feldwert steckt als eigenständiges Stück im (größeren) Klicktext.
      candidates.push({ key, score: nv.length });
    }
  };

  for (const [key, val] of Object.entries(block.props)) {
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        for (const [sub, subVal] of Object.entries(val[i] || {})) {
          consider(`${key}.${i}.${sub}`, subVal);
        }
      }
    } else {
      consider(key, val);
    }
  }

  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0].key;
  // Überschrift-Felder: Eingabe liegt im <name>Text-Feld (nur für direkte
  // Block-Felder — Repeater-Keys "key.i.sub" enthalten bereits einen Punkt).
  return (!best.includes('.') && block.props[`${best}Text`] !== undefined) ? `${best}Text` : best;
}
