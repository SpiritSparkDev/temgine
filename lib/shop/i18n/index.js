// Texte des Shops in Deutsch (Standard) und Englisch. Je Domäne eine Datei, siehe Spezifikation §7.4:
//   mail.js (Mails), storefront.js (Kauf), account.js (Konto, Rückgabe, Wunschliste). Rechnungstexte stehen in invoice.js.
import mail from './mail'
import storefront from './storefront'
import account from './account'

export const LOCALES = ['de', 'en']
export const DEFAULT_LOCALE = 'de'

const DICTS = { de: {}, en: {} }
for (const domain of [mail, storefront, account]) {
  for (const l of LOCALES) Object.assign(DICTS[l], (domain && domain[l]) || {})
}

/** Gültige Sprache oder fallback. */
export function normalizeLocale(locale, fallback = DEFAULT_LOCALE) {
  const l = String(locale || '').toLowerCase().slice(0, 2)
  return LOCALES.includes(l) ? l : fallback
}

/**
 * Übersetzt einen Schlüssel; fehlt er in der Sprache, gilt Deutsch, fehlt er auch dort, der Schlüssel selbst.
 * Platzhalter {name} werden aus vars ersetzt (Werte werden nicht escaped: bei HTML-Ausgabe vorher escapen).
 */
export function t(locale, key, vars = {}) {
  const l = normalizeLocale(locale)
  const raw = DICTS[l][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key
  return String(raw).replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m))
}

/** Gesamtes Wörterbuch einer Sprache (z. B. für die Auslieferung an den Browser). */
export function dictionary(locale) {
  return { ...DICTS[DEFAULT_LOCALE], ...DICTS[normalizeLocale(locale)] }
}
