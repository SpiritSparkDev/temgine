// Block shop-return (Seite rueckgabe): Formular fuer Rueckgabe-Anfragen, POST /api/shop/public/returns.
import { t } from '../i18n'
import { esc, localeOf, api } from './ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SKU_RE = /^[A-Za-z0-9._-]{1,40}$/

/** "ABC-1:2, DEF-3" -> [{ sku, qty }] oder null bei ungueltiger Eingabe. */
export function parseItems(text) {
  const parts = String(text || '').split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
  const items = []
  for (const p of parts) {
    const [sku, q = '1'] = p.split(':').map((s) => s.trim())
    const qty = Number(q)
    if (!SKU_RE.test(sku) || !Number.isInteger(qty) || qty < 1 || qty > 99) return null
    items.push({ sku, qty })
  }
  return items.length > 50 ? null : items
}

const field = (id, label, input, hint) => `<div class="shop-field"><label for="${id}">${esc(label)}</label>${input}${hint ? `<span class="shop-hint">${esc(hint)}</span>` : ''}<span class="shop-field-error" data-err="${id}" hidden></span></div>`

export function hydrateReturn(el) {
  if (!el) return
  const locale = localeOf(el)
  const L = (k, v) => t(locale, k, v)
  const ref = new URLSearchParams(window.location.search).get('ref') || ''
  el.innerHTML = `<form class="shop-checkout shop-return" novalidate>
<h2>${esc(L('account.returnTitle'))}</h2>
${field('rt-ref', L('account.returnReference'), `<input id="rt-ref" name="reference" maxlength="60" required value="${esc(ref.slice(0, 60))}">`)}
${field('rt-email', L('account.returnEmail'), '<input id="rt-email" name="email" type="email" maxlength="200" required autocomplete="email">')}
${field('rt-items', L('account.returnItems'), '<input id="rt-items" name="items">', L('account.returnItemsHint'))}
${field('rt-reason', L('account.returnReason'), '<textarea id="rt-reason" name="reason" rows="5" maxlength="2000" required></textarea>', L('account.returnReasonHint'))}
<p class="shop-error" data-return-error hidden></p>
<p class="shop-success" data-return-ok hidden>${esc(L('account.returnSent'))}</p>
<button type="submit" class="shop-add">${esc(L('account.returnSubmit'))}</button>
</form>`
  const form = el.querySelector('form')
  const errBox = el.querySelector('[data-return-error]')
  const okBox = el.querySelector('[data-return-ok]')
  const setErr = (id, text) => {
    const s = el.querySelector(`[data-err="${id}"]`)
    s.textContent = text || ''
    s.hidden = !text
    const input = el.querySelector(`#${id}`)
    if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false')
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    okBox.hidden = true
    errBox.hidden = true
    const v = (id) => el.querySelector(`#${id}`).value.trim()
    const items = parseItems(v('rt-items'))
    const problems = {
      'rt-ref': v('rt-ref') ? '' : L('account.returnErr.ref'),
      'rt-email': EMAIL_RE.test(v('rt-email')) ? '' : L('account.returnErr.email'),
      'rt-items': items === null ? L('account.returnErr.items') : '',
      'rt-reason': v('rt-reason').length >= 5 && v('rt-reason').length <= 2000 ? '' : L('account.returnErr.reason'),
    }
    for (const [id, text] of Object.entries(problems)) setErr(id, text)
    if (Object.values(problems).some(Boolean)) return
    const body = { reference: v('rt-ref'), email: v('rt-email'), reason: v('rt-reason') }
    if (items.length) body.items = items
    let r
    try {
      r = await api('/api/shop/public/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch (_) {
      errBox.textContent = L('account.returnErr.generic')
      errBox.hidden = false
      return
    }
    if (r.ok) { form.reset(); okBox.hidden = false; return }
    const code = r.body && r.body.code
    const reasonErr = r.body && r.body.details && r.body.details.fields && r.body.details.fields.reason
    if (reasonErr) setErr('rt-reason', L('account.returnErr.reason'))
    else {
      const key = `account.returnErr.${code}`
      errBox.textContent = r.status === 404 ? L('account.returnErr.NOT_FOUND') : (t(locale, key) !== key ? L(key) : L('account.returnErr.generic'))
      errBox.hidden = false
    }
  })
}
