import Mustache from 'mustache'
import { t, normalizeLocale } from './i18n'
import { formatMoney } from './money'

// Texte: [[schluessel]] in den Templates wird vor dem Rendern durch die HTML-escapte Übersetzung ersetzt.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c])
const withTexts = (src, locale) => src.replace(/\[\[([\w.]+)\]\]/g, (_, k) => esc(t(locale, k)))
const render = (src, view, locale) => Mustache.render(withTexts(src, locale), view)

/** Cent -> '24,90 €' (de) bzw. '€24.90' (en) in der Shop-Währung. Ungültige Werte -> ''. */
export function formatPriceCents(cents, currency = 'EUR', locale = 'de') {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const loc = normalizeLocale(locale)
  try {
    return formatMoney(Math.round(cents), currency, loc).replace(/ /g, ' ')
  } catch (_) {
    return formatMoney(Math.round(cents), 'EUR', loc).replace(/ /g, ' ')
  }
}

const ctx = (opts = {}) => ({ locale: normalizeLocale(opts.locale), currency: opts.currency || 'EUR' })
const money = (cents, c) => formatPriceCents(cents, c.currency, c.locale)
/** 700 -> '7', 1950 -> '19,5' (de) */
const rate = (bp, locale) => String(bp / 100).replace('.', locale === 'en' ? '.' : ',')

// Alle Werte nur mit {{ }} (escaped) – nie {{{ }}}.
export const PRODUCTS_TEMPLATE = `
<div class="shop-list">
  {{#hasCategories}}
  <div class="shop-filter" role="group" aria-label="[[shop.category]]">
    <button type="button" class="shop-filter-btn{{#allActive}} is-active{{/allActive}}" data-shop-category="">[[shop.all]]</button>
    {{#categories}}
    <button type="button" class="shop-filter-btn{{#active}} is-active{{/active}}" data-shop-category="{{name}}">{{name}}</button>
    {{/categories}}
  </div>
  {{/hasCategories}}
  {{#hasProducts}}
  <div class="shop-grid">
    {{#products}}
    <article class="shop-card">
      <a class="shop-card-link" href="{{url}}">
        {{#image}}<img class="shop-card-image" src="{{image}}" alt="{{title}}" loading="lazy">{{/image}}
        {{#category}}<span class="shop-card-category">{{category}}</span>{{/category}}
        <h3 class="shop-card-title">{{title}}</h3>
        {{#subtitle}}<p class="shop-card-subtitle">{{subtitle}}</p>{{/subtitle}}
        {{#shortText}}<p class="shop-card-text">{{shortText}}</p>{{/shortText}}
        {{#fromPrice}}<p class="shop-price">[[shop.from]] {{fromPrice}} <small>[[shop.vatShipping]]</small></p>{{/fromPrice}}
        {{^fromPrice}}<p class="shop-unavailable">[[shop.unavailableNow]]</p>{{/fromPrice}}
      </a>
    </article>
    {{/products}}
  </div>
  {{/hasProducts}}
  {{^hasProducts}}<p class="shop-empty">[[shop.noProducts]]</p>{{/hasProducts}}
</div>`

export const PRODUCT_TEMPLATE = `
<article class="shop-product">
  <div class="shop-product-media">
    {{#image}}<img class="shop-product-image" src="{{image}}" alt="{{title}}">{{/image}}
    {{#hasThumbs}}
    <div class="shop-thumbs">
      {{#thumbs}}<img class="shop-thumb" src="{{.}}" alt="" loading="lazy">{{/thumbs}}
    </div>
    {{/hasThumbs}}
  </div>
  <div class="shop-product-info">
    {{#category}}<span class="shop-card-category">{{category}}</span>{{/category}}
    <h1 class="shop-product-title">{{title}}</h1>
    {{#subtitle}}<p class="shop-product-subtitle">{{subtitle}}</p>{{/subtitle}}
    <div class="shop-product-description">
      {{#paragraphs}}<p>{{.}}</p>{{/paragraphs}}
    </div>
    {{#hasFormats}}
    <label class="shop-label" for="shop-format">[[shop.format]]</label>
    <select id="shop-format" class="shop-format" data-shop-format>
      {{#formats}}
      <option value="{{sku}}" data-price="{{price}}"{{^orderable}} disabled{{/orderable}}{{#selected}} selected{{/selected}}>{{label}} – {{price}}{{^orderable}} [[shop.unavailableParen]]{{/orderable}}</option>
      {{/formats}}
    </select>
    {{#formats}}
    {{#hasInfo}}
    <div class="shop-format-info" data-shop-info="{{sku}}"{{^selected}} hidden{{/selected}}>
      {{#hasBundle}}
      <div class="shop-bundle">
        <strong>[[shop.bundle.title]]</strong>
        <ul>{{#bundle}}<li>{{qty}} × {{title}}{{#label}} ({{label}}){{/label}}</li>{{/bundle}}</ul>
      </div>
      {{/hasBundle}}
      {{#hasTiers}}
      <table class="shop-tiers">
        <caption>[[shop.tiers.title]]</caption>
        <thead><tr><th scope="col">[[shop.tiers.qty]]</th><th scope="col">[[shop.tiers.price]]</th></tr></thead>
        <tbody>{{#tiers}}<tr><td>{{qty}}</td><td>{{price}}</td></tr>{{/tiers}}</tbody>
      </table>
      {{/hasTiers}}
    </div>
    {{/hasInfo}}
    {{/formats}}
    {{/hasFormats}}
    <label class="shop-label" for="shop-product-qty">[[shop.qty]]</label>
    <input id="shop-product-qty" class="shop-qty" type="number" min="1" max="99" step="1" value="1" data-shop-product-qty{{^canOrder}} disabled{{/canOrder}}>
    <p class="shop-price"><strong data-shop-price>{{price}}</strong> <small>[[shop.vatShipping]]</small> <small><a href="/versand-zahlung">[[shop.shippingPayment]]</a></small></p>
    <button type="button" class="shop-add" data-shop-add{{^canOrder}} disabled{{/canOrder}}>[[shop.addToCart]]</button>
    {{^canOrder}}<p class="shop-unavailable">[[shop.notOrderable]]</p>{{/canOrder}}
    <p class="shop-added" data-shop-added hidden>[[shop.added]]</p>
    <div class="shop-extras" data-shop-product-extras></div>
  </div>
</article>`

export function buildListView(data, activeCategory = '', opts = {}) {
  const c = ctx(opts)
  const products = (data?.products || []).map((p) => ({
    title: p.title,
    category: p.category || '',
    subtitle: p.subtitle || '',
    shortText: p.shortText || '',
    image: (p.images && p.images[0]) || '',
    url: `/shop/${encodeURIComponent(p.slug)}`,
    fromPrice: p.fromPriceCents == null ? '' : money(p.fromPriceCents, c),
  }))
  const categories = (data?.categories || []).map((name) => ({ name, active: name === activeCategory }))
  return {
    products,
    hasProducts: products.length > 0,
    categories,
    hasCategories: categories.length > 0,
    allActive: !activeCategory,
  }
}

/** Stückpreis bei Menge qty: höchste Staffel mit minQty <= qty, sonst Basispreis. */
export function unitPriceFor(format, qty) {
  let price = format.priceCents
  let best = 0
  for (const tier of format.tiers || []) {
    if (qty >= tier.minQty && tier.minQty > best) { best = tier.minQty; price = tier.priceCents }
  }
  return price
}

export function buildProductView(product, opts = {}) {
  const c = ctx(opts)
  const formats = (product.formats || []).map((f) => {
    const tiers = (f.tiers || []).length
      ? [{ qty: t(c.locale, 'shop.tiers.from', { qty: 1 }), price: money(f.priceCents, c) },
        ...f.tiers.map((x) => ({ qty: t(c.locale, 'shop.tiers.from', { qty: x.minQty }), price: money(x.priceCents, c) }))]
      : []
    const bundle = (f.bundle || []).map((b) => ({ qty: b.qty, title: b.title, label: b.label || '' }))
    return {
      sku: f.sku,
      label: f.label,
      price: money(f.priceCents, c),
      orderable: !!f.orderable,
      tiers, hasTiers: tiers.length > 0,
      bundle, hasBundle: bundle.length > 0,
      hasInfo: tiers.length > 0 || bundle.length > 0,
    }
  })
  const first = formats.find((f) => f.orderable)
  if (first) first.selected = true
  const images = product.images || []
  return {
    title: product.title,
    category: product.category || '',
    subtitle: product.subtitle || '',
    image: images[0] || '',
    thumbs: images.slice(1),
    hasThumbs: images.length > 1,
    paragraphs: String(product.description || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
    formats,
    hasFormats: formats.length > 0,
    canOrder: !!first,
    price: first ? first.price : (product.fromPriceCents == null ? '' : money(product.fromPriceCents, c)),
  }
}

export const renderProductList = (data, activeCategory = '', opts = {}) =>
  render(PRODUCTS_TEMPLATE, buildListView(data, activeCategory, opts), ctx(opts).locale)

export const renderProductDetail = (product, opts = {}) =>
  render(PRODUCT_TEMPLATE, buildProductView(product, opts), ctx(opts).locale)

// ---- Warenkorb / Kasse (Phase 2) ----

export const CART_TEMPLATE = `
<div class="shop-cart">
  {{#empty}}
  <p class="shop-empty">[[shop.cart.empty]]</p>
  <p><a class="shop-link" href="/shop">[[shop.cart.continue]]</a></p>
  {{/empty}}
  {{^empty}}
  {{#message}}<p class="shop-error" role="alert">{{message}}</p>{{/message}}
  <div class="shop-rows">
    {{#lines}}
    <div class="shop-row{{#error}} has-error{{/error}}" data-shop-line="{{sku}}">
      <div class="shop-row-main">
        <strong class="shop-row-title">{{title}}</strong>
        {{#label}}<span class="shop-row-label">{{label}}</span>{{/label}}
        {{#hasBundle}}<ul class="shop-bundle-list">{{#bundle}}<li>{{qty}} × {{title}}{{#label}} ({{label}}){{/label}}</li>{{/bundle}}</ul>{{/hasBundle}}
        {{#error}}<p class="shop-field-error" role="alert">{{error}}</p>{{/error}}
      </div>
      {{^error}}<div class="shop-row-price">{{unitPrice}}</div>{{/error}}
      <div class="shop-row-qty">
        <label class="shop-label-inline" for="qty-{{sku}}">[[shop.qty]]</label>
        <input id="qty-{{sku}}" class="shop-qty" type="number" min="1" max="99" step="1" value="{{qty}}" data-shop-qty="{{sku}}">
      </div>
      {{^error}}<div class="shop-row-total">{{linePrice}}</div>{{/error}}
      <button type="button" class="shop-remove" data-shop-remove="{{sku}}">[[shop.cart.remove]]</button>
    </div>
    {{/lines}}
  </div>
  {{#subtotal}}
  <div class="shop-coupon">
    {{#couponCode}}
    <p class="shop-coupon-applied">[[shop.coupon.label]]: <strong>{{couponCode}}</strong> <button type="button" class="shop-remove" data-shop-coupon-remove>[[shop.coupon.remove]]</button></p>
    {{/couponCode}}
    {{^couponCode}}
    <label class="shop-label-inline" for="shop-coupon">[[shop.coupon.label]]</label>
    <input id="shop-coupon" class="shop-coupon-input" type="text" maxlength="32" autocomplete="off" data-shop-coupon-input>
    <button type="button" class="shop-remove" data-shop-coupon-apply>[[shop.coupon.apply]]</button>
    {{/couponCode}}
    {{#couponMessage}}<p class="shop-field-error" role="alert" data-shop-coupon-message>{{couponMessage}}</p>{{/couponMessage}}
  </div>
  <p class="shop-sum"><span>[[shop.cart.subtotal]]</span> <strong>{{subtotal}}</strong> <small>[[shop.inclVat]]</small></p>
  {{#discount}}<p class="shop-sum shop-discount"><span>[[shop.coupon.discount]]{{#couponCode}} ({{couponCode}}){{/couponCode}}</span> <strong>{{discount}}</strong></p>{{/discount}}
  {{#shipping}}<p class="shop-sum"><span>[[shop.shipping]]</span> <strong>{{shipping}}</strong>{{#shippingVat}} <small>{{shippingVat}}</small>{{/shippingVat}}</p>{{/shipping}}
  {{#freeShipHint}}<p class="shop-hint shop-freeship" data-shop-freeship>{{freeShipHint}}</p>{{/freeShipHint}}
  {{#total}}<p class="shop-sum shop-total"><span>[[shop.cart.total]]</span> <strong>{{total}}</strong> <small>[[shop.inclVat]]</small></p>{{/total}}
  {{^shipping}}<p class="shop-hint">[[shop.cart.shippingHint]] <a href="/versand-zahlung">[[shop.shippingPayment]]</a></p>{{/shipping}}
  {{/subtotal}}
  {{^hasError}}<p><a class="shop-add shop-link-btn" href="/kasse">[[shop.cart.toCheckout]]</a></p>
  <div class="shop-extras" data-shop-cart-extras></div>{{/hasError}}
  {{/empty}}
</div>`

/** Hinweistext "noch X bis versandkostenfrei" bzw. "versandkostenfrei" aus data.freeShipping. */
function freeShipText(data, c) {
  const fs = data.freeShipping
  if (!fs || typeof fs.remainingCents !== 'number') return ''
  return fs.remainingCents > 0
    ? t(c.locale, 'shop.freeShip.remaining', { amount: money(fs.remainingCents, c) })
    : t(c.locale, 'shop.freeShip.reached')
}

/** Gemeinsame Beträge von Warenkorb und Kassen-Zusammenfassung. */
function totalsView(data, c) {
  const cur = { ...c, currency: data.currency || c.currency }
  return {
    cur,
    couponCode: data.coupon && data.coupon.code ? data.coupon.code : '',
    discount: data.discountCents > 0 ? money(-data.discountCents, cur) : '',
    shippingVat: data.shippingTaxBp == null ? '' : t(c.locale, 'shop.vatIncl', { rate: rate(data.shippingTaxBp, c.locale) }),
    freeShipHint: freeShipText(data, cur),
  }
}

/** opts: { locale, currency, couponMessage } */
export function buildCartView(data, items = [], failedSku = '', message = '', opts = {}) {
  const c = ctx(opts)
  let lines
  let extra = {}
  if (data) {
    const tv = totalsView(data, c)
    lines = (data.lines || []).map((l) => {
      const bundle = (l.bundle || []).map((b) => ({ qty: b.qty, title: b.title, label: b.label || '' }))
      return {
        sku: l.sku, title: l.title, label: l.label || '', qty: l.qty,
        unitPrice: money(l.unitCents, tv.cur), linePrice: money(l.lineCents, tv.cur),
        bundle, hasBundle: bundle.length > 0,
      }
    })
    extra = {
      subtotal: money(data.subtotalCents, tv.cur),
      couponCode: tv.couponCode, discount: tv.discount,
      shipping: data.shippingCents == null ? '' : (data.shippingCents === 0 ? t(c.locale, 'shop.free') : money(data.shippingCents, tv.cur)),
      shippingVat: data.shippingCents ? tv.shippingVat : '',
      freeShipHint: tv.freeShipHint,
      total: data.totalCents == null ? '' : money(data.totalCents, tv.cur),
      couponMessage: opts.couponMessage || '',
    }
  } else {
    lines = items.map((i) => ({
      sku: i.sku, title: i.sku, label: '', qty: i.qty,
      error: i.sku === failedSku ? message : '',
    }))
  }
  return {
    empty: lines.length === 0,
    lines,
    subtotal: '', // bei Fehlern keine Summen; mit Daten durch extra überschrieben
    hasError: !data,
    message: data ? '' : (failedSku ? '' : message),
    ...extra,
  }
}

export const renderCart = (view, opts = {}) => render(CART_TEMPLATE, view, ctx(opts).locale)

export const CHECKOUT_TEMPLATE = `
<form class="shop-checkout" novalidate data-shop-form>
  <p class="shop-error" role="alert" id="co-formerror" data-shop-formerror hidden></p>
  <fieldset class="shop-fieldset">
    <legend>[[shop.checkout.contact]]</legend>
    <div class="shop-field">
      <label for="co-email">[[shop.checkout.email]]</label>
      <input id="co-email" name="email" type="email" autocomplete="email" maxlength="200" required aria-required="true">
      <span class="shop-field-error" id="co-err-email" data-error-for="email" hidden></span>
    </div>
  </fieldset>
  {{#groups}}
  <fieldset class="shop-fieldset"{{#optional}} data-shop-shipping-group hidden{{/optional}}>
    <legend>{{legend}}</legend>
    {{#fields}}
    <div class="shop-field">
      <label for="co-{{id}}">{{label}}</label>
      {{#isSelect}}
      <select id="co-{{id}}" name="{{name}}" autocomplete="{{autocomplete}}"{{#required}} required aria-required="true"{{/required}}>
        {{#options}}<option value="{{code}}"{{#selected}} selected{{/selected}}>{{name}}</option>{{/options}}
      </select>
      {{/isSelect}}
      {{^isSelect}}
      <input id="co-{{id}}" name="{{name}}" type="text" autocomplete="{{autocomplete}}" maxlength="{{max}}"{{#required}} required aria-required="true"{{/required}}>
      {{/isSelect}}
      <span class="shop-field-error" id="co-err-{{id}}" data-error-for="{{name}}" hidden></span>
    </div>
    {{/fields}}
  </fieldset>
  {{#toggleAfter}}
  <div class="shop-check">
    <input id="co-diff" type="checkbox" data-shop-diff>
    <label for="co-diff">[[shop.checkout.diff]]</label>
  </div>
  {{/toggleAfter}}
  {{/groups}}
  <section class="shop-summary" aria-live="polite" data-shop-summary></section>
  <p class="shop-hint">[[shop.checkout.hint]] <a href="/versand-zahlung" target="_blank" rel="noopener">[[shop.shippingPayment]]</a>.</p>
  <div class="shop-check">
    <input id="co-terms" name="acceptTerms" type="checkbox" required aria-required="true">
    <label for="co-terms">{{termsBefore}}<a href="/agb" target="_blank" rel="noopener">{{termsAgb}}</a>{{termsMid}}<a href="/widerruf" target="_blank" rel="noopener">{{termsWiderruf}}</a>{{termsAfter}}</label>
    <span class="shop-field-error" id="co-err-acceptTerms" data-error-for="acceptTerms" hidden></span>
  </div>
  <div class="shop-check" data-shop-waiver hidden>
    <input id="co-waiver" name="acceptWaiver" type="checkbox">
    <label for="co-waiver">[[shop.checkout.waiver]]</label>
    <span class="shop-field-error" id="co-err-acceptWaiver" data-error-for="acceptWaiver" hidden></span>
  </div>
  {{#showProviders}}
  <fieldset class="shop-fieldset" data-shop-providers>
    <legend>[[shop.checkout.payment]]</legend>
    {{#providers}}
    <div class="shop-check">
      <input id="co-pay-{{id}}" type="radio" name="provider" value="{{id}}"{{#checked}} checked{{/checked}}>
      <label for="co-pay-{{id}}">{{label}}</label>
    </div>
    {{/providers}}
  </fieldset>
  {{/showProviders}}
  {{^hasProviders}}<p class="shop-error" role="alert" data-shop-noprovider>[[shop.checkout.noProvider]]</p>{{/hasProviders}}
  <button type="submit" class="shop-add" data-shop-submit disabled>[[shop.checkout.submit]]</button>
</form>
<div class="shop-pay" data-shop-pay hidden>
  <p class="shop-success" role="status" data-shop-done></p>
  <div id="shop-sumup-card" data-shop-card hidden></div>
  <p class="shop-error" role="alert" data-shop-payerror hidden></p>
  <button type="button" class="shop-add" data-shop-retry hidden>[[shop.checkout.retry]]</button>
</div>`

const ADDR_FIELDS = [
  ['name', 'shop.checkout.name', 'name', 100], ['street', 'shop.checkout.street', 'street-address', 150],
  ['zip', 'shop.checkout.zip', 'postal-code', 20], ['city', 'shop.checkout.city', 'address-level2', 100],
]

export function buildCheckoutView(countries = [], providers = [], opts = {}) {
  const c = ctx(opts)
  const hasDE = countries.some((x) => x.code === 'DE')
  const group = (prefix, legend, optional) => ({
    legend, optional, toggleAfter: prefix === 'billing',
    fields: [
      ...ADDR_FIELDS.map(([k, key, ac, max]) => ({ required: !optional, id: `${prefix}-${k}`, name: `${prefix}.${k}`, label: t(c.locale, key), autocomplete: `${prefix} ${ac}`, max })),
      { id: `${prefix}-country`, name: `${prefix}.country`, label: t(c.locale, 'shop.checkout.country'), isSelect: true, required: !optional, autocomplete: `${prefix} country`,
        options: countries.map((x, i) => ({ code: x.code, name: x.name, selected: hasDE ? x.code === 'DE' : i === 0 })) },
    ],
  })
  // Die Einwilligungszeile enthält zwei Links ({agb}, {widerruf}); der Text wird an diesen Stellen geteilt.
  const [termsBefore = '', termsMid = '', termsAfter = ''] = t(c.locale, 'shop.checkout.terms').split(/\{agb\}|\{widerruf\}/)
  return {
    groups: [group('billing', t(c.locale, 'shop.checkout.billing'), false), group('shipping', t(c.locale, 'shop.checkout.shippingAddress'), true)],
    hasProviders: providers.length > 0,
    showProviders: providers.length > 1,
    providers: providers.map((p, i) => ({ id: p.id, label: p.label || p.id, checked: i === 0 })),
    termsBefore, termsMid, termsAfter,
    termsAgb: t(c.locale, 'shop.checkout.termsAgb'),
    termsWiderruf: t(c.locale, 'shop.checkout.termsWiderruf'),
  }
}

export const renderCheckoutForm = (countries, providers = [], opts = {}) =>
  render(CHECKOUT_TEMPLATE, buildCheckoutView(countries, providers, opts), ctx(opts).locale)

export const SUMMARY_TEMPLATE = `
<h2 class="shop-summary-title">[[shop.checkout.summary]]</h2>
{{#couponMessage}}<p class="shop-field-error" role="alert" data-shop-coupon-message>{{couponMessage}}</p>{{/couponMessage}}
<ul class="shop-summary-lines">
  {{#lines}}<li><span>{{qty}} × {{title}}{{#label}} ({{label}}){{/label}}</span> <span>{{linePrice}}</span></li>{{/lines}}
</ul>
<p class="shop-sum"><span>[[shop.cart.subtotal]]</span> <strong>{{subtotal}}</strong></p>
{{#discount}}<p class="shop-sum shop-discount"><span>[[shop.coupon.discount]]{{#couponCode}} ({{couponCode}}){{/couponCode}}</span> <strong>{{discount}}</strong></p>{{/discount}}
{{#shipping}}<p class="shop-sum"><span>[[shop.shipping]]</span> <strong>{{shipping}}</strong>{{#shippingVat}} <small>{{shippingVat}}</small>{{/shippingVat}} <small><a href="/versand-zahlung" target="_blank" rel="noopener">[[shop.shippingPayment]]</a></small></p>{{/shipping}}
{{#freeShipHint}}<p class="shop-hint shop-freeship" data-shop-freeship>{{freeShipHint}}</p>{{/freeShipHint}}
{{#shippingError}}<p class="shop-error" role="alert">{{shippingError}}</p>{{/shippingError}}
{{#total}}<p class="shop-sum shop-total"><span>[[shop.cart.total]]</span> <strong>{{total}}</strong> <small>[[shop.inclVat]]</small></p>{{/total}}`

/** opts: { locale, currency, couponMessage } */
export function buildSummaryView(data, opts = {}) {
  const c = ctx(opts)
  const tv = totalsView(data, c)
  return {
    lines: (data.lines || []).map((l) => ({ qty: l.qty, title: l.title, label: l.label || '', linePrice: money(l.lineCents, tv.cur) })),
    subtotal: money(data.subtotalCents, tv.cur),
    couponCode: tv.couponCode,
    discount: tv.discount,
    shipping: data.shippingCents == null ? '' : (data.shippingCents === 0 ? t(c.locale, 'shop.free') : money(data.shippingCents, tv.cur)),
    shippingVat: data.shippingCents ? tv.shippingVat : '',
    freeShipHint: tv.freeShipHint,
    shippingError: data.shippingError ? (data.shippingError.message || '') : '',
    total: data.totalCents == null ? '' : money(data.totalCents, tv.cur),
    couponMessage: opts.couponMessage || '',
  }
}

export const renderSummary = (data, opts = {}) => render(SUMMARY_TEMPLATE, buildSummaryView(data, opts), ctx(opts).locale)

// ---- Bestellstatus (Phase 3) ----

export const ORDER_TEMPLATE = `
<div class="shop-order">
  <p class="shop-{{tone}}" role="{{role}}">{{message}}</p>
  {{#reference}}<p class="shop-order-ref">[[shop.order.ref]]: <strong>{{reference}}</strong></p>{{/reference}}
  {{#amount}}<p class="shop-order-amount">[[shop.order.amount]]: <strong>{{amount}}</strong> <small>[[shop.inclVat]]</small></p>{{/amount}}
  {{#hasDownloads}}
  <section class="shop-downloads">
    <h3>[[shop.order.downloads]]</h3>
    <ul>{{#downloads}}<li><a class="shop-link" href="{{url}}">{{filename}}</a>{{#info}} <small>{{info}}</small>{{/info}}</li>{{/downloads}}</ul>
  </section>
  {{/hasDownloads}}
  {{#invoiceUrl}}<p><a class="shop-link" href="{{invoiceUrl}}">[[shop.order.invoice]]</a></p>{{/invoiceUrl}}
  {{#tracking}}
  <section class="shop-tracking">
    <h3>[[shop.order.tracking]]</h3>
    <p>{{#carrier}}{{carrier}} {{/carrier}}{{#number}}<strong>{{number}}</strong>{{/number}}</p>
    {{#url}}<p><a class="shop-link" href="{{url}}" target="_blank" rel="noopener noreferrer">[[shop.order.trackLink]]</a></p>{{/url}}
  </section>
  {{/tracking}}
  {{#checkoutLink}}<p><a class="shop-link" href="/kasse">[[shop.cart.toCheckout]]</a></p>{{/checkoutLink}}
  {{#shopLink}}<p><a class="shop-link" href="/shop">[[shop.cart.continue]]</a></p>{{/shopLink}}
</div>`

/**
 * view: { tone: 'success'|'hint'|'error', message, reference?, amount?, downloads?: [{ url, filename, info }],
 *         invoiceUrl?, tracking?: { carrier, number, url }, checkoutLink?, shopLink? }
 * Adress-Links (url, invoiceUrl, tracking.url) müssen vom Aufrufer bereits geprüft sein.
 */
export const renderOrder = (view, opts = {}) =>
  render(ORDER_TEMPLATE, { role: view.tone === 'error' ? 'alert' : 'status', hasDownloads: !!(view.downloads && view.downloads.length), ...view }, ctx(opts).locale)
