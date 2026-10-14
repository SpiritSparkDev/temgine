import { renderOrder, formatPriceCents } from '../templates'
import { clear } from './cart'

export const POLL_MAX = 5
export const POLL_MS = 3000

/** Timer über ein Objekt, damit Tests ihn ersetzen können. */
export const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }

const TEXT = {
  noRef: 'Keine Bestellung angegeben.',
  failed: 'Die Zahlung konnte nicht abgeschlossen werden. Es wurde nichts berechnet. Bitte versuchen Sie es erneut.',
  error: 'Der Bestellstatus konnte nicht abgerufen werden. Bitte laden Sie die Seite neu.',
  unknown: 'Diese Bestellung wurde nicht gefunden.',
  pending: 'Wir prüfen deine Zahlung…',
  slow: 'Die Zahlung wurde noch nicht bestätigt. Bitte lade die Seite später neu oder starte die Bestellung in der Kasse erneut.',
}

/** Füllt el; liefert eine Funktion, die das Nachfragen abbricht. */
export function hydrateOrder(el) {
  let timer = null
  let stopped = false
  const show = (view) => { el.innerHTML = renderOrder(view) }
  const bad = (message) => show({ tone: 'error', message, checkoutLink: true })
  const stop = () => { stopped = true; if (timer != null) timers.clear(timer) }

  const ref = new URLSearchParams(window.location.search).get('ref') || ''
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(ref)) { bad(TEXT.noRef); return stop }

  async function check(attempt) {
    if (stopped) return
    let status
    let data
    try {
      const res = await fetch(`/api/shop/public/orders/${encodeURIComponent(ref)}`)
      status = res.status
      data = res.ok ? await res.json() : null
    } catch (_) {
      if (!stopped) bad(TEXT.error)
      return
    }
    if (stopped) return
    if (!data) { bad(status === 404 ? TEXT.unknown : TEXT.error); return }
    const st = String(data.status || '').toUpperCase()
    if (data.paid || st === 'PAID' || st === 'SHIPPED') {
      clear()
      show({ tone: 'success', message: 'Vielen Dank für deine Bestellung! Die Zahlung ist eingegangen.', reference: data.reference, amount: formatPriceCents(data.totalCents), shopLink: true })
    } else if (st === 'PENDING') {
      if (attempt >= POLL_MAX) { show({ tone: 'hint', message: TEXT.slow, reference: data.reference, checkoutLink: true }); return }
      show({ tone: 'hint', message: TEXT.pending, reference: data.reference })
      timer = timers.set(() => check(attempt + 1), POLL_MS)
    } else {
      bad(TEXT.failed)
    }
  }

  check(0)
  return stop
}
