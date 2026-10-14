// Geld in ganzen Cent (EUR, brutto), Steuersatz in Hundertstel-Prozent (700 = 7 %)

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/** 2490 -> '24,90 €' (Leerzeichen vor dem Symbol ist ein NBSP, wie Intl es liefert) */
export function formatEuro(cents) {
  return fmt.format(cents / 100)
}

/**
 * Eingabe wie '24,90', '24.9', '1.234,50' oder '' -> { ok, cents }.
 * Leer = { ok: true, cents: null }; ungültig = { ok: false, cents: null }.
 */
export function parsePriceInput(input) {
  if (input === null || input === undefined) return { ok: true, cents: null }
  let s = String(input).trim().replace(/\s|€/g, '')
  if (s === '') return { ok: true, cents: null }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, cents: null }
  return { ok: true, cents: Math.round(parseFloat(s) * 100) }
}

/** '7' | '19,5' -> 700 | 1950; leer -> { ok: true, bp: null }; ungültig -> { ok: false, bp: null } */
export function percentToBp(input) {
  if (input === null || input === undefined) return { ok: true, bp: null }
  const s = String(input).trim().replace('%', '').replace(',', '.').trim()
  if (s === '') return { ok: true, bp: null }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, bp: null }
  const bp = Math.round(parseFloat(s) * 100)
  return bp > 10000 ? { ok: false, bp: null } : { ok: true, bp }
}

/** 700 -> '7', 1950 -> '19,5' (für Eingabefelder); null -> '' */
export function bpToPercent(bp) {
  if (bp === null || bp === undefined) return ''
  return String(bp / 100).replace('.', ',')
}

/** In einer Bruttoposition enthaltene MwSt. in Cent */
export function vatIncluded(lineCents, bp) {
  return Math.round((lineCents * bp) / (10000 + bp))
}

/** Betrag in Cent als Währungstext, z. B. formatMoney(2490, 'EUR', 'de') -> "24,90 €". Alle Shop-Währungen haben 2 Nachkommastellen. */
export function formatMoney(cents, currency = 'EUR', locale = 'de') {
  const tag = locale === 'en' ? 'en-GB' : 'de-DE'
  return new Intl.NumberFormat(tag, { style: 'currency', currency }).format((cents || 0) / 100)
}
