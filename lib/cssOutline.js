// Gliedert CSS-Quelltext in durchsuchbare Einträge für die Seitenleiste des
// CSS-Editors: Selektoren (je Komma-Teil), @-Regeln und Custom Properties
// (--name), jeweils mit Zeilennummer (1-basiert). Kommentare und Strings
// werden vorher ausgeblendet; Zeilenumbrüche bleiben erhalten.
// ponytail: kein vollwertiger Parser — Klammern/Semikolons in url(data:…) können einzelne Einträge verfälschen.

function splitSelectors(chunk, firstLine) {
  const res = [];
  let depth = 0, cur = '', curLine = firstLine, nl = firstLine;
  const push = () => { if (cur.trim()) res.push({ kind: 'selector', name: cur.trim().replace(/\s+/g, ' '), line: curLine }); cur = ''; };
  for (const ch of chunk) {
    if (ch === '\n') nl++;
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { push(); continue; }
    if (!cur.trim() && ch.trim()) curLine = nl;
    cur += ch;
  }
  push();
  return res;
}

export function parseCssOutline(src) {
  const text = String(src || '')
    .replace(/\/\*[\s\S]*?(\*\/|$)|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m.replace(/[^\n]/g, ' '));
  const out = [];
  let chunk = '', chunkLine = 1, line = 1;
  for (const ch of text) {
    if (ch === '{') {
      const t = chunk.trim();
      if (t[0] === '@') out.push({ kind: 'at', name: t.replace(/\s+/g, ' '), line: chunkLine });
      else if (t) out.push(...splitSelectors(t, chunkLine));
      chunk = '';
    } else if (ch === ';' || ch === '}') {
      const m = /^\s*(--[\w-]+)\s*:/.exec(chunk);
      if (m) out.push({ kind: 'var', name: m[1], line: chunkLine });
      chunk = '';
    } else {
      if (!chunk.trim() && ch.trim()) chunkLine = line;
      chunk += ch;
    }
    if (ch === '\n') line++;
  }
  return out;
}
