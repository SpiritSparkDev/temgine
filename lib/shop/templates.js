import Mustache from 'mustache'

/** Cent -> '24,90 €' (de-DE). Ungültige Werte -> ''. */
export function formatPriceCents(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const abs = Math.abs(Math.round(cents))
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const rest = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${euros},${rest} €`
}

// Alle Werte nur mit {{ }} (escaped) – nie {{{ }}}.
export const PRODUCTS_TEMPLATE = `
<div class="shop-list">
  {{#hasCategories}}
  <div class="shop-filter" role="group" aria-label="Kategorie">
    <button type="button" class="shop-filter-btn{{#allActive}} is-active{{/allActive}}" data-shop-category="">Alle</button>
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
        {{#fromPrice}}<p class="shop-price">ab {{fromPrice}}</p>{{/fromPrice}}
        {{^fromPrice}}<p class="shop-unavailable">Derzeit nicht bestellbar</p>{{/fromPrice}}
      </a>
    </article>
    {{/products}}
  </div>
  {{/hasProducts}}
  {{^hasProducts}}<p class="shop-empty">Keine Produkte gefunden.</p>{{/hasProducts}}
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
    <label class="shop-label" for="shop-format">Ausführung</label>
    <select id="shop-format" class="shop-format" data-shop-format>
      {{#formats}}
      <option value="{{sku}}" data-price="{{price}}"{{^orderable}} disabled{{/orderable}}{{#selected}} selected{{/selected}}>{{label}} – {{price}}{{^orderable}} (nicht verfügbar){{/orderable}}</option>
      {{/formats}}
    </select>
    {{/hasFormats}}
    <p class="shop-price"><strong data-shop-price>{{price}}</strong> <small>inkl. MwSt. zzgl. Versand</small></p>
    <button type="button" class="shop-add" data-shop-add{{^canOrder}} disabled{{/canOrder}}>In den Warenkorb</button>
    {{^canOrder}}<p class="shop-unavailable">Dieses Produkt ist derzeit nicht bestellbar.</p>{{/canOrder}}
    <p class="shop-added" data-shop-added hidden>Zum Warenkorb hinzugefügt.</p>
  </div>
</article>`

export function buildListView(data, activeCategory = '') {
  const products = (data?.products || []).map((p) => ({
    title: p.title,
    category: p.category || '',
    subtitle: p.subtitle || '',
    shortText: p.shortText || '',
    image: (p.images && p.images[0]) || '',
    url: `/shop/${encodeURIComponent(p.slug)}`,
    fromPrice: p.fromPriceCents == null ? '' : formatPriceCents(p.fromPriceCents),
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

export function buildProductView(product) {
  const formats = (product.formats || []).map((f) => ({
    sku: f.sku,
    label: f.label,
    price: formatPriceCents(f.priceCents),
    orderable: !!f.orderable,
  }))
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
    price: first ? first.price : (product.fromPriceCents == null ? '' : formatPriceCents(product.fromPriceCents)),
  }
}

export const renderProductList = (data, activeCategory = '') =>
  Mustache.render(PRODUCTS_TEMPLATE, buildListView(data, activeCategory))

export const renderProductDetail = (product) =>
  Mustache.render(PRODUCT_TEMPLATE, buildProductView(product))

// ---- Warenkorb / Kasse (Phase 2) ----

export const CART_TEMPLATE = `
<div class="shop-cart">
  {{#empty}}
  <p class="shop-empty">Ihr Warenkorb ist leer.</p>
  <p><a class="shop-link" href="/shop">Weiter einkaufen</a></p>
  {{/empty}}
  {{^empty}}
  {{#message}}<p class="shop-error" role="alert">{{message}}</p>{{/message}}
  <div class="shop-rows">
    {{#lines}}
    <div class="shop-row{{#error}} has-error{{/error}}" data-shop-line="{{sku}}">
      <div class="shop-row-main">
        <strong class="shop-row-title">{{title}}</strong>
        {{#label}}<span class="shop-row-label">{{label}}</span>{{/label}}
        {{#error}}<p class="shop-field-error" role="alert">{{error}}</p>{{/error}}
      </div>
      {{^error}}<div class="shop-row-price">{{unitPrice}}</div>{{/error}}
      <div class="shop-row-qty">
        <label class="shop-label-inline" for="qty-{{sku}}">Menge</label>
        <input id="qty-{{sku}}" class="shop-qty" type="number" min="1" max="99" step="1" value="{{qty}}" data-shop-qty="{{sku}}">
      </div>
      {{^error}}<div class="shop-row-total">{{linePrice}}</div>{{/error}}
      <button type="button" class="shop-remove" data-shop-remove="{{sku}}">Entfernen</button>
    </div>
    {{/lines}}
  </div>
  {{#subtotal}}
  <p class="shop-sum"><span>Zwischensumme</span> <strong>{{subtotal}}</strong> <small>inkl. MwSt.</small></p>
  <p class="shop-hint">Versandkosten werden in der Kasse berechnet.</p>
  {{/subtotal}}
  {{^hasError}}<p><a class="shop-add shop-link-btn" href="/kasse">Zur Kasse</a></p>{{/hasError}}
  {{/empty}}
</div>`

export function buildCartView(data, items = [], failedSku = '', message = '') {
  let lines
  if (data) {
    lines = (data.lines || []).map((l) => ({
      sku: l.sku, title: l.title, label: l.label || '', qty: l.qty,
      unitPrice: formatPriceCents(l.unitCents), linePrice: formatPriceCents(l.lineCents),
    }))
  } else {
    lines = items.map((i) => ({
      sku: i.sku, title: i.sku, label: '', qty: i.qty,
      error: i.sku === failedSku ? message : '',
    }))
  }
  return {
    empty: lines.length === 0,
    lines,
    subtotal: data ? formatPriceCents(data.subtotalCents) : '',
    hasError: !data,
    message: data ? '' : (failedSku ? '' : message),
  }
}

export const renderCart = (view) => Mustache.render(CART_TEMPLATE, view)

export const CHECKOUT_TEMPLATE = `
<form class="shop-checkout" novalidate data-shop-form>
  <p class="shop-error" role="alert" data-shop-formerror hidden></p>
  <fieldset class="shop-fieldset">
    <legend>Kontakt</legend>
    <div class="shop-field">
      <label for="co-email">E-Mail</label>
      <input id="co-email" name="email" type="email" autocomplete="email" maxlength="200" required>
      <span class="shop-field-error" data-error-for="email" hidden></span>
    </div>
  </fieldset>
  {{#groups}}
  <fieldset class="shop-fieldset"{{#optional}} data-shop-shipping-group hidden{{/optional}}>
    <legend>{{legend}}</legend>
    {{#fields}}
    <div class="shop-field">
      <label for="co-{{id}}">{{label}}</label>
      {{#isSelect}}
      <select id="co-{{id}}" name="{{name}}" autocomplete="{{autocomplete}}">
        {{#options}}<option value="{{code}}"{{#selected}} selected{{/selected}}>{{name}}</option>{{/options}}
      </select>
      {{/isSelect}}
      {{^isSelect}}
      <input id="co-{{id}}" name="{{name}}" type="text" autocomplete="{{autocomplete}}" maxlength="{{max}}">
      {{/isSelect}}
      <span class="shop-field-error" data-error-for="{{name}}" hidden></span>
    </div>
    {{/fields}}
  </fieldset>
  {{#toggleAfter}}
  <div class="shop-check">
    <input id="co-diff" type="checkbox" data-shop-diff>
    <label for="co-diff">Abweichende Lieferadresse</label>
  </div>
  {{/toggleAfter}}
  {{/groups}}
  <section class="shop-summary" aria-live="polite" data-shop-summary></section>
  <div class="shop-check">
    <input id="co-terms" name="acceptTerms" type="checkbox">
    <label for="co-terms">[PLATZHALTER – Rechtstext folgt] Ich akzeptiere die <a href="/agb" target="_blank" rel="noopener">AGB</a> und habe die <a href="/widerruf" target="_blank" rel="noopener">Widerrufsbelehrung</a> zur Kenntnis genommen.</label>
    <span class="shop-field-error" data-error-for="acceptTerms" hidden></span>
  </div>
  <div class="shop-check" data-shop-waiver hidden>
    <input id="co-waiver" name="acceptWaiver" type="checkbox">
    <label for="co-waiver">[PLATZHALTER – Rechtstext folgt] Ich stimme ausdrücklich zu, dass die Ausführung bei digitalen Inhalten vor Ablauf der Widerrufsfrist beginnt, und nehme zur Kenntnis, dass mein Widerrufsrecht damit erlischt.</label>
    <span class="shop-field-error" data-error-for="acceptWaiver" hidden></span>
  </div>
  <button type="submit" class="shop-add" data-shop-submit disabled>Zahlungspflichtig bestellen</button>
  <p class="shop-success" role="status" data-shop-done hidden></p>
</form>`

const ADDR_FIELDS = [
  ['name', 'Name', 'name', 100], ['street', 'Straße und Hausnummer', 'street-address', 150],
  ['zip', 'PLZ', 'postal-code', 20], ['city', 'Ort', 'address-level2', 100],
]

export function buildCheckoutView(countries = []) {
  const hasDE = countries.some((c) => c.code === 'DE')
  const group = (prefix, legend, optional) => ({
    legend, optional, toggleAfter: prefix === 'billing',
    fields: [
      ...ADDR_FIELDS.map(([k, label, ac, max]) => ({ id: `${prefix}-${k}`, name: `${prefix}.${k}`, label, autocomplete: `${prefix} ${ac}`, max })),
      { id: `${prefix}-country`, name: `${prefix}.country`, label: 'Land', isSelect: true, autocomplete: `${prefix} country`,
        options: countries.map((c, i) => ({ code: c.code, name: c.name, selected: hasDE ? c.code === 'DE' : i === 0 })) },
    ],
  })
  return { groups: [group('billing', 'Rechnungsadresse', false), group('shipping', 'Lieferadresse', true)] }
}

export const renderCheckoutForm = (countries) => Mustache.render(CHECKOUT_TEMPLATE, buildCheckoutView(countries))

export const SUMMARY_TEMPLATE = `
<h2 class="shop-summary-title">Bestellübersicht</h2>
<ul class="shop-summary-lines">
  {{#lines}}<li><span>{{qty}} × {{title}}{{#label}} ({{label}}){{/label}}</span> <span>{{linePrice}}</span></li>{{/lines}}
</ul>
<p class="shop-sum"><span>Zwischensumme</span> <strong>{{subtotal}}</strong></p>
{{#shipping}}<p class="shop-sum"><span>Versand</span> <strong>{{shipping}}</strong></p>{{/shipping}}
{{#shippingError}}<p class="shop-error" role="alert">{{shippingError}}</p>{{/shippingError}}
{{#total}}<p class="shop-sum shop-total"><span>Gesamtsumme</span> <strong>{{total}}</strong> <small>inkl. MwSt.</small></p>{{/total}}`

export function buildSummaryView(data) {
  return {
    lines: (data.lines || []).map((l) => ({ qty: l.qty, title: l.title, label: l.label || '', linePrice: formatPriceCents(l.lineCents) })),
    subtotal: formatPriceCents(data.subtotalCents),
    shipping: data.shippingCents == null ? '' : formatPriceCents(data.shippingCents),
    shippingError: data.shippingError ? (data.shippingError.message || 'Versand für dieses Land nicht möglich.') : '',
    total: data.totalCents == null ? '' : formatPriceCents(data.totalCents),
  }
}

export const renderSummary = (data) => Mustache.render(SUMMARY_TEMPLATE, buildSummaryView(data))
