// Befehle, Voreinstellungen und Einfüge-Aufbereitung des WYSIWYG-Editors
// (Angleichung an SparkDown, E:\Werkbank\markdown_desktop_app).

// g = Gruppe (Trenner zwischen Gruppen), md = Markdown-Klammer, pre = Zeilenpräfix,
// line = Überschrift-Präfix (Quelltext-Ansicht). fmt = Schnitt des Kurzlabels.
const NL = '\n';
const heading = (n) => ({ g: 2, l: 'H' + n, n: 'Überschrift ' + n, line: '#'.repeat(n) + ' ' });
export const CMD_META = {
  undo: { g: 0, l: '↶', n: 'Rückgängig' },
  redo: { g: 0, l: '↷', n: 'Wiederholen' },
  b: { g: 1, l: 'B', fmt: 'b', n: 'Fett', md: ['**', '**'] },
  i: { g: 1, l: 'I', fmt: 'i', n: 'Kursiv', md: ['*', '*'] },
  u: { g: 1, l: 'U', fmt: 'u', n: 'Unterstrichen', md: ['<u>', '</u>'] },
  s: { g: 1, l: 'S', fmt: 's', n: 'Durchgestrichen', md: ['~~', '~~'] },
  code: { g: 1, l: '</>', n: 'Inline-Code', md: ['`', '`'] },
  p: { g: 2, l: '¶', n: 'Absatz', line: '' },
  h1: heading(1), h2: heading(2), h3: heading(3), h4: heading(4), h5: heading(5),
  ul: { g: 3, l: '•≡', n: 'Aufzählung', pre: '- ' },
  ol: { g: 3, l: '1≡', n: 'Nummerierung', pre: '1. ' },
  quote: { g: 3, l: '❝', n: 'Zitat', pre: '> ' },
  codeblock: { g: 4, l: '{ }', n: 'Codeblock', md: ['```' + NL, NL + '```'] },
  hr: { g: 4, l: '―', n: 'Trennlinie', md: [NL + '---' + NL, ''] },
  table: { g: 4, l: '▦', n: 'Tabelle einfügen', md: [['', '| Spalte 1 | Spalte 2 | Spalte 3 |', '| --- | --- | --- |', '|  |  |  |', '|  |  |  |', ''].join(NL), ''] },
  link: { g: 4, l: 'Link', n: 'Link einfügen' },
  image: { g: 4, l: 'Bild', n: 'Bild einfügen' },
};

export const DEFAULT_BAR = ['undo', 'redo', 'b', 'i', 'u', 's', 'code', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'quote', 'codeblock', 'hr', 'table', 'link', 'image'];

const STORE_KEY = 'temgine.richText.v1';
const DEFAULT_PREFS = { bar: DEFAULT_BAR, zoom: 1, view: 'wys' };

export function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {};
    const bar = Array.isArray(s.bar) ? s.bar.filter((id) => CMD_META[id]) : DEFAULT_BAR;
    return {
      bar,
      zoom: Math.min(2, Math.max(0.5, Number(s.zoom) || 1)),
      view: ['md', 'wys', 'split'].includes(s.view) ? s.view : DEFAULT_PREFS.view,
    };
  } catch (e) {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* ohne localStorage weiter */ }
}

// Word/OpenOffice liefern Listen als <p style="mso-list:..."> statt <ul>/<ol>: in echte Listen umbauen.
// ponytail: nur eine Ebene, Verschachtelung geht verloren; bei Bedarf "level N" aus mso-list auswerten.
export function fixWordLists(html) {
  if (!/mso-list/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let list = null;
  for (const p of [...doc.querySelectorAll('p')]) {
    if (!/mso-list/i.test(p.getAttribute('style') || '')) { list = null; continue; }
    const marker = p.querySelector('[style*="mso-list:Ignore" i]');
    const ordered = /\d|^[a-z]\.|^[ivx]+\./i.test(marker ? marker.textContent.trim() : '');
    marker?.remove();
    if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) { list = doc.createElement(ordered ? 'ol' : 'ul'); p.before(list); }
    const li = doc.createElement('li'); li.innerHTML = p.innerHTML; list.append(li); p.remove();
  }
  return doc.body.innerHTML;
}

/** Quelltext (Markdown) → Eingabe für TipTap: eigene `<br>`-Zeilen sind Leerzeilen. */
export const srcToContent = (md) => md.replace(/^<br>[ \t]*$/gm, '<p></p>');
