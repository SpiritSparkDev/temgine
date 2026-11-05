// Fehlertext zu einer Server-Antwort { error, code }: Deutsch = Servertext, sonst Wörterbuch shop.error.<CODE>, sonst Fallback.
import { t } from '../i18n'

export function errorText(locale, data, fallbackKey) {
  const d = data || {}
  if (locale === 'de' && d.error) return d.error
  const key = `shop.error.${d.code}`
  const text = d.code ? t(locale, key) : key
  return text !== key ? text : t(locale, fallbackKey)
}
