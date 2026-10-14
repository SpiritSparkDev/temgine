// CSV für Excel (de): ';' als Trenner, CRLF, Anführungszeichen-Escaping, Formelschutz für Textzellen

/** 2490 -> '24,90'; -500 -> '-5,00' (ohne Währungssymbol); null/ungültig -> '' */
export function formatCents(cents) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return ''
  const abs = Math.abs(Math.round(cents))
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Textzellen, die Excel als Formel deuten könnte, bekommen ' vorangestellt */
export function guardFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function cell(value, isNumber) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (!isNumber && typeof value !== 'number') s = guardFormula(s)
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * rows: Array von Objekten; columns: [{ key, header, number? }].
 * `number: true` (oder ein JS-Number-Wert) = Zahlenzelle, kein Formelschutz (z. B. '-5,00' aus formatCents).
 * Kein BOM: den fügt nur der Export hinzu.
 */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => cell(c.header, false)).join(';')]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key], c.number === true)).join(';'))
  return lines.join('\r\n') + '\r\n'
}
