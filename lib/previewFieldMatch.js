// Welches Feld eines Blocks gehört zum Klick in der Vorschau? Abgleich über Text bzw. Bild-/Link-URL
// (Heuristik: ohne Template-Markierung; Treffer in Repeater-Einträgen führen nur zum Block).
export function findFieldForPreviewClick(block, { text, src, href }) {
  if (!block || !block.props) return '';
  const norm = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const t = norm(text);
  const urlMatch = (val, u) => u && typeof val === 'string' && val && (u === val || u.endsWith(val) || val.endsWith(u));
  const textMatch = (val) => {
    const nv = norm(val);
    return t && nv && nv.length >= 2 && (nv === t || (t.length >= 4 && nv.includes(t)));
  };
  const matches = (val) => typeof val === 'string' && val && (urlMatch(val, src) || urlMatch(val, href) || textMatch(val));
  for (const [key, val] of Object.entries(block.props)) {
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        for (const [sub, subVal] of Object.entries(val[i] || {})) {
          if (matches(subVal)) return `${key}.${i}.${sub}`;
        }
      }
    } else if (matches(val)) {
      // Überschrift-Felder: Eingabe liegt im <name>Text-Feld
      return block.props[`${key}Text`] !== undefined ? `${key}Text` : key;
    }
  }
  return '';
}
