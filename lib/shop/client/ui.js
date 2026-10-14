// Kleine Helfer fuer die Konto-Ansichten (Paket F2).
import { normalizeLocale } from '../i18n'

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c])

export function localeOf(el) {
  const v = (el && el.getAttribute && el.getAttribute('data-locale')) || (typeof document !== 'undefined' && document.documentElement.lang) || ''
  return normalizeLocale(v)
}

/** Nur https-Links werden ausgegeben, sonst ''. */
export const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '')

/** Nur eigene Shop-API-Pfade (Rechnung, Download). */
export const apiPath = (u) => (typeof u === 'string' && /^\/api\/shop\/[A-Za-z0-9._~%/-]+$/.test(u) && !u.includes('..') ? u : '')

export function loginUrl() {
  const back = typeof window !== 'undefined' ? window.location.pathname : '/'
  return `/member-login?redirect=${encodeURIComponent(back)}`
}

export async function api(url, opts) {
  const res = await fetch(url, opts)
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}
